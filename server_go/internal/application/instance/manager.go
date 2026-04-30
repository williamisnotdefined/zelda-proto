// Package instance is the application-layer orchestrator that owns the four
// fixed phase worlds, routes new players to phase 1, and processes portal
// transfers between worlds.
package instance

import (
	"sync"
	"time"

	"github.com/williamisnotdefined/zelda-proto/server_go/internal/application/registries"
	appworld "github.com/williamisnotdefined/zelda-proto/server_go/internal/application/world"
	"github.com/williamisnotdefined/zelda-proto/server_go/internal/domain/player"
	"github.com/williamisnotdefined/zelda-proto/server_go/internal/domain/portal"
	domworld "github.com/williamisnotdefined/zelda-proto/server_go/internal/domain/world"
)

// Manager owns the four worlds (phase1..phase4) and player→instance routing.
type Manager struct {
	mu             sync.Mutex
	worlds         map[domworld.InstanceID]*appworld.World
	playerLocation map[string]domworld.InstanceID
	startPhase     domworld.InstanceID
}

// Config controls Manager construction.
type Config struct {
	IDs                   appworld.IDFactory
	StartPhase            domworld.InstanceID
	NowFunc               func() time.Time
	StressEnemiesPerChunk int
}

// New constructs the manager and seeds each world with starter content.
func New(cfg Config) *Manager {
	if cfg.StartPhase == "" || !cfg.StartPhase.IsValid() {
		cfg.StartPhase = domworld.InstancePhase1
	}
	m := &Manager{
		worlds:         make(map[domworld.InstanceID]*appworld.World),
		playerLocation: make(map[string]domworld.InstanceID),
		startPhase:     cfg.StartPhase,
	}
	defs := registries.All()
	if cfg.StressEnemiesPerChunk > 0 {
		for id, def := range defs {
			def.SpawnSystem.EnemiesPerChunk = cfg.StressEnemiesPerChunk
			defs[id] = def
		}
	}
	for _, id := range domworld.AllInstances() {
		def := defs[id]
		m.worlds[id] = appworld.New(appworld.Config{
			InstanceID: id,
			SpawnX:     def.SpawnX,
			SpawnY:     def.SpawnY,
			IDs:        cfg.IDs,
			NowFunc:    cfg.NowFunc,
			Definition: &def,
		})
		m.worlds[id].SeedStarterEnemies()
		// Phase 3 entry bosses are seeded independently of starter enemies
		// (matches InstanceManager.ensurePhase3BossesNear in the TS server).
		// Worlds without Phase3EntryBosses defined are a no-op.
		m.worlds[id].SeedPhase3Bosses()
		m.worlds[id].SeedPhase4Boss()
	}
	return m
}

// World returns the world for a phase.
func (m *Manager) World(id domworld.InstanceID) *appworld.World {
	m.mu.Lock()
	defer m.mu.Unlock()
	return m.worlds[id]
}

// Worlds returns all worlds keyed by instance id.
func (m *Manager) Worlds() map[domworld.InstanceID]*appworld.World {
	m.mu.Lock()
	defer m.mu.Unlock()
	out := make(map[domworld.InstanceID]*appworld.World, len(m.worlds))
	for k, v := range m.worlds {
		out[k] = v
	}
	return out
}

// AddPlayer routes a new player to the start phase.
func (m *Manager) AddPlayer(id, nickname string) (*player.Player, domworld.InstanceID) {
	m.mu.Lock()
	defer m.mu.Unlock()

	w := m.worlds[m.startPhase]
	p := w.AddPlayer(id, nickname, nil, nil)
	m.playerLocation[id] = m.startPhase
	return p, m.startPhase
}

// RemovePlayer detaches a player from whichever world they currently inhabit.
func (m *Manager) RemovePlayer(id string) {
	m.mu.Lock()
	defer m.mu.Unlock()
	loc, ok := m.playerLocation[id]
	if !ok {
		return
	}
	m.worlds[loc].RemovePlayer(id)
	delete(m.playerLocation, id)
}

// SuspendPlayer clears transient input/combat state for a disconnected player
// while leaving them resumable in their current world.
func (m *Manager) SuspendPlayer(id string) bool {
	m.mu.Lock()
	defer m.mu.Unlock()
	loc, ok := m.playerLocation[id]
	if !ok {
		return false
	}
	return m.worlds[loc].SuspendPlayer(id)
}

// LocationOf returns the instance currently hosting a player.
func (m *Manager) LocationOf(id string) (domworld.InstanceID, bool) {
	m.mu.Lock()
	defer m.mu.Unlock()
	loc, ok := m.playerLocation[id]
	return loc, ok
}

// Tick advances every world by dt and resolves portal transfers.
func (m *Manager) Tick(dt time.Duration) {
	m.mu.Lock()
	defer m.mu.Unlock()
	for _, w := range m.worlds {
		w.Tick(dt)
	}
	m.resolveTransfers()
}

func (m *Manager) resolveTransfers() {
	for fromID, w := range m.worlds {
		for _, req := range w.ConsumeTransferRequests() {
			target, ok := m.worlds[req.ToInstance]
			if !ok {
				continue
			}
			p := w.RemovePlayer(req.PlayerID)
			if p == nil {
				continue
			}
			// Transfers inherit the portal-system cooldown and then extend it to the
			// post-transfer window used by the legacy server, preventing bounce-backs.
			p.MarkPhaseTransferCooldown(800 * time.Millisecond)
			target.AdoptPlayer(p, req.TargetX, req.TargetY)
			m.playerLocation[req.PlayerID] = req.ToInstance
			// Per-instance on-enter hooks (mirror InstanceManager.transferPlayer
			// in the TS reference server). Phase 3 must (re)anchor the entry
			// boss trio to the player's actual entry point so the trio stays
			// visible after deaths/respawns; phases 2 and 4 top up their
			// starter populations near the entry.
			switch req.ToInstance {
			case domworld.InstancePhase2:
				target.EnsurePhase2PopulationNear(req.TargetX, req.TargetY)
			case domworld.InstancePhase3:
				target.EnsurePhase3BossesNear(req.TargetX, req.TargetY)
			case domworld.InstancePhase4:
				target.EnsurePhase4PopulationNear(req.TargetX, req.TargetY)
			}
			_ = fromID
		}
	}
}

// HandleInput forwards input to whatever world hosts the player.
func (m *Manager) HandleInput(playerID string, input player.Input) {
	m.mu.Lock()
	loc, ok := m.playerLocation[playerID]
	m.mu.Unlock()
	if !ok {
		return
	}
	m.worlds[loc].HandleInput(playerID, input)
}

// _ = portal.TransferRequest is referenced indirectly via World.
var _ = portal.TransferRequest{}
