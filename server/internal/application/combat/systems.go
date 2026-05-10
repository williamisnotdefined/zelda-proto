// Package combat hosts the application-layer combat sub-systems that resolve
// player skills, PvP and contact damage from enemies/bosses. The design keeps
// the same auditable separation of concerns across focused sub-systems.
//
// Each system is stateless and receives the world slices it needs as
// arguments; the world.World orchestrator owns the maps and calls the
// systems in a fixed order during Tick().
package combat

import (
	"math"
	"time"

	"github.com/williamisnotdefined/zelda-proto/server/internal/application/safezone"
	"github.com/williamisnotdefined/zelda-proto/server/internal/domain/boss"
	"github.com/williamisnotdefined/zelda-proto/server/internal/domain/enemy"
	"github.com/williamisnotdefined/zelda-proto/server/internal/domain/physics"
	"github.com/williamisnotdefined/zelda-proto/server/internal/domain/player"
	domworld "github.com/williamisnotdefined/zelda-proto/server/internal/domain/world"
)

const contactTouchMargin = 2.0
const playerWavePushMargin = 12.0

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

// PlayerNumbSystem resolves the gray wave variant that also stuns hostiles.
type PlayerNumbSystem struct{}

// PlayerPullSystem resolves the red wave variant that collapses targets into
// the caster and temporarily allows stacked bodies to remain overlapped.
type PlayerPullSystem struct{}

// PlayerVenomSystem resolves the green wave variant that marks hostiles for
// follow-up bonus damage and lifesteal.
type PlayerVenomSystem struct{}

// PlayerConfusionSystem resolves the neon confusion wave. The wave damages all
// PvE hostiles it captured, but only normal non-elite enemies receive the
// 20-second confusion status; players, bosses and elite enemies are never
// confused.
type PlayerConfusionSystem struct{}

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
	return resolvePlayerWaveLike(
		players,
		enemies,
		dragons,
		gelehks,
		vanessas,
		zone,
		(*player.Player).ConsumeWaveRelease,
		player.WaveDamage,
		player.WaveLifeStealRatio,
		pushOutOfWave,
		nil,
	)
}

// Resolve applies numb damage without knockback. It only damages and leaves
// targets frozen by the world-layer pre-lock.
func (PlayerNumbSystem) Resolve(
	players map[string]*player.Player,
	enemies map[string]*enemy.Enemy,
	dragons map[string]*boss.DragonLord,
	gelehks map[string]*boss.Gelehk,
	vanessas map[string]*boss.VanessaTheRuthless,
	zone safezone.Zone,
) bool {
	return resolvePlayerWaveLike(
		players,
		enemies,
		dragons,
		gelehks,
		vanessas,
		zone,
		(*player.Player).ConsumeNumbRelease,
		player.NumbDamage,
		player.NumbLifeStealRatio,
		nil,
		nil,
	)
}

// Resolve applies pull damage and collapses surviving targets into the caster.
// Marked bodies may overlap briefly so the pull cluster is preserved.
func (PlayerPullSystem) Resolve(
	players map[string]*player.Player,
	enemies map[string]*enemy.Enemy,
	dragons map[string]*boss.DragonLord,
	gelehks map[string]*boss.Gelehk,
	vanessas map[string]*boss.VanessaTheRuthless,
	zone safezone.Zone,
	markOverlap PlayerPullOverlapMarker,
) bool {
	return resolvePlayerWaveLike(
		players,
		enemies,
		dragons,
		gelehks,
		vanessas,
		zone,
		(*player.Player).ConsumePullRelease,
		player.PullDamage,
		player.PullLifeStealRatio,
		pullIntoWave,
		markOverlap,
	)
}

// PlayerVenomMarker arms the post-hit venom debuff for the given hostile.
type PlayerVenomMarker func(kind, id, sourcePlayerID string, duration time.Duration)

// PlayerConfusionMarker arms the confusion status on a normal enemy.
type PlayerConfusionMarker func(id, sourcePlayerID string, duration time.Duration)

// Resolve applies venom damage to PvE targets only and marks surviving
// hostiles for follow-up amplified damage.
func (PlayerVenomSystem) Resolve(
	players map[string]*player.Player,
	enemies map[string]*enemy.Enemy,
	dragons map[string]*boss.DragonLord,
	gelehks map[string]*boss.Gelehk,
	vanessas map[string]*boss.VanessaTheRuthless,
	markVenom PlayerVenomMarker,
) bool {
	for _, caster := range players {
		_, _, targets, castID, ok := caster.ConsumeVenomRelease()
		if !ok {
			continue
		}
		totalDamage := 0
		for _, id := range targets.EnemyIDs {
			e := enemies[id]
			if e == nil || e.State == enemy.StateDead {
				continue
			}
			beforeHP := e.HP
			e.TakeDamage(player.VenomDamage)
			dealt := beforeHP - e.HP
			totalDamage += dealt
			if e.State == enemy.StateDead {
				caster.MonsterKills++
				caster.RecordMonsterKillInCast(castID)
				continue
			}
			if dealt > 0 && markVenom != nil {
				markVenom("enemy", e.ID, caster.ID, player.VenomDebuffDuration)
			}
		}
		for _, id := range targets.DragonIDs {
			d := dragons[id]
			if d == nil || d.State == boss.StateDead {
				continue
			}
			beforeHP := d.HP
			d.TakeDamage(player.VenomDamage)
			dealt := beforeHP - d.HP
			totalDamage += dealt
			if d.State == boss.StateDead {
				caster.MonsterKills++
				caster.RecordMonsterKillInCast(castID)
				continue
			}
			if dealt > 0 && markVenom != nil {
				markVenom("boss", d.ID, caster.ID, player.VenomDebuffDuration)
			}
		}
		for _, id := range targets.GelehkIDs {
			g := gelehks[id]
			if g == nil || g.State == boss.StateDead {
				continue
			}
			beforeHP := g.HP
			g.TakeDamage(player.VenomDamage)
			dealt := beforeHP - g.HP
			totalDamage += dealt
			if g.State == boss.StateDead {
				caster.MonsterKills++
				caster.RecordMonsterKillInCast(castID)
				continue
			}
			if dealt > 0 && markVenom != nil {
				markVenom("boss", g.ID, caster.ID, player.VenomDebuffDuration)
			}
		}
		for _, id := range targets.VanessaIDs {
			v := vanessas[id]
			if v == nil || v.State == boss.StateDead {
				continue
			}
			beforeHP := v.HP
			v.TakeDamage(player.VenomDamage)
			dealt := beforeHP - v.HP
			totalDamage += dealt
			if v.State == boss.StateDead {
				caster.MonsterKills++
				caster.RecordMonsterKillInCast(castID)
				continue
			}
			if dealt > 0 && markVenom != nil {
				markVenom("boss", v.ID, caster.ID, player.VenomDebuffDuration)
			}
		}
		if totalDamage > 0 {
			caster.Heal(int(math.Ceil(float64(totalDamage) * player.VenomLifeStealRatio)))
		}
		caster.FinishCast(castID)
	}
	return false
}

// Resolve applies confusion wave damage to monsters/bosses and marks surviving
// normal non-elite enemies to temporarily fight other monsters.
func (PlayerConfusionSystem) Resolve(
	players map[string]*player.Player,
	enemies map[string]*enemy.Enemy,
	dragons map[string]*boss.DragonLord,
	gelehks map[string]*boss.Gelehk,
	vanessas map[string]*boss.VanessaTheRuthless,
	markConfusion PlayerConfusionMarker,
) bool {
	for _, caster := range players {
		_, _, targets, castID, ok := caster.ConsumeConfusionRelease()
		if !ok {
			continue
		}
		totalDamage := 0
		for _, id := range targets.EnemyIDs {
			e := enemies[id]
			if e == nil || e.State == enemy.StateDead {
				continue
			}
			beforeHP := e.HP
			e.TakeDamage(player.ConfusionDamage)
			dealt := beforeHP - e.HP
			totalDamage += dealt
			if e.State == enemy.StateDead {
				caster.MonsterKills++
				caster.RecordMonsterKillInCast(castID)
				continue
			}
			if dealt > 0 && !e.Elite && markConfusion != nil {
				markConfusion(e.ID, caster.ID, player.ConfusionDuration)
			}
		}
		for _, id := range targets.DragonIDs {
			d := dragons[id]
			if d == nil || d.State == boss.StateDead {
				continue
			}
			beforeHP := d.HP
			d.TakeDamage(player.ConfusionDamage)
			dealt := beforeHP - d.HP
			totalDamage += dealt
			if d.State == boss.StateDead {
				caster.MonsterKills++
				caster.RecordMonsterKillInCast(castID)
			}
		}
		for _, id := range targets.GelehkIDs {
			g := gelehks[id]
			if g == nil || g.State == boss.StateDead {
				continue
			}
			beforeHP := g.HP
			g.TakeDamage(player.ConfusionDamage)
			dealt := beforeHP - g.HP
			totalDamage += dealt
			if g.State == boss.StateDead {
				caster.MonsterKills++
				caster.RecordMonsterKillInCast(castID)
			}
		}
		for _, id := range targets.VanessaIDs {
			v := vanessas[id]
			if v == nil || v.State == boss.StateDead {
				continue
			}
			beforeHP := v.HP
			v.TakeDamage(player.ConfusionDamage)
			dealt := beforeHP - v.HP
			totalDamage += dealt
			if v.State == boss.StateDead {
				caster.MonsterKills++
				caster.RecordMonsterKillInCast(castID)
			}
		}
		if totalDamage > 0 {
			caster.Heal(int(math.Ceil(float64(totalDamage) * player.ConfusionLifeStealRatio)))
		}
		caster.FinishCast(castID)
	}
	return false
}

type waveReleaseConsumer func(*player.Player) (float64, float64, player.WaveTargets, uint64, bool)
type waveTargetMover func(cx, cy float64, x, y *float64, bodyRadius float64) bool
type PlayerPullOverlapMarker func(kind, id string, duration time.Duration)

func resolvePlayerWaveLike(
	players map[string]*player.Player,
	enemies map[string]*enemy.Enemy,
	dragons map[string]*boss.DragonLord,
	gelehks map[string]*boss.Gelehk,
	vanessas map[string]*boss.VanessaTheRuthless,
	zone safezone.Zone,
	consume waveReleaseConsumer,
	damage int,
	lifeStealRatio float64,
	moveTarget waveTargetMover,
	markOverlap PlayerPullOverlapMarker,
) bool {
	moved := false
	for _, caster := range players {
		cx, cy, targets, castID, ok := consume(caster)
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
			e.TakeDamage(damage)
			totalDamage += beforeHP - e.HP
			if e.State == enemy.StateDead {
				caster.MonsterKills++
				caster.RecordMonsterKillInCast(castID)
				continue
			}
			if moveTarget != nil && moveTarget(cx, cy, &e.X, &e.Y, e.CollisionRadius()) {
				e.TargetID = ""
				e.State = enemy.StateIdle
				if markOverlap != nil {
					markOverlap("player", caster.ID, player.PullClusterHoldDuration)
					markOverlap("enemy", e.ID, player.PullClusterHoldDuration)
				}
				moved = true
			}
		}
		for _, id := range targets.DragonIDs {
			d := dragons[id]
			if d == nil || d.State == boss.StateDead {
				continue
			}
			beforeHP := d.HP
			d.TakeDamage(damage)
			totalDamage += beforeHP - d.HP
			if d.State == boss.StateDead {
				caster.MonsterKills++
				caster.RecordMonsterKillInCast(castID)
				continue
			}
			if moveTarget != nil && moveTarget(cx, cy, &d.X, &d.Y, d.ContactRadius()) {
				d.TargetID = ""
				d.State = boss.StateIdle
				if markOverlap != nil {
					markOverlap("player", caster.ID, player.PullClusterHoldDuration)
					markOverlap("boss", d.ID, player.PullClusterHoldDuration)
				}
				moved = true
			}
		}
		for _, id := range targets.GelehkIDs {
			g := gelehks[id]
			if g == nil || g.State == boss.StateDead {
				continue
			}
			beforeHP := g.HP
			g.TakeDamage(damage)
			totalDamage += beforeHP - g.HP
			if g.State == boss.StateDead {
				caster.MonsterKills++
				caster.RecordMonsterKillInCast(castID)
				continue
			}
			if moveTarget != nil && moveTarget(cx, cy, &g.X, &g.Y, g.ContactRadius()) {
				g.StopChargeOnCollision()
				if markOverlap != nil {
					markOverlap("player", caster.ID, player.PullClusterHoldDuration)
					markOverlap("boss", g.ID, player.PullClusterHoldDuration)
				}
				moved = true
			}
		}
		for _, id := range targets.VanessaIDs {
			v := vanessas[id]
			if v == nil || v.State == boss.StateDead {
				continue
			}
			beforeHP := v.HP
			v.TakeDamage(damage)
			totalDamage += beforeHP - v.HP
			if v.State == boss.StateDead {
				caster.MonsterKills++
				caster.RecordMonsterKillInCast(castID)
				continue
			}
			if moveTarget != nil && moveTarget(cx, cy, &v.X, &v.Y, v.ContactRadius()) {
				v.TargetID = ""
				v.State = boss.StateIdle
				if markOverlap != nil {
					markOverlap("player", caster.ID, player.PullClusterHoldDuration)
					markOverlap("boss", v.ID, player.PullClusterHoldDuration)
				}
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
			target.TakeDamage(damage)
			totalDamage += beforeHP - target.HP
			if target.State == player.StateDead {
				caster.PlayerKills++
				continue
			}
			if moveTarget != nil && moveTarget(cx, cy, &target.X, &target.Y, player.Width/2) {
				if markOverlap != nil {
					markOverlap("player", caster.ID, player.PullOverlapDuration)
					markOverlap("player", target.ID, player.PullOverlapDuration)
				}
				moved = true
			}
		}
		if totalDamage > 0 {
			caster.Heal(int(math.Ceil(float64(totalDamage) * lifeStealRatio)))
		}
		caster.FinishCast(castID)
	}
	return moved
}

// DashTrailSpawner receives the authoritative dash path so the world can spawn
// the blue flame trail after movement is resolved.
type DashTrailSpawner func(sourcePlayerID string, startX, startY float64, direction domworld.Direction)

// PlayerLandmineSpawner receives a queued landmine cast so the world can spawn
// the hazard after movement is resolved.
type PlayerLandmineSpawner func(
	sourcePlayerID string,
	sourceCastID uint64,
	startX, startY float64,
	direction domworld.Direction,
	hitsPlayers bool,
)

// PlayerLandmineSystem resolves queued player landmine casts.
type PlayerLandmineSystem struct{}

// Resolve emits every queued landmine cast.
func (PlayerLandmineSystem) Resolve(
	players map[string]*player.Player,
	zone safezone.Zone,
	spawnLandmine PlayerLandmineSpawner,
) {
	if spawnLandmine == nil {
		return
	}
	for _, caster := range players {
		startX, startY, direction, castID, ok := caster.ConsumeLandmineCast()
		if !ok || direction == "" || caster.State == player.StateDead {
			continue
		}
		spawnLandmine(caster.ID, castID, startX, startY, direction, !zone.Protects(caster))
	}
}

// PlayerMolotovSpawner receives a queued molotov cast so the world can spawn
// the projectile after movement is resolved.
type PlayerMolotovSpawner func(
	sourcePlayerID string,
	sourceCastID uint64,
	startX, startY float64,
	direction domworld.Direction,
	hitsPlayers bool,
)

// PlayerMolotovSystem resolves queued player molotov casts.
type PlayerMolotovSystem struct{}

// Resolve emits every queued molotov cast.
func (PlayerMolotovSystem) Resolve(
	players map[string]*player.Player,
	zone safezone.Zone,
	spawnMolotov PlayerMolotovSpawner,
) {
	if spawnMolotov == nil {
		return
	}
	for _, caster := range players {
		startX, startY, direction, castID, ok := caster.ConsumeMolotovCast()
		if !ok || direction == "" || caster.State == player.StateDead {
			continue
		}
		spawnMolotov(caster.ID, castID, startX, startY, direction, !zone.Protects(caster))
	}
}

// PlayerGrenadeSpawner receives a queued grenade cast so the world can spawn
// the projectile after movement is resolved.
type PlayerGrenadeSpawner func(
	sourcePlayerID string,
	sourceCastID uint64,
	startX, startY float64,
	direction domworld.Direction,
	hitsPlayers bool,
)

// PlayerGrenadeSystem resolves queued player grenade casts.
type PlayerGrenadeSystem struct{}

// Resolve emits every queued grenade cast.
func (PlayerGrenadeSystem) Resolve(
	players map[string]*player.Player,
	zone safezone.Zone,
	spawnGrenade PlayerGrenadeSpawner,
) {
	if spawnGrenade == nil {
		return
	}
	for _, caster := range players {
		startX, startY, direction, castID, ok := caster.ConsumeGrenadeCast()
		if !ok || direction == "" || caster.State == player.StateDead {
			continue
		}
		spawnGrenade(caster.ID, castID, startX, startY, direction, !zone.Protects(caster))
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

func pullIntoWave(cx, cy float64, x, y *float64, _ float64) bool {
	if *x == cx && *y == cy {
		return false
	}
	*x = cx
	*y = cy
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
