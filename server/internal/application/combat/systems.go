// Package combat hosts the application-layer combat sub-systems that resolve
// player swings (PvE + PvP) and contact damage from enemies/bosses. The design
// keeps the same auditable separation of concerns across focused sub-systems.
//
// Each system is stateless and receives the world slices it needs as
// arguments; the world.World orchestrator owns the maps and calls the
// systems in a fixed order during Tick().
package combat

import (
	"math"

	"github.com/williamisnotdefined/zelda-proto/server/internal/application/safezone"
	"github.com/williamisnotdefined/zelda-proto/server/internal/domain/boss"
	"github.com/williamisnotdefined/zelda-proto/server/internal/domain/enemy"
	"github.com/williamisnotdefined/zelda-proto/server/internal/domain/physics"
	"github.com/williamisnotdefined/zelda-proto/server/internal/domain/player"
	domworld "github.com/williamisnotdefined/zelda-proto/server/internal/domain/world"
)

const contactTouchMargin = 2.0
const playerWavePushMargin = 12.0

// PlayerMeleeSystem resolves player melee swings against enemies and bosses.
// Damage is applied directly because the runtime does not use a separate
// deferred hit-intent stage.
type PlayerMeleeSystem struct{}

// Resolve runs swing resolution for every attacking player.
func (PlayerMeleeSystem) Resolve(
	players map[string]*player.Player,
	enemies map[string]*enemy.Enemy,
	dragons map[string]*boss.DragonLord,
	gelehks map[string]*boss.Gelehk,
	vanessas map[string]*boss.VanessaTheRuthless,
) {
	for _, p := range players {
		hb, ok := p.AttackHitbox()
		if !ok {
			continue
		}
		// Enemies
		for _, e := range enemies {
			if e.State == enemy.StateDead {
				continue
			}
			if _, hit := p.AttackHitEnemyIDs[e.ID]; hit {
				continue
			}
			eb := physics.EntityAABB(e.X, e.Y, e.Config.Width, e.Config.Height)
			if !physics.AABBOverlap(hb, eb) {
				continue
			}
			p.AttackHitEnemyIDs[e.ID] = struct{}{}
			e.TakeDamage(player.MeleeDamage)
			if e.State == enemy.StateDead {
				p.MonsterKills++
				p.RecordMonsterKillInCurrentAttack()
			}
		}
		// DragonLord-family bosses
		for _, d := range dragons {
			if d.State == boss.StateDead {
				continue
			}
			if _, hit := p.AttackHitEnemyIDs[d.ID]; hit {
				continue
			}
			db := physics.EntityAABB(d.X, d.Y, 96, 96)
			if !physics.AABBOverlap(hb, db) {
				continue
			}
			p.AttackHitEnemyIDs[d.ID] = struct{}{}
			d.TakeDamage(player.MeleeDamage)
			if d.State == boss.StateDead {
				p.MonsterKills++
				p.RecordMonsterKillInCurrentAttack()
			}
		}
		// Gelehk
		for _, g := range gelehks {
			if g.State == boss.StateDead {
				continue
			}
			if _, hit := p.AttackHitEnemyIDs[g.ID]; hit {
				continue
			}
			gb := physics.EntityAABB(g.X, g.Y, 72, 72)
			if !physics.AABBOverlap(hb, gb) {
				continue
			}
			p.AttackHitEnemyIDs[g.ID] = struct{}{}
			g.TakeDamage(player.MeleeDamage)
			if g.State == boss.StateDead {
				p.MonsterKills++
			}
		}
		// Vanessa the Ruthless
		for _, v := range vanessas {
			if v.State == boss.StateDead {
				continue
			}
			if _, hit := p.AttackHitEnemyIDs[v.ID]; hit {
				continue
			}
			vb := physics.EntityAABB(v.X, v.Y, 88, 88)
			if !physics.AABBOverlap(hb, vb) {
				continue
			}
			p.AttackHitEnemyIDs[v.ID] = struct{}{}
			v.TakeDamage(player.MeleeDamage)
			if v.State == boss.StateDead {
				p.MonsterKills++
				p.RecordMonsterKillInCurrentAttack()
			}
		}
	}
}

// PvPSystem resolves player-vs-player melee. Both attacker and target safezone
// protection short-circuit damage application.
type PvPSystem struct{}

// Resolve handles PvP swings for every attacking player.
func (PvPSystem) Resolve(players map[string]*player.Player, zone safezone.Zone) {
	for _, p := range players {
		hb, ok := p.AttackHitbox()
		if !ok {
			continue
		}
		if zone.Protects(p) {
			continue
		}
		for _, target := range players {
			if target.ID == p.ID || target.State == player.StateDead {
				continue
			}
			if _, hit := p.AttackHitPlayerIDs[target.ID]; hit {
				continue
			}
			if zone.Protects(target) {
				continue
			}
			tb := physics.EntityAABB(target.X, target.Y, enemy.PlayerWidth, enemy.PlayerHeight)
			if !physics.AABBOverlap(hb, tb) {
				continue
			}
			p.AttackHitPlayerIDs[target.ID] = struct{}{}
			target.TakeDamage(player.PvPDamage)
			if target.State == player.StateDead {
				p.PlayerKills++
			}
		}
	}
}

// PlayerWaveSystem resolves the player-triggered knockback wave skill.
type PlayerWaveSystem struct{}

// Resolve applies player wave damage and knockback. Returns true when any
// entity position changed and body collisions should be re-resolved.
func (PlayerWaveSystem) Resolve(
	players map[string]*player.Player,
	enemies map[string]*enemy.Enemy,
	dragons map[string]*boss.DragonLord,
	gelehks map[string]*boss.Gelehk,
	vanessas map[string]*boss.VanessaTheRuthless,
	zone safezone.Zone,
) bool {
	moved := false
	for _, caster := range players {
		cx, cy, targets, ok := caster.ConsumeWaveRelease()
		if !ok {
			continue
		}
		casterProtected := zone.Protects(caster)
		totalDamage := 0
		for _, id := range targets.EnemyIDs {
			e := enemies[id]
			if e == nil || e.State == enemy.StateDead {
				continue
			}
			beforeHP := e.HP
			e.TakeDamage(player.WaveDamage)
			totalDamage += beforeHP - e.HP
			if e.State == enemy.StateDead {
				caster.MonsterKills++
				continue
			}
			if pushOutOfWave(cx, cy, &e.X, &e.Y, e.CollisionRadius()) {
				e.TargetID = ""
				e.State = enemy.StateIdle
				moved = true
			}
		}
		for _, id := range targets.DragonIDs {
			d := dragons[id]
			if d == nil || d.State == boss.StateDead {
				continue
			}
			beforeHP := d.HP
			d.TakeDamage(player.WaveDamage)
			totalDamage += beforeHP - d.HP
			if d.State == boss.StateDead {
				caster.MonsterKills++
				continue
			}
			if pushOutOfWave(cx, cy, &d.X, &d.Y, d.ContactRadius()) {
				d.TargetID = ""
				d.State = boss.StateIdle
				moved = true
			}
		}
		for _, id := range targets.GelehkIDs {
			g := gelehks[id]
			if g == nil || g.State == boss.StateDead {
				continue
			}
			beforeHP := g.HP
			g.TakeDamage(player.WaveDamage)
			totalDamage += beforeHP - g.HP
			if g.State == boss.StateDead {
				caster.MonsterKills++
				continue
			}
			if pushOutOfWave(cx, cy, &g.X, &g.Y, g.ContactRadius()) {
				g.StopChargeOnCollision()
				moved = true
			}
		}
		for _, id := range targets.VanessaIDs {
			v := vanessas[id]
			if v == nil || v.State == boss.StateDead {
				continue
			}
			beforeHP := v.HP
			v.TakeDamage(player.WaveDamage)
			totalDamage += beforeHP - v.HP
			if v.State == boss.StateDead {
				caster.MonsterKills++
				continue
			}
			if pushOutOfWave(cx, cy, &v.X, &v.Y, v.ContactRadius()) {
				v.TargetID = ""
				v.State = boss.StateIdle
				moved = true
			}
		}
		for _, target := range players {
			if target.ID == caster.ID || target.State == player.StateDead {
				continue
			}
			if casterProtected || zone.Protects(target) || !withinWave(cx, cy, target.X, target.Y, player.Width/2) {
				continue
			}
			beforeHP := target.HP
			target.TakeDamage(player.WaveDamage)
			totalDamage += beforeHP - target.HP
			if target.State == player.StateDead {
				caster.PlayerKills++
				continue
			}
			if pushOutOfWave(cx, cy, &target.X, &target.Y, player.Width/2) {
				moved = true
			}
		}
		if totalDamage > 0 {
			caster.Heal(int(math.Ceil(float64(totalDamage) * player.WaveLifeStealRatio)))
		}
	}
	return moved
}

// DashTrailSpawner receives the authoritative dash path so the world can spawn
// the blue flame trail after movement is resolved.
type DashTrailSpawner func(sourcePlayerID string, startX, startY float64, direction domworld.Direction)

// PlayerFireballSpawner receives a queued fireball cast so the world can spawn
// the projectile entity after movement is resolved.
type PlayerFireballSpawner func(
	sourcePlayerID string,
	startX, startY float64,
	direction domworld.Direction,
	hitsPlayers bool,
)

// PlayerFireballSystem resolves queued player fireball casts.
type PlayerFireballSystem struct{}

// Resolve emits every queued fireball cast.
func (PlayerFireballSystem) Resolve(
	players map[string]*player.Player,
	zone safezone.Zone,
	spawnFireball PlayerFireballSpawner,
) {
	if spawnFireball == nil {
		return
	}
	for _, caster := range players {
		startX, startY, direction, ok := caster.ConsumeFireballCast()
		if !ok || direction == "" || caster.State == player.StateDead {
			continue
		}
		spawnFireball(caster.ID, startX, startY, direction, !zone.Protects(caster))
	}
}

// PlayerDashSystem resolves the player-triggered dash skill.
type PlayerDashSystem struct{}

type dashCast struct {
	caster    *player.Player
	startX    float64
	startY    float64
	endX      float64
	endY      float64
	direction domworld.Direction
}

// Resolve completes every queued dash and spawns the matching blue flame trail.
// Dash no longer pushes actors in its path; the caster simply passes through
// them and normal contact damage still resolves afterward if the dash ends on a
// hostile body.
func (PlayerDashSystem) Resolve(
	players map[string]*player.Player,
	enemies map[string]*enemy.Enemy,
	dragons map[string]*boss.DragonLord,
	gelehks map[string]*boss.Gelehk,
	vanessas map[string]*boss.VanessaTheRuthless,
	spawnTrail DashTrailSpawner,
) bool {
	dashes := make([]dashCast, 0, len(players))
	for _, caster := range players {
		startX, startY, direction, ok := caster.ConsumeDashCast()
		if !ok || direction == "" || caster.State == player.StateDead {
			continue
		}
		endX, endY := dashDestination(startX, startY, direction)
		dashes = append(dashes, dashCast{
			caster:    caster,
			startX:    startX,
			startY:    startY,
			endX:      endX,
			endY:      endY,
			direction: direction,
		})
	}
	if len(dashes) == 0 {
		return false
	}

	moved := false
	for _, dash := range dashes {
		dash.caster.X = dash.endX
		dash.caster.Y = dash.endY
		moved = true
		if spawnTrail != nil {
			spawnTrail(dash.caster.ID, dash.startX, dash.startY, dash.direction)
		}
	}

	return moved
}

// ContactDamageSystem resolves enemy/boss body collisions that damage players.
// Players inside the spawn safezone are immune.
type ContactDamageSystem struct{}

// Resolve applies contact damage from every alive enemy/dragon to overlapping
// alive, unprotected players.
func (ContactDamageSystem) Resolve(
	players map[string]*player.Player,
	enemies map[string]*enemy.Enemy,
	dragons map[string]*boss.DragonLord,
	gelehks map[string]*boss.Gelehk,
	vanessas map[string]*boss.VanessaTheRuthless,
	zone safezone.Zone,
) {
	// Enemies — one player per enemy per tick. Choose the nearest touched player
	// deterministically rather than relying on map iteration order.
	for _, e := range enemies {
		if e.State == enemy.StateDead || e.DamageCooldown > 0 {
			continue
		}
		var target *player.Player
		bestSq := math.MaxFloat64
		for _, p := range players {
			if p.State == player.StateDead || zone.Protects(p) {
				continue
			}
			if !playerTouchesHostileBody(p, e.X, e.Y, e.CollisionRadius()) {
				continue
			}
			dsq := physics.DistanceSquared(e.X, e.Y, p.X, p.Y)
			if dsq < bestSq {
				bestSq = dsq
				target = p
			}
		}
		if target != nil {
			target.TakeDamage(e.Config.Damage)
			e.MarkContactDamageDealt()
		}
	}
	// DragonLord-family bosses — per-target cooldown tracked on the boss.
	for _, d := range dragons {
		if d.State == boss.StateDead {
			continue
		}
		for _, p := range players {
			if p.State == player.StateDead || zone.Protects(p) {
				continue
			}
			if !d.CanDealContactDamageTo(p.ID) {
				continue
			}
			if !playerTouchesHostileBody(p, d.X, d.Y, d.ContactRadius()) {
				continue
			}
			p.TakeDamage(d.Damage)
			d.MarkContactDamageDealt(p.ID)
		}
	}
	// Gelehk — per-target cooldown tracked on the boss body just like dragons.
	for _, g := range gelehks {
		if g.State == boss.StateDead {
			continue
		}
		for _, p := range players {
			if p.State == player.StateDead || zone.Protects(p) {
				continue
			}
			if !g.CanDealContactDamageTo(p.ID) {
				continue
			}
			if !playerTouchesHostileBody(p, g.X, g.Y, g.ContactRadius()) {
				continue
			}
			p.TakeDamage(boss.GelehkContactDamage)
			g.MarkContactDamageDealt(p.ID)
		}
	}
	// Vanessa the Ruthless — per-target cooldown tracked just like other bosses.
	for _, v := range vanessas {
		if v.State == boss.StateDead {
			continue
		}
		for _, p := range players {
			if p.State == player.StateDead || zone.Protects(p) {
				continue
			}
			if !v.CanDealContactDamageTo(p.ID) {
				continue
			}
			if !playerTouchesHostileBody(p, v.X, v.Y, v.ContactRadius()) {
				continue
			}
			p.TakeDamage(v.Damage)
			v.MarkContactDamageDealt(p.ID)
		}
	}
}

func playerTouchesHostileBody(p *player.Player, hx, hy, hostileRadius float64) bool {
	r := hostileRadius + player.Width/2 + contactTouchMargin
	return physics.DistanceSquared(hx, hy, p.X, p.Y) <= r*r
}

func withinWave(cx, cy, x, y, bodyRadius float64) bool {
	reach := player.WaveMaxRadius + bodyRadius
	return physics.DistanceSquared(cx, cy, x, y) <= reach*reach
}

func pushOutOfWave(cx, cy float64, x, y *float64, bodyRadius float64) bool {
	dx := *x - cx
	dy := *y - cy
	pushDist := player.WaveMaxRadius + bodyRadius + playerWavePushMargin
	if dx == 0 && dy == 0 {
		*x = cx + pushDist
		*y = cy
		return true
	}
	dist := math.Hypot(dx, dy)
	if dist == 0 {
		return false
	}
	*x = cx + (dx/dist)*pushDist
	*y = cy + (dy/dist)*pushDist
	return true
}

func dashDestination(x, y float64, direction domworld.Direction) (float64, float64) {
	switch direction {
	case domworld.DirectionUp:
		return x, y - player.DashDistance
	case domworld.DirectionDown:
		return x, y + player.DashDistance
	case domworld.DirectionLeft:
		return x - player.DashDistance, y
	default:
		return x + player.DashDistance, y
	}
}
