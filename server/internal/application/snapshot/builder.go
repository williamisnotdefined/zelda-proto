// Package snapshot builds full and delta snapshots for clients, applying
// view culling, leaderboard ranking and last-processed-input tracking.
package snapshot

import (
	"sort"
	"sync"
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
	ID                    string
	HP                    int
	MaxHP                 int
	State                 enemy.State
	BurningTicksRemaining int
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
	mu       sync.Mutex
	previous map[string]*Snapshot
	epochs   map[string]uint64
}

type pendingDelta struct {
	Delta    Delta
	playerID string
	snapshot Snapshot
	epoch    uint64
}

// NewBuilder returns an empty builder.
func NewBuilder() *Builder {
	return &Builder{previous: make(map[string]*Snapshot), epochs: make(map[string]uint64)}
}

// Build returns the culled snapshot for the given player view.
func (b *Builder) Build(view appworld.SnapshotView, self player.Snapshot, instance domworld.InstanceID) Snapshot {
	snap := Snapshot{
		Tick:                  view.Tick,
		Instance:              instance,
		Self:                  self,
		LastProcessedInputSeq: self.LastProcessedInputSeq,
		IceZones:              view.IceZones,
		AOEIndicators:         view.AOEIndicators,
		WaveIndicators:        view.WaveIndicators,
	}
	if len(view.Players) > 1 {
		snap.Players = make([]player.Snapshot, 0, len(view.Players)-1)
	}
	if len(view.Enemies) > 0 {
		snap.Enemies = make([]enemy.Snapshot, 0, len(view.Enemies))
	}
	if len(view.Bosses) > 0 {
		snap.Bosses = make([]appworld.BossSnapshot, 0, len(view.Bosses))
	}
	if len(view.Drops) > 0 {
		snap.Drops = make([]drop.Snapshot, 0, len(view.Drops))
	}
	if len(view.Portals) > 0 {
		snap.Portals = make([]portal.Snapshot, 0, len(view.Portals))
	}
	if len(view.Hazards) > 0 {
		snap.Hazards = make([]hazard.Snapshot, 0, len(view.Hazards))
	}
	radius := domworld.ViewRadius
	for _, other := range view.Players {
		if other.ID == self.ID {
			continue
		}
		if !inRadius(float64(self.X), float64(self.Y), float64(other.X), float64(other.Y), radius) {
			continue
		}
		snap.Players = append(snap.Players, other)
	}
	for _, e := range view.Enemies {
		if inRadius(float64(self.X), float64(self.Y), float64(e.X), float64(e.Y), radius) {
			snap.Enemies = append(snap.Enemies, e)
		}
	}
	for _, bs := range view.Bosses {
		if inRadius(float64(self.X), float64(self.Y), bs.X, bs.Y, radius) {
			snap.Bosses = append(snap.Bosses, bs)
		}
	}
	for _, d := range view.Drops {
		if inRadius(float64(self.X), float64(self.Y), d.X, d.Y, radius) {
			snap.Drops = append(snap.Drops, d)
		}
	}
	for _, pt := range view.Portals {
		if inRadius(float64(self.X), float64(self.Y), pt.X, pt.Y, radius) {
			snap.Portals = append(snap.Portals, pt)
		}
	}
	for _, h := range view.Hazards {
		if inRadius(float64(self.X), float64(self.Y), h.X, h.Y, radius) {
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
	b.mu.Lock()
	defer b.mu.Unlock()

	delta := b.diffLocked(playerID, current)
	b.commitLocked(playerID, current)
	return delta
}

// Preview computes a delta without advancing the stored base snapshot. Call
// Commit only after the delta is successfully accepted by the transport.
func (b *Builder) Preview(playerID string, current Snapshot) pendingDelta {
	b.mu.Lock()
	defer b.mu.Unlock()

	return pendingDelta{
		Delta:    b.diffLocked(playerID, current),
		playerID: playerID,
		snapshot: current,
		epoch:    b.epochs[playerID],
	}
}

// Commit advances the stored base snapshot for a previously previewed delta.
// If Forget ran in between, the preview is stale and must not be committed.
func (b *Builder) Commit(pending pendingDelta) bool {
	b.mu.Lock()
	defer b.mu.Unlock()

	if b.epochs[pending.playerID] != pending.epoch {
		return false
	}
	b.previous[pending.playerID] = &pending.snapshot
	return true
}

func (b *Builder) diffLocked(playerID string, current Snapshot) Delta {
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
	return delta
}

// Forget drops the cached previous snapshot for a player on disconnect.
func (b *Builder) Forget(playerID string) {
	b.mu.Lock()
	defer b.mu.Unlock()

	delete(b.previous, playerID)
	b.epochs[playerID] += 1
}

// HasPrevious reports whether a player currently has a cached base snapshot.
func (b *Builder) HasPrevious(playerID string) bool {
	b.mu.Lock()
	defer b.mu.Unlock()

	_, ok := b.previous[playerID]
	return ok
}

func (b *Builder) commitLocked(playerID string, current Snapshot) {
	b.previous[playerID] = &current
}

// Leaderboard returns the top-N players ranked by monster kills (desc),
// breaking ties by player kills then nickname.
func Leaderboard(players []*player.Player, top int) []LeaderboardEntry {
	snapshots := make([]player.Snapshot, 0, len(players))
	for _, p := range players {
		snapshots = append(snapshots, p.Snapshot())
	}
	return LeaderboardFromSnapshots(snapshots, top)
}

// LeaderboardFromSnapshots ranks immutable player projections.
func LeaderboardFromSnapshots(players []player.Snapshot, top int) []LeaderboardEntry {
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
	i, j := 0, 0
	for i < len(prev) && j < len(curr) {
		old, next := prev[i], curr[j]
		switch {
		case old.ID == next.ID:
			if !playerSnapshotsEqual(old, next) {
				upsert = append(upsert, next)
			}
			i++
			j++
		case old.ID < next.ID:
			remove = append(remove, old.ID)
			i++
		default:
			upsert = append(upsert, next)
			j++
		}
	}
	for ; i < len(prev); i++ {
		remove = append(remove, prev[i].ID)
	}
	for ; j < len(curr); j++ {
		upsert = append(upsert, curr[j])
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
	i, j := 0, 0
	for i < len(prev) && j < len(curr) {
		old, s := prev[i], curr[j]
		switch {
		case old.ID == s.ID:
			if old.Kind != s.Kind || old.Elite != s.Elite || old.Variant != s.Variant {
				upsert = append(upsert, s)
				i++
				j++
				continue
			}
			transformChanged := old.X != s.X || old.Y != s.Y
			stateChanged := old.HP != s.HP || old.MaxHP != s.MaxHP || old.State != s.State || old.BurningTicksRemaining != s.BurningTicksRemaining
			if transformChanged {
				transforms = append(transforms, EnemyTransform{ID: s.ID, X: s.X, Y: s.Y})
			}
			if stateChanged {
				states = append(states, EnemyState{ID: s.ID, HP: s.HP, MaxHP: s.MaxHP, State: s.State, BurningTicksRemaining: s.BurningTicksRemaining})
			}
			i++
			j++
		case old.ID < s.ID:
			remove = append(remove, old.ID)
			i++
		default:
			upsert = append(upsert, s)
			j++
		}
	}
	for ; i < len(prev); i++ {
		remove = append(remove, prev[i].ID)
	}
	for ; j < len(curr); j++ {
		upsert = append(upsert, curr[j])
	}
	return
}

func diffBosses(prev, curr []appworld.BossSnapshot) (upsert []appworld.BossSnapshot, remove []string) {
	i, j := 0, 0
	for i < len(prev) && j < len(curr) {
		old, next := prev[i], curr[j]
		switch {
		case old.ID == next.ID:
			if old != next {
				upsert = append(upsert, next)
			}
			i++
			j++
		case old.ID < next.ID:
			remove = append(remove, old.ID)
			i++
		default:
			upsert = append(upsert, next)
			j++
		}
	}
	for ; i < len(prev); i++ {
		remove = append(remove, prev[i].ID)
	}
	for ; j < len(curr); j++ {
		upsert = append(upsert, curr[j])
	}
	return
}

func diffDrops(prev, curr []drop.Snapshot) (upsert []drop.Snapshot, remove []string) {
	i, j := 0, 0
	for i < len(prev) && j < len(curr) {
		old, next := prev[i], curr[j]
		switch {
		case old.ID == next.ID:
			if old != next {
				upsert = append(upsert, next)
			}
			i++
			j++
		case old.ID < next.ID:
			remove = append(remove, old.ID)
			i++
		default:
			upsert = append(upsert, next)
			j++
		}
	}
	for ; i < len(prev); i++ {
		remove = append(remove, prev[i].ID)
	}
	for ; j < len(curr); j++ {
		upsert = append(upsert, curr[j])
	}
	return
}

func diffPortals(prev, curr []portal.Snapshot) (upsert []portal.Snapshot, remove []string) {
	i, j := 0, 0
	for i < len(prev) && j < len(curr) {
		old, next := prev[i], curr[j]
		switch {
		case old.ID == next.ID:
			if old != next {
				upsert = append(upsert, next)
			}
			i++
			j++
		case old.ID < next.ID:
			remove = append(remove, old.ID)
			i++
		default:
			upsert = append(upsert, next)
			j++
		}
	}
	for ; i < len(prev); i++ {
		remove = append(remove, prev[i].ID)
	}
	for ; j < len(curr); j++ {
		upsert = append(upsert, curr[j])
	}
	return
}

func diffHazards(prev, curr []hazard.Snapshot) (upsert []hazard.Snapshot, remove []string) {
	i, j := 0, 0
	for i < len(prev) && j < len(curr) {
		old, next := prev[i], curr[j]
		switch {
		case old.ID == next.ID:
			if old != next {
				upsert = append(upsert, next)
			}
			i++
			j++
		case old.ID < next.ID:
			remove = append(remove, old.ID)
			i++
		default:
			upsert = append(upsert, next)
			j++
		}
	}
	for ; i < len(prev); i++ {
		remove = append(remove, prev[i].ID)
	}
	for ; j < len(curr); j++ {
		upsert = append(upsert, curr[j])
	}
	return
}

func playerSnapshotsEqual(a, b player.Snapshot) bool {
	if a.ID != b.ID || a.Nickname != b.Nickname || a.X != b.X || a.Y != b.Y || a.HP != b.HP || a.MaxHP != b.MaxHP ||
		a.State != b.State || a.Direction != b.Direction || a.PlayerKills != b.PlayerKills || a.MonsterKills != b.MonsterKills ||
		a.Deaths != b.Deaths || a.ToastyCount != b.ToastyCount || a.LastProcessedInputSeq != b.LastProcessedInputSeq ||
		a.ShurikenActive != b.ShurikenActive || len(a.StatusEffects) != len(b.StatusEffects) {
		return false
	}
	for kind, status := range a.StatusEffects {
		if b.StatusEffects[kind] != status {
			return false
		}
	}
	return true
}
