// Package combat hosts the application-layer combat sub-systems that resolve
// player swings (PvE + PvP) and contact damage from enemies/bosses. The
// design mirrors the focused systems used by the TypeScript reference
// server (server/src/game/combat/*) so the Go runtime keeps the same
// auditable separation of concerns.
//
// Each system is stateless and receives the world slices it needs as
// arguments; the world.World orchestrator owns the maps and calls the
// systems in a fixed order during Tick().
package combat

import (
	"github.com/williamisnotdefined/zelda-proto/server_go/internal/application/safezone"
	"github.com/williamisnotdefined/zelda-proto/server_go/internal/domain/boss"
	"github.com/williamisnotdefined/zelda-proto/server_go/internal/domain/enemy"
	"github.com/williamisnotdefined/zelda-proto/server_go/internal/domain/physics"
	"github.com/williamisnotdefined/zelda-proto/server_go/internal/domain/player"
)

// PlayerMeleeSystem resolves player melee swings against enemies and bosses.
// Mirrors server/src/game/combat/PlayerAttackIntentSystem.ts (the TS server
// queues HitIntents; here we apply damage directly because the Go runtime
// does not yet have a virtual-HP resolution stage — kept for parity with
// the existing inline behavior).
type PlayerMeleeSystem struct{}

// Resolve runs swing resolution for every attacking player.
func (PlayerMeleeSystem) Resolve(
	players map[string]*player.Player,
	enemies map[string]*enemy.Enemy,
	dragons map[string]*boss.DragonLord,
	gelehks map[string]*boss.Gelehk,
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
	}
}

// PvPSystem resolves player-vs-player melee. Mirrors
// server/src/game/combat/PlayerPvpIntentSystem.ts. Both attacker and target
// safezone protection short-circuit damage application.
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

// ContactDamageSystem resolves enemy/boss body collisions that damage
// players. Mirrors server/src/game/combat/ContactDamageSystem.ts. Players
// inside the spawn safezone are immune.
type ContactDamageSystem struct{}

// Resolve applies contact damage from every alive enemy/dragon to overlapping
// alive, unprotected players.
func (ContactDamageSystem) Resolve(
	players map[string]*player.Player,
	enemies map[string]*enemy.Enemy,
	dragons map[string]*boss.DragonLord,
	zone safezone.Zone,
) {
	// Enemies — one player per enemy per tick (break after first hit).
	for _, e := range enemies {
		if e.State == enemy.StateDead || e.DamageCooldown > 0 {
			continue
		}
		ec := physics.EntityCircle(e.X, e.Y, e.Config.ContactRadius)
		for _, p := range players {
			if p.State == player.StateDead || zone.Protects(p) {
				continue
			}
			pb := physics.EntityAABB(p.X, p.Y, enemy.PlayerWidth, enemy.PlayerHeight)
			if !physics.CircleAABBOverlap(ec, pb) {
				continue
			}
			p.TakeDamage(e.Config.Damage)
			e.MarkContactDamageDealt()
			break
		}
	}
	// DragonLord-family bosses — per-target cooldown tracked on the boss.
	for _, d := range dragons {
		if d.State == boss.StateDead {
			continue
		}
		c := physics.EntityCircle(d.X, d.Y, d.ContactRadius())
		for _, p := range players {
			if p.State == player.StateDead || zone.Protects(p) {
				continue
			}
			if !d.CanDealContactDamageTo(p.ID) {
				continue
			}
			pb := physics.EntityAABB(p.X, p.Y, enemy.PlayerWidth, enemy.PlayerHeight)
			if !physics.CircleAABBOverlap(c, pb) {
				continue
			}
			p.TakeDamage(d.Damage)
			d.MarkContactDamageDealt(p.ID)
		}
	}
}
