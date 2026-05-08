// Package snapshot builds full and delta snapshots for clients, applying
// view culling, leaderboard ranking and last-processed-input tracking.
package snapshot

import (
	"reflect"
	"sort"
	"time"

	appworld "github.com/williamisnotdefined/zelda-proto/server/internal/application/world"
	"github.com/williamisnotdefined/zelda-proto/server/internal/domain/boss"
	"github.com/williamisnotdefined/zelda-proto/server/internal/domain/drop"
	"github.com/williamisnotdefined/zelda-proto/server/internal/domain/enemy"
	"github.com/williamisnotdefined/zelda-proto/server/internal/domain/hazard"
	"github.com/williamisnotdefined/zelda-proto/server/internal/domain/physics"
	"github.com/williamisnotdefined/zelda-proto/server/internal/domain/player"
	"github.com/williamisnotdefined/zelda-proto/server/internal/domain/portal"
	domworld "github.com/williamisnotdefined/zelda-proto/server/internal/domain/world"
)

// LeaderboardTopN is how many entries the leaderboard exposes.
const LeaderboardTopN = 10

// Snapshot is the full per-player snapshot.
type Snapshot struct {
	Tick                  uint64
	Instance              domworld.InstanceID
	Self                  player.Snapshot
	Players               []player.Snapshot
	Enemies               []enemy.Snapshot
	Bosses                []appworld.BossSnapshot
	Drops                 []drop.Snapshot
	Portals               []portal.Snapshot
	Hazards               []hazard.Snapshot
	IceZones              []boss.IceZone
	AOEIndicators         []boss.AOEIndicator
	WaveIndicators        []boss.WaveIndicator
	LastProcessedInputSeq int64
}

// Delta describes changes since a previous snapshot for an entity-keyed diff.
type Delta struct {
	Tick                  uint64
	Instance              domworld.InstanceID
	Full                  bool
	Self                  player.Snapshot
	PlayersUpsert         []player.Snapshot
	PlayersRemove         []string
	EnemiesUpsert         []enemy.Snapshot
	EnemyTransforms       []EnemyTransform
	EnemyStates           []EnemyState
	EnemiesRemove         []string
	BossesUpsert          []appworld.BossSnapshot
	BossesRemove          []string
	DropsUpsert           []drop.Snapshot
	DropsRemove           []string
	PortalsUpsert         []portal.Snapshot
	PortalsRemove         []string
	HazardsUpsert         []hazard.Snapshot
	HazardsRemove         []string
	IceZones              []boss.IceZone
	AOEIndicators         []boss.AOEIndicator
	WaveIndicators        []boss.WaveIndicator
	LastProcessedInputSeq int64
}

// EnemyTransform is a position-only enemy delta.
type EnemyTransform struct {
	ID   string
	X, Y float64
}

// EnemyState is an HP/state-only enemy delta.
type EnemyState struct {
	ID    string
	HP    int
	MaxHP int
	State enemy.State
}

// LeaderboardEntry is a single ranked player entry.
type LeaderboardEntry struct {
	PlayerID     string
	Nickname     string
	MonsterKills int
	PlayerKills  int
	Deaths       int
}

// Builder caches per-player previous snapshots to compute deltas.
type Builder struct {
	previous map[string]*Snapshot
}

// NewBuilder returns an empty builder.
func NewBuilder() *Builder {
	return &Builder{previous: make(map[string]*Snapshot)}
}

// Build returns the culled snapshot for the given player view.
func (b *Builder) Build(view appworld.SnapshotView, p *player.Player, instance domworld.InstanceID) Snapshot {
	snap := Snapshot{
		Tick:                  view.Tick,
		Instance:              instance,
		Self:                  p.Snapshot(),
		LastProcessedInputSeq: p.LastProcessedInputSeq,
		IceZones:              view.IceZones,
		AOEIndicators:         view.AOEIndicators,
		WaveIndicators:        view.WaveIndicators,
	}
	radius := domworld.ViewRadius
	for _, other := range view.Players {
		if other.ID == p.ID {
			continue
		}
		if !inRadius(p.X, p.Y, float64(other.X), float64(other.Y), radius) {
			continue
		}
		snap.Players = append(snap.Players, other)
	}
	for _, e := range view.Enemies {
		if inRadius(p.X, p.Y, float64(e.X), float64(e.Y), radius) {
			snap.Enemies = append(snap.Enemies, e)
		}
	}
	for _, bs := range view.Bosses {
		if inRadius(p.X, p.Y, bs.X, bs.Y, radius) {
			snap.Bosses = append(snap.Bosses, bs)
		}
	}
	for _, d := range view.Drops {
		if inRadius(p.X, p.Y, d.X, d.Y, radius) {
			snap.Drops = append(snap.Drops, d)
		}
	}
	for _, pt := range view.Portals {
		if inRadius(p.X, p.Y, pt.X, pt.Y, radius) {
			snap.Portals = append(snap.Portals, pt)
		}
	}
	for _, h := range view.Hazards {
		if inRadius(p.X, p.Y, h.X, h.Y, radius) {
			snap.Hazards = append(snap.Hazards, h)
		}
	}
	return snap
}

// Diff returns a delta vs the previously stored snapshot for the player.
// The first call for a player (or after Forget) returns a Full delta with all
// entities upserted; subsequent calls produce incremental enemyTransforms /
// enemyStates / removed*Ids.
func (b *Builder) Diff(playerID string, current Snapshot) Delta {
	prev := b.previous[playerID]
	delta := Delta{
		Tick:                  current.Tick,
		Instance:              current.Instance,
		Self:                  current.Self,
		LastProcessedInputSeq: current.LastProcessedInputSeq,
		IceZones:              current.IceZones,
		AOEIndicators:         current.AOEIndicators,
		WaveIndicators:        current.WaveIndicators,
	}
	if prev == nil {
		delta.Full = true
		delta.PlayersUpsert = current.Players
		delta.EnemiesUpsert = current.Enemies
		delta.BossesUpsert = current.Bosses
		delta.DropsUpsert = current.Drops
		delta.PortalsUpsert = current.Portals
		delta.HazardsUpsert = current.Hazards
	} else {
		delta.PlayersUpsert, delta.PlayersRemove = diffPlayers(prev.Players, current.Players)
		delta.EnemiesUpsert, delta.EnemyTransforms, delta.EnemyStates, delta.EnemiesRemove = diffEnemiesDetailed(prev.Enemies, current.Enemies)
		delta.BossesUpsert, delta.BossesRemove = diffBosses(prev.Bosses, current.Bosses)
		delta.DropsUpsert, delta.DropsRemove = diffDrops(prev.Drops, current.Drops)
		delta.PortalsUpsert, delta.PortalsRemove = diffPortals(prev.Portals, current.Portals)
		delta.HazardsUpsert, delta.HazardsRemove = diffHazards(prev.Hazards, current.Hazards)
	}
	cp := current
	b.previous[playerID] = &cp
	return delta
}

// Forget drops the cached previous snapshot for a player on disconnect.
func (b *Builder) Forget(playerID string) { delete(b.previous, playerID) }

// Leaderboard returns the top-N players ranked by monster kills (desc),
// breaking ties by player kills then nickname.
func Leaderboard(players []*player.Player, top int) []LeaderboardEntry {
	if top <= 0 {
		top = LeaderboardTopN
	}
	out := make([]LeaderboardEntry, 0, len(players))
	for _, p := range players {
		out = append(out, LeaderboardEntry{
			PlayerID:     p.ID,
			Nickname:     p.Nickname,
			MonsterKills: p.MonsterKills,
			PlayerKills:  p.PlayerKills,
			Deaths:       p.Deaths,
		})
	}
	sort.SliceStable(out, func(i, j int) bool {
		if out[i].MonsterKills != out[j].MonsterKills {
			return out[i].MonsterKills > out[j].MonsterKills
		}
		if out[i].PlayerKills != out[j].PlayerKills {
			return out[i].PlayerKills > out[j].PlayerKills
		}
		return out[i].Nickname < out[j].Nickname
	})
	if len(out) > top {
		out = out[:top]
	}
	return out
}

// Suspended is a hint to embed in network broadcasts when the manager has
// flagged the player as needing to resync.
type Suspended struct{ At time.Time }

func inRadius(x, y, ox, oy, radius float64) bool {
	return physics.DistanceSquared(x, y, ox, oy) <= radius*radius
}

func diffPlayers(prev, curr []player.Snapshot) (upsert []player.Snapshot, remove []string) {
	prevByID := make(map[string]player.Snapshot, len(prev))
	for _, s := range prev {
		prevByID[s.ID] = s
	}
	currByID := make(map[string]struct{}, len(curr))
	for _, s := range curr {
		currByID[s.ID] = struct{}{}
		if old, ok := prevByID[s.ID]; !ok || !reflect.DeepEqual(old, s) {
			upsert = append(upsert, s)
		}
	}
	for id := range prevByID {
		if _, ok := currByID[id]; !ok {
			remove = append(remove, id)
		}
	}
	return
}

func diffEnemies(prev, curr []enemy.Snapshot) (upsert []enemy.Snapshot, remove []string) {
	prevByID := make(map[string]enemy.Snapshot, len(prev))
	for _, s := range prev {
		prevByID[s.ID] = s
	}
	currByID := make(map[string]struct{}, len(curr))
	for _, s := range curr {
		currByID[s.ID] = struct{}{}
		if old, ok := prevByID[s.ID]; !ok || old != s {
			upsert = append(upsert, s)
		}
	}
	for id := range prevByID {
		if _, ok := currByID[id]; !ok {
			remove = append(remove, id)
		}
	}
	return
}

// diffEnemiesDetailed splits enemy diffs into transforms (position only) and
// state (HP/state) deltas, mirroring the TS SnapshotSerializer split. New
// enemies (or kind/variant changes) become full upserts.
func diffEnemiesDetailed(prev, curr []enemy.Snapshot) (
	upsert []enemy.Snapshot,
	transforms []EnemyTransform,
	states []EnemyState,
	remove []string,
) {
	prevByID := make(map[string]enemy.Snapshot, len(prev))
	for _, s := range prev {
		prevByID[s.ID] = s
	}
	currByID := make(map[string]struct{}, len(curr))
	for _, s := range curr {
		currByID[s.ID] = struct{}{}
		old, ok := prevByID[s.ID]
		if !ok || old.Kind != s.Kind || old.Elite != s.Elite || old.Variant != s.Variant {
			upsert = append(upsert, s)
			continue
		}
		transformChanged := old.X != s.X || old.Y != s.Y
		stateChanged := old.HP != s.HP || old.MaxHP != s.MaxHP || old.State != s.State
		if transformChanged {
			transforms = append(transforms, EnemyTransform{ID: s.ID, X: s.X, Y: s.Y})
		}
		if stateChanged {
			states = append(states, EnemyState{ID: s.ID, HP: s.HP, MaxHP: s.MaxHP, State: s.State})
		}
	}
	for id := range prevByID {
		if _, ok := currByID[id]; !ok {
			remove = append(remove, id)
		}
	}
	return
}

func diffBosses(prev, curr []appworld.BossSnapshot) (upsert []appworld.BossSnapshot, remove []string) {
	prevByID := make(map[string]appworld.BossSnapshot, len(prev))
	for _, s := range prev {
		prevByID[s.ID] = s
	}
	currByID := make(map[string]struct{}, len(curr))
	for _, s := range curr {
		currByID[s.ID] = struct{}{}
		if old, ok := prevByID[s.ID]; !ok || old != s {
			upsert = append(upsert, s)
		}
	}
	for id := range prevByID {
		if _, ok := currByID[id]; !ok {
			remove = append(remove, id)
		}
	}
	return
}

func diffDrops(prev, curr []drop.Snapshot) (upsert []drop.Snapshot, remove []string) {
	prevByID := make(map[string]drop.Snapshot, len(prev))
	for _, s := range prev {
		prevByID[s.ID] = s
	}
	currByID := make(map[string]struct{}, len(curr))
	for _, s := range curr {
		currByID[s.ID] = struct{}{}
		if old, ok := prevByID[s.ID]; !ok || old != s {
			upsert = append(upsert, s)
		}
	}
	for id := range prevByID {
		if _, ok := currByID[id]; !ok {
			remove = append(remove, id)
		}
	}
	return
}

func diffPortals(prev, curr []portal.Snapshot) (upsert []portal.Snapshot, remove []string) {
	prevByID := make(map[string]portal.Snapshot, len(prev))
	for _, s := range prev {
		prevByID[s.ID] = s
	}
	currByID := make(map[string]struct{}, len(curr))
	for _, s := range curr {
		currByID[s.ID] = struct{}{}
		if old, ok := prevByID[s.ID]; !ok || old != s {
			upsert = append(upsert, s)
		}
	}
	for id := range prevByID {
		if _, ok := currByID[id]; !ok {
			remove = append(remove, id)
		}
	}
	return
}

func diffHazards(prev, curr []hazard.Snapshot) (upsert []hazard.Snapshot, remove []string) {
	prevByID := make(map[string]hazard.Snapshot, len(prev))
	for _, s := range prev {
		prevByID[s.ID] = s
	}
	currByID := make(map[string]struct{}, len(curr))
	for _, s := range curr {
		currByID[s.ID] = struct{}{}
		if old, ok := prevByID[s.ID]; !ok || old != s {
			upsert = append(upsert, s)
		}
	}
	for id := range prevByID {
		if _, ok := currByID[id]; !ok {
			remove = append(remove, id)
		}
	}
	return
}
