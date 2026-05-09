package world

import (
	"time"

	"github.com/williamisnotdefined/zelda-proto/server/internal/application/spatial"
	"github.com/williamisnotdefined/zelda-proto/server/internal/domain/enemy"
	"github.com/williamisnotdefined/zelda-proto/server/internal/domain/hazard"
	"github.com/williamisnotdefined/zelda-proto/server/internal/domain/physics"
	"github.com/williamisnotdefined/zelda-proto/server/internal/domain/player"
	domworld "github.com/williamisnotdefined/zelda-proto/server/internal/domain/world"
)

func (w *World) tickHazards(dt time.Duration) {
	// playerHalfDiag pads the hazard hit radius so players whose body overlaps
	// a hazard tile still take damage.
	const playerHalfDiag = 34.0
	const hostileQueryPadding = 64.0
	// Per-tick dedup so overlapping purple clusters only land once per actor.
	purpleHitThisTick := make(map[string]struct{})
	for id, h := range w.hazards {
		expired := h.Tick(dt)
		if h.Kind == hazard.KindGrenade || h.Kind == hazard.KindMolotov {
			if expired {
				delete(w.hazards, id)
				w.hazardIndex.Remove(id)
				w.detonatePlayerExplosive(h, playerHalfDiag)
				w.finishHazardCast(h.SourcePlayerID, h.SourceCastID)
				continue
			}
			w.hazardIndex.Upsert(id, h.X, h.Y)
			continue
		}
		if h.Kind == hazard.KindLandmine {
			if expired {
				w.finishHazardCast(h.SourcePlayerID, h.SourceCastID)
				delete(w.hazards, id)
				w.hazardIndex.Remove(id)
				continue
			}
			if w.landmineTriggered(h, playerHalfDiag) {
				delete(w.hazards, id)
				w.hazardIndex.Remove(id)
				w.detonatePlayerExplosive(h, playerHalfDiag)
				w.finishHazardCast(h.SourcePlayerID, h.SourceCastID)
				continue
			}
			w.hazardIndex.Upsert(id, h.X, h.Y)
			continue
		}
		if h.Kind == hazard.KindLandmineExplosion || h.Kind == hazard.KindMolotovExplosion {
			if expired {
				delete(w.hazards, id)
				w.hazardIndex.Remove(id)
				continue
			}
			w.hazardIndex.Upsert(id, h.X, h.Y)
			continue
		}
		if expired {
			delete(w.hazards, id)
			w.hazardIndex.Remove(id)
			continue
		}
		if h.Speed > 0 {
			w.hazardIndex.Upsert(id, h.X, h.Y)
		}
		effect := hazard.EffectFor(h.Kind)

		w.applyHazardToPlayers(h, effect, playerHalfDiag, purpleHitThisTick)

		if !h.HitsAllActors {
			continue
		}

		w.applyHazardToEnemies(h, hostileQueryPadding)
		w.applyHazardToBosses(h, hostileQueryPadding)
	}
	// Drain fire-line spawn schedule.
	for i := len(w.pendingFireLines) - 1; i >= 0; i-- {
		line := &w.pendingFireLines[i]
		for line.nextSeg <= hazard.FireFieldSegments && !w.now.Before(line.nextSpawn) {
			x := line.x + float64(line.dirX*hazard.FireFieldSpacing*line.nextSeg)
			y := line.y + float64(line.dirY*hazard.FireFieldSpacing*line.nextSeg)
			id := w.cfg.IDs.NewID(string(line.kind))
			h := hazard.NewTinted(id, x, y, line.kind, line.tint)
			w.hazards[id] = h
			w.hazardIndex.Upsert(id, x, y)
			line.nextSeg++
			line.nextSpawn = line.nextSpawn.Add(hazard.FireFieldInterval)
		}
		if line.nextSeg > hazard.FireFieldSegments {
			w.pendingFireLines = append(w.pendingFireLines[:i], w.pendingFireLines[i+1:]...)
		}
	}
}

func (w *World) applyHazardToPlayers(h *hazard.Hazard, effect hazard.Effect, playerHalfDiag float64, purpleHitThisTick map[string]struct{}) {
	w.playerIndex.ForEachInRadius(h.X, h.Y, h.HitRadius+playerHalfDiag, func(id spatial.EntityID) {
		p := w.players[id]
		if p == nil || p.State == player.StateDead || w.isProtected(p) {
			return
		}
		actorKey := playerActorKey(p.ID)
		if !h.MarkHit(actorKey) {
			return
		}
		if !hazardTouchesActor(h.X, h.Y, h.HitRadius, p.X, p.Y, playerHalfDiag) {
			delete(h.HitActorKeys, actorKey)
			return
		}
		if effect == hazard.EffectPurpleBurning {
			if _, dup := purpleHitThisTick[actorKey]; dup {
				return
			}
			purpleHitThisTick[actorKey] = struct{}{}
		}
		wasAlive := p.State != player.StateDead
		p.TakeDamage(h.Damage)
		if wasAlive && p.State == player.StateDead {
			w.awardHazardPlayerKill(h.SourcePlayerID)
		}
		if h.BurningTicks > 0 {
			switch effect {
			case hazard.EffectPurpleBurning:
				p.ApplyPurpleBurning(h.BurningTicks)
			case hazard.EffectBlueBurning:
				p.ApplyBlueBurning(h.BurningTicks)
			default:
				p.ApplyBurning(h.BurningTicks)
			}
		}
	})
}

func (w *World) applyHazardToEnemies(h *hazard.Hazard, queryPadding float64) {
	w.enemyIndex.ForEachInRadius(h.X, h.Y, h.HitRadius+queryPadding, func(id spatial.EntityID) {
		e := w.enemies[id]
		if e == nil || e.State == enemy.StateDead {
			return
		}
		actorKey := enemyActorKey(e.ID)
		if !h.MarkHit(actorKey) {
			return
		}
		if !hazardTouchesActor(h.X, h.Y, h.HitRadius, e.X, e.Y, e.CollisionRadius()) {
			delete(h.HitActorKeys, actorKey)
			return
		}
		wasAlive := e.State != enemy.StateDead
		w.applyPlayerDamageToEnemy(h.SourcePlayerID, e, h.Damage)
		if wasAlive && e.State == enemy.StateDead {
			w.awardHazardMonsterKill(h.SourcePlayerID, h.SourceCastID)
		}
	})
}

func (w *World) applyHazardToBosses(h *hazard.Hazard, queryPadding float64) {
	w.forEachBossTargetInRadius(h.X, h.Y, h.HitRadius+queryPadding, func(target bossTarget) {
		w.applyHazardToBoss(h, target)
	})
}

func (w *World) applyHazardToBoss(h *hazard.Hazard, target bossTarget) {
	if target.dead() {
		return
	}
	actorKey := bossActorKey(target.id)
	if !h.MarkHit(actorKey) {
		return
	}
	if !hazardTouchesActor(h.X, h.Y, h.HitRadius, target.x, target.y, target.radius) {
		delete(h.HitActorKeys, actorKey)
		return
	}
	wasAlive := !target.dead()
	w.applyPlayerDamageToBoss(h.SourcePlayerID, target, h.Damage)
	if wasAlive && target.dead() {
		w.awardHazardMonsterKill(h.SourcePlayerID, h.SourceCastID)
	}
}

func (w *World) queueFireLine(x, y, dirX, dirY float64, kind hazard.Kind, tint uint32) {
	dx := int(sign(dirX))
	dy := int(sign(dirY))
	if dx == 0 && dy == 0 {
		return
	}
	w.pendingFireLines = append(w.pendingFireLines, pendingFireLine{
		x: x, y: y, dirX: dx, dirY: dy, kind: kind, tint: tint,
		nextSeg: 1, nextSpawn: w.now,
	})
}

func (w *World) spawnDashTrail(
	sourcePlayerID string,
	startX,
	startY float64,
	direction domworld.Direction,
) {
	if w.cfg.IDs == nil {
		return
	}
	dirX, dirY := dashDirectionVector(direction)
	if dirX == 0 && dirY == 0 {
		return
	}
	sourceKey := playerActorKey(sourcePlayerID)
	for distance := float64(hazard.FireFieldSpacing); distance < player.DashDistance; distance += float64(hazard.FireFieldSpacing) {
		x := startX + dirX*distance
		y := startY + dirY*distance
		id := w.cfg.IDs.NewID(string(hazard.KindBlueFlame))
		h := hazard.New(id, x, y, hazard.KindBlueFlame)
		h.SourcePlayerID = sourcePlayerID
		h.HitsAllActors = true
		h.IgnoreActor(sourceKey)
		w.hazards[id] = h
		w.hazardIndex.Upsert(id, x, y)
	}
}

func (w *World) spawnKnightBladeWave(e *enemy.Enemy, direction domworld.Direction) {
	if w.cfg.IDs == nil || e == nil || direction == "" {
		return
	}
	id := w.cfg.IDs.NewID(string(hazard.KindKnightBladeWave))
	h := hazard.NewKnightBladeWave(id, e.X, e.Y, direction, e.Elite)
	w.hazards[id] = h
	w.hazardIndex.Upsert(id, h.X, h.Y)
}

func (w *World) spawnPlayerGrenade(
	sourcePlayerID string,
	sourceCastID uint64,
	startX,
	startY float64,
	direction domworld.Direction,
	hitsPlayers bool,
) {
	if w.cfg.IDs == nil {
		return
	}
	dirX, dirY := dashDirectionVector(direction)
	if dirX == 0 && dirY == 0 {
		return
	}
	id := w.cfg.IDs.NewID(string(hazard.KindGrenade))
	h := hazard.NewGrenade(id, startX, startY, direction)
	h.SourcePlayerID = sourcePlayerID
	h.SourceCastID = sourceCastID
	h.Damage = player.GrenadeDamage
	h.Speed = player.GrenadeDistance / player.GrenadeFlightDuration.Seconds()
	h.RemainingDistance = player.GrenadeDistance
	h.HitsPlayers = hitsPlayers
	h.IgnoreActor(playerActorKey(sourcePlayerID))
	w.hazards[id] = h
	w.hazardIndex.Upsert(id, h.X, h.Y)
}

func (w *World) spawnPlayerMolotov(
	sourcePlayerID string,
	sourceCastID uint64,
	startX,
	startY float64,
	direction domworld.Direction,
	hitsPlayers bool,
) {
	if w.cfg.IDs == nil {
		return
	}
	dirX, dirY := dashDirectionVector(direction)
	if dirX == 0 && dirY == 0 {
		return
	}
	id := w.cfg.IDs.NewID(string(hazard.KindMolotov))
	h := hazard.NewMolotov(id, startX, startY, direction)
	h.SourcePlayerID = sourcePlayerID
	h.SourceCastID = sourceCastID
	h.Damage = player.MolotovDamage
	h.Speed = player.GrenadeDistance / player.GrenadeFlightDuration.Seconds()
	h.RemainingDistance = player.GrenadeDistance
	h.HitsPlayers = hitsPlayers
	h.IgnoreActor(playerActorKey(sourcePlayerID))
	w.hazards[id] = h
	w.hazardIndex.Upsert(id, h.X, h.Y)
}

func (w *World) spawnPlayerLandmine(
	sourcePlayerID string,
	sourceCastID uint64,
	startX,
	startY float64,
	direction domworld.Direction,
	hitsPlayers bool,
) {
	if w.cfg.IDs == nil {
		return
	}
	dirX, dirY := dashDirectionVector(direction)
	if dirX == 0 && dirY == 0 {
		return
	}
	spawnX := startX - dirX*player.LandmineSpawnOffset
	spawnY := startY - dirY*player.LandmineSpawnOffset
	id := w.cfg.IDs.NewID(string(hazard.KindLandmine))
	h := hazard.NewLandmine(id, spawnX, spawnY)
	h.SourcePlayerID = sourcePlayerID
	h.SourceCastID = sourceCastID
	h.Damage = player.LandmineDamage
	h.HitsPlayers = hitsPlayers
	h.IgnoreActor(playerActorKey(sourcePlayerID))
	w.hazards[id] = h
	w.hazardIndex.Upsert(id, h.X, h.Y)
}

func (w *World) spawnPlayerExplosion(sourcePlayerID string, x, y float64, kind hazard.Kind) {
	if w.cfg.IDs == nil {
		return
	}
	id := w.cfg.IDs.NewID(string(kind))
	h := hazard.NewLandmineExplosion(id, x, y)
	if kind == hazard.KindMolotovExplosion {
		h = hazard.NewMolotovExplosion(id, x, y)
	}
	h.SourcePlayerID = sourcePlayerID
	w.hazards[id] = h
	w.hazardIndex.Upsert(id, x, y)
}

func (w *World) spawnLandmineExplosion(sourcePlayerID string, x, y float64) {
	w.spawnPlayerExplosion(sourcePlayerID, x, y, hazard.KindLandmineExplosion)
}

func (w *World) spawnFireBurst(x, y float64, kind hazard.Kind, tints []uint32) {
	colorIndex := 0
	for oy := -hazard.PurpleBlastRadius; oy <= hazard.PurpleBlastRadius; oy += hazard.PurpleTileStep {
		for ox := -hazard.PurpleBlastRadius; ox <= hazard.PurpleBlastRadius; ox += hazard.PurpleTileStep {
			if ox*ox+oy*oy > hazard.PurpleBlastRadius*hazard.PurpleBlastRadius {
				continue
			}
			id := w.cfg.IDs.NewID("fire_burst")
			tint := uint32(0)
			if len(tints) > 0 {
				tint = tints[colorIndex%len(tints)]
				colorIndex++
			}
			h := hazard.NewTinted(id, x+float64(ox), y+float64(oy), kind, tint)
			w.hazards[id] = h
			w.hazardIndex.Upsert(id, h.X, h.Y)
		}
	}
}

func (w *World) spawnPurpleField(x, y float64) {
	for oy := -hazard.PurpleBlastRadius; oy <= hazard.PurpleBlastRadius; oy += hazard.PurpleTileStep {
		for ox := -hazard.PurpleBlastRadius; ox <= hazard.PurpleBlastRadius; ox += hazard.PurpleTileStep {
			if ox*ox+oy*oy > hazard.PurpleBlastRadius*hazard.PurpleBlastRadius {
				continue
			}
			id := w.cfg.IDs.NewID("purple")
			h := hazard.New(id, x+float64(ox), y+float64(oy), hazard.KindPurpleField)
			w.hazards[id] = h
			w.hazardIndex.Upsert(id, h.X, h.Y)
		}
	}
}

func (w *World) landmineTriggered(h *hazard.Hazard, playerHalfDiag float64) bool {
	const hostileQueryPadding = 64.0
	triggered := false
	w.playerIndex.ForEachInRadius(h.X, h.Y, h.HitRadius+playerHalfDiag, func(id spatial.EntityID) {
		if triggered {
			return
		}
		p := w.players[id]
		if p == nil || p.State == player.StateDead {
			return
		}
		actorKey := playerActorKey(p.ID)
		if _, ignored := h.IgnoredActorKeys[actorKey]; ignored {
			return
		}
		triggered = hazardTouchesActor(h.X, h.Y, h.HitRadius, p.X, p.Y, playerHalfDiag)
	})
	if triggered {
		return true
	}
	w.enemyIndex.ForEachInRadius(h.X, h.Y, h.HitRadius+hostileQueryPadding, func(id spatial.EntityID) {
		if triggered {
			return
		}
		e := w.enemies[id]
		triggered = e != nil && e.State != enemy.StateDead && hazardTouchesActor(h.X, h.Y, h.HitRadius, e.X, e.Y, e.CollisionRadius())
	})
	if triggered {
		return true
	}
	w.forEachBossTargetInRadius(h.X, h.Y, h.HitRadius+hostileQueryPadding, func(target bossTarget) {
		if triggered {
			return
		}
		triggered = !target.dead() && hazardTouchesActor(h.X, h.Y, h.HitRadius, target.x, target.y, target.radius)
	})
	return triggered
}

func (w *World) detonatePlayerExplosive(h *hazard.Hazard, playerHalfDiag float64) {
	const hostileQueryPadding = 64.0
	explosionKind := hazard.KindLandmineExplosion
	if h.Kind == hazard.KindMolotov {
		explosionKind = hazard.KindMolotovExplosion
	}
	w.spawnPlayerExplosion(h.SourcePlayerID, h.X, h.Y, explosionKind)
	isMolotov := h.Kind == hazard.KindMolotov

	w.playerIndex.ForEachInRadius(h.X, h.Y, hazard.LandmineExplosionRadius+playerHalfDiag, func(id spatial.EntityID) {
		p := w.players[id]
		if p == nil || p.State == player.StateDead || p.ID == h.SourcePlayerID || !h.HitsPlayers || w.isProtected(p) {
			return
		}
		if !hazardTouchesActor(h.X, h.Y, hazard.LandmineExplosionRadius, p.X, p.Y, playerHalfDiag) {
			return
		}
		wasAlive := p.State != player.StateDead
		p.TakeDamage(h.Damage)
		if wasAlive && p.State == player.StateDead {
			w.awardHazardPlayerKill(h.SourcePlayerID)
		}
	})
	w.enemyIndex.ForEachInRadius(h.X, h.Y, hazard.LandmineExplosionRadius+hostileQueryPadding, func(id spatial.EntityID) {
		e := w.enemies[id]
		if e == nil || e.State == enemy.StateDead || !hazardTouchesActor(h.X, h.Y, hazard.LandmineExplosionRadius, e.X, e.Y, e.CollisionRadius()) {
			return
		}
		wasAlive := e.State != enemy.StateDead
		w.applyPlayerDamageToEnemy(h.SourcePlayerID, e, h.Damage)
		if isMolotov && e.State != enemy.StateDead {
			w.armMolotovBurn("enemy", e.ID, h.SourcePlayerID)
		}
		if wasAlive && e.State == enemy.StateDead {
			w.awardHazardMonsterKill(h.SourcePlayerID, h.SourceCastID)
		}
	})
	w.forEachBossTargetInRadius(h.X, h.Y, hazard.LandmineExplosionRadius+hostileQueryPadding, func(target bossTarget) {
		w.detonateExplosiveOnBoss(h, target, isMolotov)
	})
}

func (w *World) detonateExplosiveOnBoss(h *hazard.Hazard, target bossTarget, isMolotov bool) {
	if target.dead() || !hazardTouchesActor(h.X, h.Y, hazard.LandmineExplosionRadius, target.x, target.y, target.radius) {
		return
	}
	wasAlive := !target.dead()
	w.applyPlayerDamageToBoss(h.SourcePlayerID, target, h.Damage)
	if isMolotov && !target.dead() {
		w.armMolotovBurn("boss", target.id, h.SourcePlayerID)
	}
	if wasAlive && target.dead() {
		w.awardHazardMonsterKill(h.SourcePlayerID, h.SourceCastID)
	}
}

func dashDirectionVector(direction domworld.Direction) (float64, float64) {
	switch direction {
	case domworld.DirectionUp:
		return 0, -1
	case domworld.DirectionDown:
		return 0, 1
	case domworld.DirectionLeft:
		return -1, 0
	case domworld.DirectionRight:
		return 1, 0
	default:
		return 0, 0
	}
}

func hazardTouchesActor(x, y, hitRadius, actorX, actorY, actorRadius float64) bool {
	reach := hitRadius + actorRadius
	return physics.DistanceSquared(x, y, actorX, actorY) <= reach*reach
}

func playerActorKey(id string) string { return "player:" + id }

func enemyActorKey(id string) string { return "enemy:" + id }

func bossActorKey(id string) string { return "boss:" + id }
