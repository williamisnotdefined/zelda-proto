package world

import (
	"math"
	"time"

	appcombat "github.com/williamisnotdefined/zelda-proto/server/internal/application/combat"
	"github.com/williamisnotdefined/zelda-proto/server/internal/domain/enemy"
	"github.com/williamisnotdefined/zelda-proto/server/internal/domain/physics"
	"github.com/williamisnotdefined/zelda-proto/server/internal/domain/player"
	domworld "github.com/williamisnotdefined/zelda-proto/server/internal/domain/world"
)

const enemyConfusionTouchMargin = 2.0

func filterFrozenMap[T any](items map[string]T, frozen map[string]time.Duration) map[string]T {
	if len(frozen) == 0 {
		return items
	}
	out := make(map[string]T, len(items))
	for id, item := range items {
		if _, locked := frozen[id]; locked {
			continue
		}
		out[id] = item
	}
	return out
}

func filterConfusionFocusedEnemies(items map[string]*enemy.Enemy, confused map[string]confusionStatus) map[string]*enemy.Enemy {
	if len(confused) == 0 {
		return items
	}
	out := make(map[string]*enemy.Enemy, len(items))
	for id, item := range items {
		if _, locked := confused[id]; locked {
			continue
		}
		if item != nil {
			if _, focused := confused[item.TargetID]; focused {
				continue
			}
		}
		out[id] = item
	}
	return out
}

func (w *World) advancePullOverlapBodies(dt time.Duration) {
	for key, remaining := range w.pullOverlapBodies {
		remaining -= dt
		if remaining <= 0 {
			delete(w.pullOverlapBodies, key)
			continue
		}
		w.pullOverlapBodies[key] = remaining
	}
}

func (w *World) advanceVenomDebuffs(dt time.Duration) {
	for key, debuff := range w.venomDebuffs {
		debuff.Remaining -= dt
		if debuff.Remaining <= 0 {
			delete(w.venomDebuffs, key)
			continue
		}
		w.venomDebuffs[key] = debuff
	}
}

func (w *World) advanceConfusionStatuses(dt time.Duration) {
	for id, status := range w.confusedEnemies {
		e := w.enemies[id]
		if e == nil || e.State == enemy.StateDead || e.Elite {
			delete(w.confusedEnemies, id)
			continue
		}
		status.Remaining -= dt
		if status.Remaining <= 0 {
			delete(w.confusedEnemies, id)
			continue
		}
		w.confusedEnemies[id] = status
	}
}

func (w *World) armConfusion(id, sourcePlayerID string, duration time.Duration) {
	if id == "" || sourcePlayerID == "" || duration <= 0 {
		return
	}
	e := w.enemies[id]
	if e == nil || e.State == enemy.StateDead || e.Elite {
		return
	}
	current := w.confusedEnemies[id]
	if current.SourcePlayerID == sourcePlayerID && current.Remaining >= duration {
		return
	}
	w.confusedEnemies[id] = confusionStatus{SourcePlayerID: sourcePlayerID, Remaining: duration}
	e.TargetID = ""
	e.State = enemy.StateIdle
	e.FaceMonsterTarget(w.nearestEnemyTarget(e, func(candidate *enemy.Enemy) bool {
		return !w.isEnemyConfused(candidate.ID)
	}))
}

func (w *World) armVenomDebuff(kind, id, sourcePlayerID string, duration time.Duration) {
	if duration <= 0 || sourcePlayerID == "" {
		return
	}
	key := dynamicBodyKey(kind, id)
	current, ok := w.venomDebuffs[key]
	if ok && current.SourcePlayerID == sourcePlayerID && current.Remaining >= duration {
		return
	}
	w.venomDebuffs[key] = venomDebuff{SourcePlayerID: sourcePlayerID, Remaining: duration}
}

func (w *World) venomDamage(sourcePlayerID, kind, id string, baseDamage int) (int, *player.Player) {
	if sourcePlayerID == "" || baseDamage <= 0 {
		return baseDamage, nil
	}
	debuff, ok := w.venomDebuffs[dynamicBodyKey(kind, id)]
	if !ok || debuff.SourcePlayerID != sourcePlayerID || debuff.Remaining <= 0 {
		return baseDamage, nil
	}
	return baseDamage * 2, w.players[sourcePlayerID]
}

func healVenomSource(source *player.Player, dealt int) {
	if source == nil || dealt <= 0 {
		return
	}
	source.Heal(int(math.Ceil(float64(dealt) * player.VenomLifeStealRatio)))
}

func healMolotovBurnSource(source *player.Player, dealt int) {
	if source == nil || dealt <= 0 {
		return
	}
	source.Heal(int(math.Ceil(float64(dealt) * player.MolotovBurnLifeStealRatio)))
}

func (w *World) armMolotovBurn(kind, id, sourcePlayerID string) {
	if id == "" {
		return
	}
	key := dynamicBodyKey(kind, id)
	w.molotovBurns[key] = molotovBurn{
		Kind:           kind,
		ID:             id,
		SourcePlayerID: sourcePlayerID,
		TicksRemaining: player.MolotovBurnTicks,
		TickTimer:      player.MolotovBurnTickInterval,
	}
}

func (w *World) advanceMolotovBurns(dt time.Duration) {
	for key, burn := range w.molotovBurns {
		burn.TickTimer -= dt
		for burn.TicksRemaining > 0 && burn.TickTimer <= 0 {
			dealt, killed := w.applyMolotovBurnDamage(burn)
			healMolotovBurnSource(w.players[burn.SourcePlayerID], dealt)
			burn.TicksRemaining--
			burn.TickTimer += player.MolotovBurnTickInterval
			if killed {
				if dealt > 0 {
					w.awardHazardMonsterKill(burn.SourcePlayerID, 0)
				}
				delete(w.molotovBurns, key)
				break
			}
		}
		if _, ok := w.molotovBurns[key]; !ok {
			continue
		}
		if burn.TicksRemaining <= 0 {
			delete(w.molotovBurns, key)
			continue
		}
		w.molotovBurns[key] = burn
	}
}

func (w *World) applyMolotovBurnDamage(burn molotovBurn) (int, bool) {
	switch burn.Kind {
	case "enemy":
		e := w.enemies[burn.ID]
		if e == nil || e.State == enemy.StateDead {
			return 0, true
		}
		beforeHP := e.HP
		e.TakeDamage(player.MolotovBurnTickDamage)
		dealt := beforeHP - e.HP
		if e.State == enemy.StateDead {
			delete(w.venomDebuffs, dynamicBodyKey("enemy", e.ID))
			return dealt, true
		}
		return dealt, false
	case "boss":
		if target, ok := w.bossTargetByID(burn.ID); ok {
			return w.applyMolotovBurnDamageToBoss(target)
		}
	}
	return 0, true
}

func (w *World) applyMolotovBurnDamageToBoss(target bossTarget) (int, bool) {
	if target.dead() {
		return 0, true
	}
	beforeHP := target.hp()
	target.takeDamage(player.MolotovBurnTickDamage)
	dealt := beforeHP - target.hp()
	if target.dead() {
		delete(w.venomDebuffs, dynamicBodyKey("boss", target.id))
		return dealt, true
	}
	return dealt, false
}

func (w *World) applyPlayerDamageToEnemy(sourcePlayerID string, e *enemy.Enemy, baseDamage int) int {
	damage, venomSource := w.venomDamage(sourcePlayerID, "enemy", e.ID, baseDamage)
	beforeHP := e.HP
	e.TakeDamage(damage)
	dealt := beforeHP - e.HP
	if e.State == enemy.StateDead {
		delete(w.venomDebuffs, dynamicBodyKey("enemy", e.ID))
		delete(w.molotovBurns, dynamicBodyKey("enemy", e.ID))
	}
	healVenomSource(venomSource, dealt)
	return dealt
}

func (w *World) applyPlayerDamageToBoss(sourcePlayerID string, target bossTarget, baseDamage int) int {
	damage, venomSource := w.venomDamage(sourcePlayerID, "boss", target.id, baseDamage)
	beforeHP := target.hp()
	target.takeDamage(damage)
	dealt := beforeHP - target.hp()
	if target.dead() {
		delete(w.venomDebuffs, dynamicBodyKey("boss", target.id))
		delete(w.molotovBurns, dynamicBodyKey("boss", target.id))
	}
	healVenomSource(venomSource, dealt)
	return dealt
}

func (w *World) resolvePlayerShurikens() {
	for _, caster := range w.players {
		ticks, castID := caster.ConsumeShurikenTicks()
		if ticks <= 0 || caster.State == player.StateDead {
			continue
		}
		for i := 0; i < ticks; i++ {
			w.resolvePlayerShurikenTick(caster, castID)
		}
		caster.FinishExpiredShurikenCast(castID)
	}
}

func (w *World) resolvePlayerShurikenTick(caster *player.Player, castID uint64) {
	totalDamage := 0
	for _, e := range w.enemies {
		if e.State == enemy.StateDead || !withinShurikenRadius(caster.X, caster.Y, e.X, e.Y, e.CollisionRadius()) {
			continue
		}
		beforeHP := e.HP
		e.TakeDamage(player.ShurikenDamage)
		dealt := beforeHP - e.HP
		totalDamage += dealt
		if e.State == enemy.StateDead {
			delete(w.venomDebuffs, dynamicBodyKey("enemy", e.ID))
			delete(w.molotovBurns, dynamicBodyKey("enemy", e.ID))
			caster.MonsterKills++
			caster.RecordMonsterKillInCast(castID)
		}
	}
	w.forEachBossTargetInRadius(caster.X, caster.Y, player.ShurikenRadius+64, func(target bossTarget) {
		if target.dead() || !withinShurikenRadius(caster.X, caster.Y, target.x, target.y, target.radius) {
			return
		}
		beforeHP := target.hp()
		target.takeDamage(player.ShurikenDamage)
		dealt := beforeHP - target.hp()
		totalDamage += dealt
		if target.dead() {
			delete(w.venomDebuffs, dynamicBodyKey("boss", target.id))
			delete(w.molotovBurns, dynamicBodyKey("boss", target.id))
			caster.MonsterKills++
			caster.RecordMonsterKillInCast(castID)
		}
	})

	casterProtected := w.isProtected(caster)
	for _, target := range w.players {
		if target.ID == caster.ID || target.State == player.StateDead || casterProtected || w.isProtected(target) {
			continue
		}
		if !withinShurikenRadius(caster.X, caster.Y, target.X, target.Y, player.Width/2) {
			continue
		}
		beforeHP := target.HP
		target.TakeDamage(player.ShurikenDamage)
		dealt := beforeHP - target.HP
		totalDamage += dealt
		if target.State == player.StateDead {
			caster.PlayerKills++
		}
	}
	caster.HealFromShuriken(totalDamage)
}

func (w *World) resolvePlayerSpikedBalls() {
	for _, caster := range w.players {
		ticks, castID := caster.ConsumeSpikedBallsTicks()
		if ticks <= 0 || caster.State == player.StateDead {
			continue
		}
		for i := 0; i < ticks; i++ {
			w.resolvePlayerSpikedBallsTick(caster, castID)
		}
		caster.FinishExpiredSpikedBallsCast(castID)
	}
}

func (w *World) resolvePlayerSpikedBallsTick(caster *player.Player, castID uint64) {
	totalDamage := 0
	for _, e := range w.enemies {
		if e.State == enemy.StateDead || !withinSpikedBallsRadius(caster.X, caster.Y, e.X, e.Y, e.CollisionRadius()) {
			continue
		}
		beforeHP := e.HP
		e.TakeDamage(player.SpikedBallsDamage)
		dealt := beforeHP - e.HP
		totalDamage += dealt
		if e.State == enemy.StateDead {
			delete(w.venomDebuffs, dynamicBodyKey("enemy", e.ID))
			delete(w.molotovBurns, dynamicBodyKey("enemy", e.ID))
			caster.MonsterKills++
			caster.RecordMonsterKillInCast(castID)
		}
	}
	w.forEachBossTargetInRadius(caster.X, caster.Y, player.SpikedBallsRadius+64, func(target bossTarget) {
		if target.dead() || !withinSpikedBallsRadius(caster.X, caster.Y, target.x, target.y, target.radius) {
			return
		}
		beforeHP := target.hp()
		target.takeDamage(player.SpikedBallsDamage)
		dealt := beforeHP - target.hp()
		totalDamage += dealt
		if target.dead() {
			delete(w.venomDebuffs, dynamicBodyKey("boss", target.id))
			delete(w.molotovBurns, dynamicBodyKey("boss", target.id))
			caster.MonsterKills++
			caster.RecordMonsterKillInCast(castID)
		}
	})

	casterProtected := w.isProtected(caster)
	for _, target := range w.players {
		if target.ID == caster.ID || target.State == player.StateDead || casterProtected || w.isProtected(target) {
			continue
		}
		if !withinSpikedBallsRadius(caster.X, caster.Y, target.X, target.Y, player.Width/2) {
			continue
		}
		beforeHP := target.HP
		target.TakeDamage(player.SpikedBallsDamage)
		dealt := beforeHP - target.HP
		totalDamage += dealt
		if target.State == player.StateDead {
			caster.PlayerKills++
		}
	}
	caster.HealFromSpikedBalls(totalDamage)
}

func (w *World) resolveEnemyConfusionCombat() {
	for _, attacker := range w.enemies {
		if attacker.State != enemy.StateAttacking || attacker.DamageCooldown > 0 || attacker.TargetID == "" {
			continue
		}
		if attacker.State == enemy.StateDead {
			continue
		}
		target := w.enemies[attacker.TargetID]
		if target == nil || target.ID == attacker.ID || target.State == enemy.StateDead {
			continue
		}

		attackerConfused := w.isEnemyConfused(attacker.ID)
		targetConfused := w.isEnemyConfused(target.ID)
		if attackerConfused == targetConfused {
			continue
		}
		if !enemyTouchesEnemyBody(attacker, target) {
			continue
		}

		beforeHP := target.HP
		target.TakeDamage(attacker.Config.Damage)
		dealt := beforeHP - target.HP
		attacker.MarkContactDamageDealt()
		if dealt <= 0 || target.State != enemy.StateDead {
			continue
		}

		sourcePlayerID := ""
		if attackerConfused {
			sourcePlayerID = w.confusedEnemies[attacker.ID].SourcePlayerID
		} else if targetConfused {
			sourcePlayerID = w.confusedEnemies[target.ID].SourcePlayerID
		}
		delete(w.confusedEnemies, target.ID)
		delete(w.venomDebuffs, dynamicBodyKey("enemy", target.ID))
		delete(w.molotovBurns, dynamicBodyKey("enemy", target.ID))
		delete(w.waveFrozenEnemies, target.ID)
		w.awardHazardMonsterKill(sourcePlayerID, 0)
	}
}

func enemyTouchesEnemyBody(a, b *enemy.Enemy) bool {
	r := a.CollisionRadius() + b.CollisionRadius() + enemyConfusionTouchMargin
	return physics.DistanceSquared(a.X, a.Y, b.X, b.Y) <= r*r
}

func (w *World) armPullOverlap(kind, id string, duration time.Duration) {
	if duration <= 0 {
		return
	}
	key := dynamicBodyKey(kind, id)
	if duration > w.pullOverlapBodies[key] {
		w.pullOverlapBodies[key] = duration
	}
}

func withinShurikenRadius(cx, cy, x, y, bodyRadius float64) bool {
	reach := player.ShurikenRadius + bodyRadius
	return physics.DistanceSquared(cx, cy, x, y) <= reach*reach
}

func withinSpikedBallsRadius(cx, cy, x, y, bodyRadius float64) bool {
	reach := player.SpikedBallsRadius + bodyRadius
	return physics.DistanceSquared(cx, cy, x, y) <= reach*reach
}

func (w *World) resolveCombat() {
	// Run focused sub-systems in a fixed order:
	// PlayerWave -> PlayerNumb -> PlayerPull -> PlayerVenom -> PlayerConfusion ->
	// PlayerLandmine -> PlayerGrenade -> PlayerMolotov -> PlayerDash ->
	// PlayerShuriken -> PlayerSpikedBalls -> ContactDamage. Each system is stateless and reads/mutates
	// only the slices it needs.
	if (appcombat.PlayerWaveSystem{}).Resolve(
		w.players,
		w.enemies,
		w.dragons,
		w.gelehks,
		w.vanessas,
		w.safeZone(),
	) {
		w.resolveBodyCollisionsLocked()
	}
	if (appcombat.PlayerNumbSystem{}).Resolve(
		w.players,
		w.enemies,
		w.dragons,
		w.gelehks,
		w.vanessas,
		w.safeZone(),
	) {
		w.resolveBodyCollisionsLocked()
	}
	if (appcombat.PlayerPullSystem{}).Resolve(
		w.players,
		w.enemies,
		w.dragons,
		w.gelehks,
		w.vanessas,
		w.safeZone(),
		func(kind, id string, duration time.Duration) {
			w.armPullOverlap(kind, id, duration)
		},
	) {
		w.resolveBodyCollisionsLocked()
	}
	(appcombat.PlayerVenomSystem{}).Resolve(
		w.players,
		w.enemies,
		w.dragons,
		w.gelehks,
		w.vanessas,
		func(kind, id, sourcePlayerID string, duration time.Duration) {
			w.armVenomDebuff(kind, id, sourcePlayerID, duration)
		},
	)
	(appcombat.PlayerConfusionSystem{}).Resolve(
		w.players,
		w.enemies,
		w.dragons,
		w.gelehks,
		w.vanessas,
		func(id, sourcePlayerID string, duration time.Duration) {
			w.armConfusion(id, sourcePlayerID, duration)
		},
	)
	(appcombat.PlayerLandmineSystem{}).Resolve(
		w.players,
		w.safeZone(),
		func(sourcePlayerID string, sourceCastID uint64, startX, startY float64, direction domworld.Direction, hitsPlayers bool) {
			w.spawnPlayerLandmine(sourcePlayerID, sourceCastID, startX, startY, direction, hitsPlayers)
		},
	)
	(appcombat.PlayerGrenadeSystem{}).Resolve(
		w.players,
		w.safeZone(),
		func(sourcePlayerID string, sourceCastID uint64, startX, startY float64, direction domworld.Direction, hitsPlayers bool) {
			w.spawnPlayerGrenade(sourcePlayerID, sourceCastID, startX, startY, direction, hitsPlayers)
		},
	)
	(appcombat.PlayerMolotovSystem{}).Resolve(
		w.players,
		w.safeZone(),
		func(sourcePlayerID string, sourceCastID uint64, startX, startY float64, direction domworld.Direction, hitsPlayers bool) {
			w.spawnPlayerMolotov(sourcePlayerID, sourceCastID, startX, startY, direction, hitsPlayers)
		},
	)
	if (appcombat.PlayerDashSystem{}).Resolve(
		w.players,
		w.enemies,
		w.dragons,
		w.gelehks,
		w.vanessas,
		func(sourcePlayerID string, startX, startY float64, direction domworld.Direction) {
			w.spawnDashTrail(sourcePlayerID, startX, startY, direction)
		},
	) {
		w.resolvePlayersStaticCollisionsLocked()
		w.syncDynamicIndexesLocked()
	}
	w.resolvePlayerShurikens()
	w.resolvePlayerSpikedBalls()
	w.resolveEnemyConfusionCombat()
	appcombat.ContactDamageSystem{}.Resolve(
		w.players,
		filterConfusionFocusedEnemies(filterFrozenMap(w.enemies, w.waveFrozenEnemies), w.confusedEnemies),
		filterFrozenMap(w.dragons, w.waveFrozenDragons),
		filterFrozenMap(w.gelehks, w.waveFrozenGelehks),
		filterFrozenMap(w.vanessas, w.waveFrozenVanessas),
		w.safeZone(),
	)
}

func (w *World) awardHazardMonsterKill(sourcePlayerID string, sourceCastID uint64) {
	if sourcePlayerID == "" {
		return
	}
	if source, ok := w.players[sourcePlayerID]; ok {
		source.MonsterKills++
		source.RecordMonsterKillInCast(sourceCastID)
	}
}

func (w *World) finishHazardCast(sourcePlayerID string, sourceCastID uint64) {
	if sourcePlayerID == "" || sourceCastID == 0 {
		return
	}
	if source, ok := w.players[sourcePlayerID]; ok {
		source.FinishCast(sourceCastID)
	}
}

func (w *World) awardHazardPlayerKill(sourcePlayerID string) {
	if sourcePlayerID == "" {
		return
	}
	if source, ok := w.players[sourcePlayerID]; ok {
		source.PlayerKills++
	}
}
