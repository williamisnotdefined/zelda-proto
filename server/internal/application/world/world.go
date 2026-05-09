// Package world is the application-layer runtime for a single instance:
// it owns the players, enemies, bosses, drops, portals and hazards, drives
// the simulation tick in the canonical order, and exposes spatial queries
// used by the snapshot builder and combat systems.
package world

import (
	"math"
	"math/rand"
	"sync"
	"time"

	"github.com/williamisnotdefined/zelda-proto/server/internal/application/bossregion"
	appcombat "github.com/williamisnotdefined/zelda-proto/server/internal/application/combat"
	"github.com/williamisnotdefined/zelda-proto/server/internal/application/registries"
	"github.com/williamisnotdefined/zelda-proto/server/internal/application/safezone"
	"github.com/williamisnotdefined/zelda-proto/server/internal/application/spatial"
	"github.com/williamisnotdefined/zelda-proto/server/internal/application/spawn"
	"github.com/williamisnotdefined/zelda-proto/server/internal/config"
	"github.com/williamisnotdefined/zelda-proto/server/internal/domain/boss"
	"github.com/williamisnotdefined/zelda-proto/server/internal/domain/combat"
	"github.com/williamisnotdefined/zelda-proto/server/internal/domain/drop"
	"github.com/williamisnotdefined/zelda-proto/server/internal/domain/enemy"
	"github.com/williamisnotdefined/zelda-proto/server/internal/domain/hazard"
	"github.com/williamisnotdefined/zelda-proto/server/internal/domain/physics"
	"github.com/williamisnotdefined/zelda-proto/server/internal/domain/player"
	"github.com/williamisnotdefined/zelda-proto/server/internal/domain/portal"
	domworld "github.com/williamisnotdefined/zelda-proto/server/internal/domain/world"
)

// PlayerRespawnTime exposes the configured respawn duration for callers that
// still import it from the world package. The source of truth is
// config.DefaultBalancing.PlayerRespawnTime.
var PlayerRespawnTime = config.DefaultBalancing.PlayerRespawnTime

// IDFactory is the interface used to mint runtime entity IDs (drops,
// hazards, portals, etc.).
type IDFactory interface {
	NewID(prefix string) string
}

// Config controls how a World is wired.
type Config struct {
	InstanceID domworld.InstanceID
	SpawnX     float64
	SpawnY     float64
	IDs        IDFactory
	Rand       *rand.Rand
	NowFunc    func() time.Time
	// Definition (optional): when set, the world wires the chunk SpawnSystem,
	// BossRegionSystem, initial portals, boss-death portals and starter
	// populations from the registry definition. The minimal zero-config path
	// (no SpawnSystem/BossRegion) is preserved for unit tests.
	Definition *registries.InstanceDefinition
}

// World is the canonical game state for a single instance.
type World struct {
	mu sync.Mutex

	cfg Config
	now time.Time

	players  map[string]*player.Player
	enemies  map[string]*enemy.Enemy
	dragons  map[string]*boss.DragonLord
	gelehks  map[string]*boss.Gelehk
	vanessas map[string]*boss.VanessaTheRuthless
	drops    map[string]*drop.Drop
	portals  map[string]*portal.Portal
	hazards  map[string]*hazard.Hazard

	playerIndex *spatial.Index
	enemyIndex  *spatial.Index
	bossIndex   *spatial.Index
	dropIndex   *spatial.Index
	portalIndex *spatial.Index
	hazardIndex *spatial.Index

	pendingHits      []combat.HitIntent
	transferRequests []portal.TransferRequest
	pendingFireLines []pendingFireLine
	tick             uint64

	spawnSystem            *spawn.System
	bossRegionSystem       *bossregion.System
	def                    *registries.InstanceDefinition
	handledBossDeath       map[string]struct{}
	portalOverlapsByPlayer map[string]map[string]struct{}
	wasSafeZoneActive      bool
	waveFrozenEnemies      map[string]time.Duration
	waveFrozenDragons      map[string]time.Duration
	waveFrozenGelehks      map[string]time.Duration
	waveFrozenVanessas     map[string]time.Duration
	pullOverlapBodies      map[string]time.Duration
	venomDebuffs           map[string]venomDebuff
	molotovBurns           map[string]molotovBurn
}

type pendingFireLine struct {
	x, y       float64
	dirX, dirY int
	kind       hazard.Kind
	tint       uint32
	nextSeg    int
	nextSpawn  time.Time
}

type venomDebuff struct {
	SourcePlayerID string
	Remaining      time.Duration
}

type molotovBurn struct {
	Kind           string
	ID             string
	SourcePlayerID string
	TicksRemaining int
	TickTimer      time.Duration
}

// New constructs a World with empty state.
func New(cfg Config) *World {
	if cfg.NowFunc == nil {
		cfg.NowFunc = time.Now
	}
	if cfg.Rand == nil {
		cfg.Rand = rand.New(rand.NewSource(time.Now().UnixNano()))
	}
	w := &World{
		cfg:                    cfg,
		now:                    cfg.NowFunc(),
		players:                make(map[string]*player.Player),
		enemies:                make(map[string]*enemy.Enemy),
		dragons:                make(map[string]*boss.DragonLord),
		gelehks:                make(map[string]*boss.Gelehk),
		vanessas:               make(map[string]*boss.VanessaTheRuthless),
		drops:                  make(map[string]*drop.Drop),
		portals:                make(map[string]*portal.Portal),
		hazards:                make(map[string]*hazard.Hazard),
		playerIndex:            spatial.New(256),
		enemyIndex:             spatial.New(256),
		bossIndex:              spatial.New(256),
		dropIndex:              spatial.New(128),
		portalIndex:            spatial.New(128),
		hazardIndex:            spatial.New(128),
		handledBossDeath:       make(map[string]struct{}),
		portalOverlapsByPlayer: make(map[string]map[string]struct{}),
		waveFrozenEnemies:      make(map[string]time.Duration),
		waveFrozenDragons:      make(map[string]time.Duration),
		waveFrozenGelehks:      make(map[string]time.Duration),
		waveFrozenVanessas:     make(map[string]time.Duration),
		pullOverlapBodies:      make(map[string]time.Duration),
		venomDebuffs:           make(map[string]venomDebuff),
		molotovBurns:           make(map[string]molotovBurn),
	}
	if cfg.Definition != nil {
		w.def = cfg.Definition
		if cfg.IDs != nil {
			w.spawnSystem = spawn.New(cfg.Definition.SpawnSystem, cfg.IDs)
			w.bossRegionSystem = bossregion.New(cfg.Definition.BossRegion)
		}
		w.seedInitialPortals()
	}
	return w
}

func (w *World) seedInitialPortals() {
	if w.def == nil || w.cfg.IDs == nil {
		return
	}
	for i, ip := range w.def.InitialPortals {
		id := w.cfg.IDs.NewID("portal")
		w.portals[id] = &portal.Portal{
			ID: id, X: ip.X, Y: ip.Y, Kind: ip.Kind,
			ToInstance: ip.ToInstance, TargetX: ip.TargetX, TargetY: ip.TargetY,
			ActiveAt: time.Time{}, // immediately active
		}
		w.portalIndex.Upsert(id, ip.X, ip.Y)
		_ = i
	}
}

// SeedStarterEnemies seeds the configured starter population around the spawn
// point. Called by the instance manager once after construction so each phase
// has visible monsters before chunk spawning kicks in.
func (w *World) SeedStarterEnemies() {
	w.mu.Lock()
	defer w.mu.Unlock()
	if w.def == nil || w.spawnSystem == nil || w.def.StarterEnemies <= 0 {
		return
	}
	w.spawnSystem.SpawnStarterEnemies(
		w.def.SpawnX, w.def.SpawnY, w.def.StarterEnemies, w.def.StarterEnemyRadius,
		w.enemies, func(e *enemy.Enemy) { w.enemyIndex.Upsert(e.ID, e.X, e.Y) },
	)
	w.resolveBodyCollisionsLocked()
}

// SeedPhase3Bosses spawns the Phase 3 entry bosses defined in the registry.
// Idempotent: re-invocations skip bosses that already exist (by id), so the
// instance manager can safely call it after construction without duplicating
// state.
func (w *World) SeedPhase3Bosses() {
	if w.def == nil {
		return
	}
	w.EnsurePhase3BossesNear(w.def.SpawnX, w.def.SpawnY)
}

// SeedPhase4Boss spawns the fixed Vanessa boss for phase 4.
func (w *World) SeedPhase4Boss() {
	w.mu.Lock()
	defer w.mu.Unlock()
	if w.def == nil || w.def.Phase4Boss == nil {
		return
	}
	b := w.def.Phase4Boss
	if _, ok := w.vanessas[b.ID]; ok {
		return
	}
	x := w.def.SpawnX + b.OffsetX
	y := w.def.SpawnY + b.OffsetY
	v := boss.NewVanessaTheRuthless(b.ID, x, y)
	w.vanessas[v.ID] = v
	w.bossIndex.Upsert(v.ID, v.X, v.Y)
	w.resolveBodyCollisionsLocked()
}

// EnsurePhase3BossesNear (re)seeds the Phase 3 entry boss trio relative to a
// player's entry coordinates: removes any unexpected dragon ids, refreshes
// SpawnX/SpawnY for surviving entries that match the expected kind, and
// recreates anything that drifted (kind change, missing entry, etc.).
// Called both at construction (via SeedPhase3Bosses) and on every portal
// transfer into Phase 3 so the trio remains anchored to the actual entry
// point even after deaths and respawns.
func (w *World) EnsurePhase3BossesNear(entryX, entryY float64) {
	w.mu.Lock()
	defer w.mu.Unlock()
	if w.def == nil || len(w.def.Phase3EntryBosses) == 0 {
		return
	}

	expected := make(map[string]struct{}, len(w.def.Phase3EntryBosses))
	for _, b := range w.def.Phase3EntryBosses {
		expected[b.ID] = struct{}{}
	}

	// Remove any dragon that isn't part of the expected trio. The Phase 3
	// world only ever hosts the trio (BossRegion is disabled), so anything
	// else is stale state from a previous seed/replace cycle.
	for id := range w.dragons {
		if _, ok := expected[id]; ok {
			continue
		}
		delete(w.dragons, id)
		w.bossIndex.Remove(id)
	}

	for _, b := range w.def.Phase3EntryBosses {
		x := entryX + b.OffsetX
		y := entryY + b.OffsetY
		if existing, ok := w.dragons[b.ID]; ok && existing.Kind() == b.Kind {
			// Same kind already alive: just refresh the spawn anchor so
			// future TryRespawn lands at the new entry. Do not teleport the
			// boss mid-fight.
			existing.SpawnX = x
			existing.SpawnY = y
			continue
		}
		if _, ok := w.dragons[b.ID]; ok {
			delete(w.dragons, b.ID)
			w.bossIndex.Remove(b.ID)
		}
		d := boss.NewPhase3Boss(b.ID, x, y, b.Kind)
		w.dragons[d.ID] = d
		w.bossIndex.Upsert(d.ID, d.X, d.Y)
	}
	w.resolveBodyCollisionsLocked()
}

// EnsurePhase2PopulationNear tops up the Phase 2 starter slime ring around
// the given entry point if too few are alive nearby, and seeds a Dragon Lord
// when none is in range. No-op for instances that aren't Phase 2 (i.e.
// the SpawnSystem is not configured for slimes), keeping the call site safe
// to dispatch by InstanceID.
func (w *World) EnsurePhase2PopulationNear(entryX, entryY float64) {
	w.mu.Lock()
	defer w.mu.Unlock()
	if w.def == nil || w.spawnSystem == nil || w.cfg.IDs == nil {
		return
	}
	if w.def.SpawnSystem.EnemyKind != enemy.KindSlime {
		return
	}
	b := config.DefaultBalancing
	radiusSq := b.Phase2NearbyRadius * b.Phase2NearbyRadius
	nearby := 0
	for _, e := range w.enemies {
		if e.Kind != enemy.KindSlime || e.State == enemy.StateDead {
			continue
		}
		dx := e.X - entryX
		dy := e.Y - entryY
		if dx*dx+dy*dy <= radiusSq {
			nearby++
		}
	}
	if nearby < b.Phase2MinNearbySlimes {
		w.spawnSystem.SpawnStarterEnemies(
			entryX, entryY, b.Phase2StarterSlimes, b.Phase2StarterSlimeRadius,
			w.enemies, func(e *enemy.Enemy) { w.enemyIndex.Upsert(e.ID, e.X, e.Y) },
		)
	}

	dragonRadiusSq := b.Phase2DragonNearbyRadius * b.Phase2DragonNearbyRadius
	hasDragon := false
	for _, d := range w.dragons {
		if d.Kind() != boss.KindDragonLord || d.State == boss.StateDead {
			continue
		}
		dx := d.X - entryX
		dy := d.Y - entryY
		if dx*dx+dy*dy <= dragonRadiusSq {
			hasDragon = true
			break
		}
	}
	if !hasDragon {
		id := w.cfg.IDs.NewID("dragon_seed")
		d := boss.NewDragonLord(id, entryX+520, entryY+160)
		w.dragons[d.ID] = d
		w.bossIndex.Upsert(d.ID, d.X, d.Y)
	}
	w.resolveBodyCollisionsLocked()
}

// EnsurePhase4PopulationNear tops up the Phase 4 starter pacman ghost ring
// around the given entry point if too few are alive nearby.
// No-op for instances that aren't Phase 4 (i.e. the SpawnSystem is not
// configured for pacman ghosts), keeping the call site safe to dispatch by
// InstanceID.
func (w *World) EnsurePhase4PopulationNear(entryX, entryY float64) {
	w.mu.Lock()
	defer w.mu.Unlock()
	if w.def == nil || w.spawnSystem == nil {
		return
	}
	if w.def.SpawnSystem.EnemyKind != enemy.KindPacmanGhost {
		return
	}
	b := config.DefaultBalancing
	radiusSq := b.Phase4NearbyRadius * b.Phase4NearbyRadius
	nearby := 0
	for _, e := range w.enemies {
		if e.Kind != enemy.KindPacmanGhost || e.State == enemy.StateDead {
			continue
		}
		dx := e.X - entryX
		dy := e.Y - entryY
		if dx*dx+dy*dy <= radiusSq {
			nearby++
		}
	}
	if nearby >= b.Phase4MinNearbyPacmans {
		return
	}
	w.spawnSystem.SpawnStarterEnemies(
		entryX, entryY, b.Phase4StarterPacmans, b.Phase4StarterPacmanRadius,
		w.enemies, func(e *enemy.Enemy) { w.enemyIndex.Upsert(e.ID, e.X, e.Y) },
	)
	w.resolveBodyCollisionsLocked()
}

// InstanceID returns the instance this world represents.
func (w *World) InstanceID() domworld.InstanceID { return w.cfg.InstanceID }

// AddPlayer registers a new player, optionally at a custom position. Pass
// nil for x/y to use the spawn point.
func (w *World) AddPlayer(id, nickname string, x, y *float64) *player.Player {
	w.mu.Lock()
	defer w.mu.Unlock()

	px, py := w.cfg.SpawnX, w.cfg.SpawnY
	if x != nil {
		px = *x
	}
	if y != nil {
		py = *y
	}
	p := player.New(id, nickname, px, py)
	w.players[id] = p
	w.playerIndex.Upsert(id, p.X, p.Y)
	// Fresh joins inherit spawn protection immediately, so keep the safe zone
	// clear before the next simulation tick or snapshot.
	w.expelHostilesFromSafeZone()
	w.resolveBodyCollisionsLocked()
	return p
}

// RemovePlayer detaches a player from the world.
func (w *World) RemovePlayer(id string) *player.Player {
	w.mu.Lock()
	defer w.mu.Unlock()

	p, ok := w.players[id]
	if !ok {
		return nil
	}
	delete(w.players, id)
	w.playerIndex.Remove(id)
	delete(w.portalOverlapsByPlayer, id)
	return p
}

// AdoptPlayer moves an existing player from another world into this one.
func (w *World) AdoptPlayer(p *player.Player, x, y float64) {
	w.mu.Lock()
	defer w.mu.Unlock()
	p.X, p.Y = x, y
	p.SuspendForDisconnect()
	p.SafeZoneTimer = player.SafeZoneDuration
	w.players[p.ID] = p
	w.playerIndex.Upsert(p.ID, x, y)
	// Portal transfers should reactivate spawn protection immediately in the
	// destination world.
	w.expelHostilesFromSafeZone()
	w.resolveBodyCollisionsLocked()
}

// SuspendPlayer clears transient input/combat state for a disconnected player
// while keeping them resumable in the world.
func (w *World) SuspendPlayer(id string) bool {
	w.mu.Lock()
	defer w.mu.Unlock()

	p, ok := w.players[id]
	if !ok {
		return false
	}
	p.SuspendForDisconnect()
	return true
}

// HandleInput stages a client input for a player.
func (w *World) HandleInput(playerID string, input player.Input) {
	w.mu.Lock()
	defer w.mu.Unlock()

	if p, ok := w.players[playerID]; ok {
		p.ApplyInput(input)
	}
}

// SpawnEnemy adds an enemy to the world.
func (w *World) SpawnEnemy(e *enemy.Enemy) {
	w.mu.Lock()
	defer w.mu.Unlock()
	w.enemies[e.ID] = e
	w.enemyIndex.Upsert(e.ID, e.X, e.Y)
}

// SpawnDragon adds a DragonLord boss.
func (w *World) SpawnDragon(b *boss.DragonLord) {
	w.mu.Lock()
	defer w.mu.Unlock()
	w.dragons[b.ID] = b
	w.bossIndex.Upsert(b.ID, b.X, b.Y)
}

// SpawnGelehk adds a Gelehk boss.
func (w *World) SpawnGelehk(b *boss.Gelehk) {
	w.mu.Lock()
	defer w.mu.Unlock()
	w.gelehks[b.ID] = b
	w.bossIndex.Upsert(b.ID, b.X, b.Y)
}

// SpawnVanessa adds a Vanessa the Ruthless boss.
func (w *World) SpawnVanessa(b *boss.VanessaTheRuthless) {
	w.mu.Lock()
	defer w.mu.Unlock()
	w.vanessas[b.ID] = b
	w.bossIndex.Upsert(b.ID, b.X, b.Y)
}

// SpawnPortal adds a portal.
func (w *World) SpawnPortal(p *portal.Portal) {
	w.mu.Lock()
	defer w.mu.Unlock()
	w.portals[p.ID] = p
	w.portalIndex.Upsert(p.ID, p.X, p.Y)
}

// handleBossDeathPortals creates a forward portal at the corpse of any
// allowed-kind dead boss (mirrors PortalSystem.handleBossDeathPortals).
func (w *World) handleBossDeathPortals() {
	if w.def == nil || w.def.BossDeathPortal == nil {
		return
	}
	cfg := w.def.BossDeathPortal
	allowed := map[boss.Kind]struct{}{}
	for _, k := range cfg.SourceBossKinds {
		allowed[k] = struct{}{}
	}

	// Forget handled bosses that no longer exist or are alive again.
	for id := range w.handledBossDeath {
		dState := boss.StateDead
		exists := false
		if d, ok := w.dragons[id]; ok {
			dState, exists = d.State, true
		} else if g, ok := w.gelehks[id]; ok {
			dState, exists = g.State, true
		} else if v, ok := w.vanessas[id]; ok {
			dState, exists = v.State, true
		}
		if !exists || dState != boss.StateDead {
			delete(w.handledBossDeath, id)
		}
	}

	// Drop stale boss-death portals whose source is no longer dead.
	for pid, pt := range w.portals {
		if pt.Kind != cfg.Kind || pt.SourceBossID == "" {
			continue
		}
		alive := false
		kind := boss.Kind("")
		if d, ok := w.dragons[pt.SourceBossID]; ok {
			alive = d.State != boss.StateDead
			kind = d.Kind()
		} else if g, ok := w.gelehks[pt.SourceBossID]; ok {
			alive = g.State != boss.StateDead
			kind = boss.KindGelehk
		} else if v, ok := w.vanessas[pt.SourceBossID]; ok {
			alive = v.State != boss.StateDead
			kind = v.Kind()
		} else {
			delete(w.portals, pid)
			w.portalIndex.Remove(pid)
			continue
		}
		if alive {
			delete(w.portals, pid)
			w.portalIndex.Remove(pid)
			continue
		}
		if len(allowed) > 0 {
			if _, ok := allowed[kind]; !ok {
				delete(w.portals, pid)
				w.portalIndex.Remove(pid)
			}
		}
	}

	spawnFor := func(id string, x, y float64, kind boss.Kind) {
		if _, handled := w.handledBossDeath[id]; handled {
			return
		}
		if len(allowed) > 0 {
			if _, ok := allowed[kind]; !ok {
				return
			}
		}
		w.handledBossDeath[id] = struct{}{}
		pid := w.cfg.IDs.NewID("portal")
		activeAt := w.now.Add(time.Duration(cfg.ActivationDelayMS) * time.Millisecond)
		exp := w.now.Add(time.Duration(cfg.DurationMS) * time.Millisecond)
		pt := &portal.Portal{
			ID: pid, X: x, Y: y, Kind: cfg.Kind,
			SourceBossID: id,
			ToInstance:   cfg.ToInstance,
			TargetX:      cfg.TargetX, TargetY: cfg.TargetY,
			ActiveAt: activeAt, ExpiresAt: &exp,
		}
		w.portals[pid] = pt
		w.portalIndex.Upsert(pid, x, y)
	}
	for id, d := range w.dragons {
		if d.State != boss.StateDead {
			continue
		}
		spawnFor(id, d.X, d.Y, d.Kind())
	}
	for id, g := range w.gelehks {
		if g.State != boss.StateDead {
			continue
		}
		spawnFor(id, g.X, g.Y, boss.KindGelehk)
	}
	for id, v := range w.vanessas {
		if v.State != boss.StateDead {
			continue
		}
		spawnFor(id, v.X, v.Y, v.Kind())
	}
}

// ConsumeTransferRequests drains and returns any queued portal transfers.
func (w *World) ConsumeTransferRequests() []portal.TransferRequest {
	w.mu.Lock()
	defer w.mu.Unlock()
	out := w.transferRequests
	w.transferRequests = nil
	return out
}

// Tick advances the simulation by dt. Order mirrors the main runtime: players,
// respawns, AI, body resolution, dash/combat, then static systems like drops,
// portals, and hazards.
func (w *World) Tick(dt time.Duration) {
	w.mu.Lock()
	defer w.mu.Unlock()
	w.tick++
	w.now = w.cfg.NowFunc()

	safeZoneActive := w.tickPlayers(dt)
	safeZoneJustCreated := w.respawnPlayers(dt)
	w.preparePlayerWaves()
	if safeZoneJustCreated {
		safeZoneActive = true
	}
	if w.spawnSystem != nil {
		w.spawnSystem.Update(
			w.now.UnixMilli(), w.players, w.enemies,
			func(e *enemy.Enemy) { w.enemyIndex.Upsert(e.ID, e.X, e.Y) },
			func(id string) { w.enemyIndex.Remove(id) },
		)
	}
	w.advanceMolotovBurns(dt)
	w.tickEnemies(dt, safeZoneActive)
	w.tickBosses(dt)
	if safeZoneActive && (!w.wasSafeZoneActive || safeZoneJustCreated) {
		w.expelHostilesFromSafeZone()
	}
	w.advanceVenomDebuffs(dt)
	w.advancePullOverlapBodies(dt)
	w.resolveBodyCollisionsLocked()
	w.wasSafeZoneActive = safeZoneActive
	w.resolveCombat()
	w.tickDrops()
	w.tickPortals()
	w.tickHazards(dt)
}

func (w *World) respawnPlayers(dt time.Duration) bool {
	created := false
	for id, p := range w.players {
		if p.State != player.StateDead {
			continue
		}
		p.RespawnTimer += dt
		if p.RespawnTimer < PlayerRespawnTime {
			continue
		}
		p.Respawn(w.cfg.SpawnX, w.cfg.SpawnY)
		w.playerIndex.Upsert(id, p.X, p.Y)
		created = true
	}
	return created
}

func (w *World) expelHostilesFromSafeZone() {
	cx, cy, radius := w.cfg.SpawnX, w.cfg.SpawnY, domworld.SpawnSafeZoneRadius
	pushDist := radius + 12
	push := func(x, y *float64) bool {
		dx := *x - cx
		dy := *y - cy
		dsq := dx*dx + dy*dy
		if dsq > radius*radius {
			return false
		}
		if dsq == 0 {
			*x = cx + pushDist
			*y = cy
			return true
		}
		dist := math.Sqrt(dsq)
		*x = cx + (dx/dist)*pushDist
		*y = cy + (dy/dist)*pushDist
		return true
	}
	for id, e := range w.enemies {
		if e.State == enemy.StateDead {
			continue
		}
		if !push(&e.X, &e.Y) {
			continue
		}
		e.TargetID = ""
		e.State = enemy.StateIdle
		w.enemyIndex.Upsert(id, e.X, e.Y)
	}
	for id, d := range w.dragons {
		if d.State == boss.StateDead {
			continue
		}
		if !push(&d.X, &d.Y) {
			continue
		}
		d.TargetID = ""
		d.State = boss.StateIdle
		w.bossIndex.Upsert(id, d.X, d.Y)
	}
	for id, g := range w.gelehks {
		if g.State == boss.StateDead {
			continue
		}
		if !push(&g.X, &g.Y) {
			continue
		}
		g.Reset()
		w.bossIndex.Upsert(id, g.X, g.Y)
	}
	for id, v := range w.vanessas {
		if v.State == boss.StateDead {
			continue
		}
		if !push(&v.X, &v.Y) {
			continue
		}
		v.TargetID = ""
		v.State = boss.StateIdle
		w.bossIndex.Upsert(id, v.X, v.Y)
	}
}

func (w *World) tickPlayers(dt time.Duration) bool {
	safeZoneActive := false
	for id, p := range w.players {
		mult := 1.0
		for _, g := range w.gelehks {
			if g.PlayerSpeedMultiplier(p.X, p.Y) < 1 {
				mult = g.PlayerSpeedMultiplier(p.X, p.Y)
			}
		}
		p.Update(dt, mult)
		w.playerIndex.Upsert(id, p.X, p.Y)
		if w.isProtected(p) {
			safeZoneActive = true
		}
	}
	return safeZoneActive
}

func (w *World) preparePlayerWaves() {
	for _, p := range w.players {
		cx, cy, ok := p.ConsumeWaveStart()
		if ok {
			p.SetWaveTargets(w.capturePlayerWaveTargets(cx, cy, p.WaveRemainingDuration()))
		}

		cx, cy, ok = p.ConsumeNumbStart()
		if !ok {
			cx, cy, ok = p.ConsumePullStart()
			if !ok {
				cx, cy, ok = p.ConsumeVenomStart()
				if !ok {
					continue
				}
				p.SetVenomTargets(w.capturePlayerWaveTargets(cx, cy, p.VenomRemainingDuration()))
				continue
			}
			p.SetPullTargets(w.capturePlayerWaveTargets(cx, cy, p.PullRemainingDuration()+player.PullClusterHoldDuration))
			continue
		}
		p.SetNumbTargets(w.capturePlayerWaveTargets(cx, cy, p.NumbRemainingDuration()+player.NumbFreezeDuration))
	}
}

func (w *World) capturePlayerWaveTargets(cx, cy float64, freezeFor time.Duration) player.WaveTargets {
	targets := player.WaveTargets{}

	w.enemyIndex.ForEachInRadius(cx, cy, player.WaveMaxRadius+64, func(id spatial.EntityID) {
		e := w.enemies[id]
		if e == nil || e.State == enemy.StateDead || !withinPlayerWave(cx, cy, e.X, e.Y, e.CollisionRadius()) {
			return
		}
		targets.EnemyIDs = append(targets.EnemyIDs, e.ID)
		armFreeze(w.waveFrozenEnemies, e.ID, freezeFor)
		e.TargetID = ""
		e.State = enemy.StateIdle
	})

	w.bossIndex.ForEachInRadius(cx, cy, player.WaveMaxRadius+64, func(id spatial.EntityID) {
		if d := w.dragons[id]; d != nil {
			if d.State != boss.StateDead && withinPlayerWave(cx, cy, d.X, d.Y, d.ContactRadius()) {
				targets.DragonIDs = append(targets.DragonIDs, d.ID)
				armFreeze(w.waveFrozenDragons, d.ID, freezeFor)
				d.TargetID = ""
				d.State = boss.StateIdle
			}
			return
		}
		if g := w.gelehks[id]; g != nil {
			if g.State != boss.StateDead && withinPlayerWave(cx, cy, g.X, g.Y, g.ContactRadius()) {
				targets.GelehkIDs = append(targets.GelehkIDs, g.ID)
				armFreeze(w.waveFrozenGelehks, g.ID, freezeFor)
				g.StopChargeOnCollision()
				g.State = boss.StateIdle
				g.StateTimer = 0
			}
			return
		}
		if v := w.vanessas[id]; v != nil && v.State != boss.StateDead && withinPlayerWave(cx, cy, v.X, v.Y, v.ContactRadius()) {
			targets.VanessaIDs = append(targets.VanessaIDs, v.ID)
			armFreeze(w.waveFrozenVanessas, v.ID, freezeFor)
			v.TargetID = ""
			v.State = boss.StateIdle
		}
	})

	return targets
}

func (w *World) tickEnemies(dt time.Duration, safeZoneActive bool) {
	views := w.playerViews()
	find := w.findNearestPlayerFunc()
	for id, e := range w.enemies {
		if e.TryRespawn(dt) {
			delete(w.venomDebuffs, dynamicBodyKey("enemy", id))
			delete(w.molotovBurns, dynamicBodyKey("enemy", id))
			w.enemyIndex.Upsert(id, e.X, e.Y)
			continue
		}
		if advanceFreeze(w.waveFrozenEnemies, id, dt) {
			w.enemyIndex.Upsert(id, e.X, e.Y)
			continue
		}
		e.Update(dt, views, safeZoneActive, w.cfg.SpawnX, w.cfg.SpawnY, domworld.SpawnSafeZoneRadius, find)
		w.enemyIndex.Upsert(id, e.X, e.Y)
	}
}

func (w *World) tickBosses(dt time.Duration) {
	// Player-relative region spawning (Phase 1 Gelehk, Phase 2 DragonLord).
	if w.bossRegionSystem != nil && w.bossRegionSystem.Enabled() {
		w.bossRegionSystem.Update(
			w.now.UnixMilli(), w.players,
			func(id string, x, y float64) {
				switch w.bossRegionSystem.SpawnKind() {
				case boss.KindGelehk:
					g := boss.NewGelehk(id, x, y)
					w.gelehks[id] = g
					w.bossIndex.Upsert(id, x, y)
				case boss.KindDragonLord:
					d := boss.NewDragonLord(id, x, y)
					w.dragons[id] = d
					w.bossIndex.Upsert(id, x, y)
				case boss.KindVanessaTheRuthless:
					v := boss.NewVanessaTheRuthless(id, x, y)
					w.vanessas[id] = v
					w.bossIndex.Upsert(id, x, y)
				}
			},
			func(id string) {
				delete(w.dragons, id)
				delete(w.gelehks, id)
				delete(w.vanessas, id)
				w.bossIndex.Remove(id)
			},
			func(id string) (boss.State, boss.Kind, bool) {
				if d, ok := w.dragons[id]; ok {
					return d.State, boss.KindDragonLord, true
				}
				if g, ok := w.gelehks[id]; ok {
					return g.State, boss.KindGelehk, true
				}
				if v, ok := w.vanessas[id]; ok {
					return v.State, v.Kind(), true
				}
				return boss.StateDead, "", false
			},
		)
	}

	views := w.playerViews()
	bossViews := make([]boss.PlayerView, 0, len(views))
	for _, v := range views {
		bossViews = append(bossViews, boss.PlayerView{ID: v.ID, X: v.X, Y: v.Y, Alive: v.Alive, Protected: v.Protected})
	}
	findBoss := func(x, y, radius float64, predicate func(boss.PlayerView) bool) *boss.PlayerView {
		var best *boss.PlayerView
		bestSq := radius * radius
		w.playerIndex.ForEachInRadius(x, y, radius, func(id spatial.EntityID) {
			p := w.players[id]
			if p == nil {
				return
			}
			view := boss.PlayerView{
				ID: p.ID, X: p.X, Y: p.Y,
				Alive:     p.State != player.StateDead,
				Protected: w.isProtected(p),
			}
			if predicate != nil && !predicate(view) {
				return
			}
			dsq := physics.DistanceSquared(x, y, p.X, p.Y)
			if dsq <= bestSq {
				bestSq = dsq
				cp := view
				best = &cp
			}
		})
		return best
	}
	for id, d := range w.dragons {
		if d.TryRespawn(dt) {
			delete(w.venomDebuffs, dynamicBodyKey("boss", id))
			delete(w.molotovBurns, dynamicBodyKey("boss", id))
			w.bossIndex.Upsert(id, d.X, d.Y)
			continue
		}
		if advanceFreeze(w.waveFrozenDragons, id, dt) {
			w.bossIndex.Upsert(id, d.X, d.Y)
			continue
		}
		fire := func(x, y, dx, dy float64, kind hazard.Kind, tint uint32) {
			w.queueFireLine(x, y, dx, dy, kind, tint)
		}
		d.Update(dt, bossViews, fire, findBoss)
		w.bossIndex.Upsert(id, d.X, d.Y)
	}
	for id, g := range w.gelehks {
		if g.TryRespawn(dt) {
			delete(w.venomDebuffs, dynamicBodyKey("boss", id))
			delete(w.molotovBurns, dynamicBodyKey("boss", id))
			w.bossIndex.Upsert(id, g.X, g.Y)
			continue
		}
		if advanceFreeze(w.waveFrozenGelehks, id, dt) {
			w.bossIndex.Upsert(id, g.X, g.Y)
			continue
		}
		spawnPurple := func(x, y float64) { w.spawnPurpleField(x, y) }
		spawnMinions := func(x, y float64, count int) {
			if w.spawnSystem == nil {
				return
			}
			w.spawnSystem.SpawnMinions(x, y, w.enemies, func(e *enemy.Enemy) {
				w.enemyIndex.Upsert(e.ID, e.X, e.Y)
			})
		}
		dmg := func(pid string, amount int) {
			if p, ok := w.players[pid]; ok {
				p.TakeDamage(amount)
			}
		}
		g.Update(dt, bossViews, spawnMinions, spawnPurple, dmg, findBoss)
		w.bossIndex.Upsert(id, g.X, g.Y)
	}
	for id, v := range w.vanessas {
		if v.TryRespawn(dt) {
			delete(w.venomDebuffs, dynamicBodyKey("boss", id))
			delete(w.molotovBurns, dynamicBodyKey("boss", id))
			w.bossIndex.Upsert(id, v.X, v.Y)
			continue
		}
		if advanceFreeze(w.waveFrozenVanessas, id, dt) {
			w.bossIndex.Upsert(id, v.X, v.Y)
			continue
		}
		fire := func(x, y, dx, dy float64, kind hazard.Kind, tint uint32) {
			w.queueFireLine(x, y, dx, dy, kind, tint)
		}
		burst := func(x, y float64, kind hazard.Kind, tints []uint32) {
			w.spawnFireBurst(x, y, kind, tints)
		}
		v.Update(dt, bossViews, fire, burst, findBoss)
		w.bossIndex.Upsert(id, v.X, v.Y)
	}
}

func withinPlayerWave(cx, cy, x, y, bodyRadius float64) bool {
	reach := player.WaveMaxRadius + bodyRadius
	return physics.DistanceSquared(cx, cy, x, y) <= reach*reach
}

func armFreeze(locks map[string]time.Duration, id string, duration time.Duration) {
	if duration <= 0 {
		return
	}
	if duration > locks[id] {
		locks[id] = duration
	}
}

func advanceFreeze(locks map[string]time.Duration, id string, dt time.Duration) bool {
	remaining, ok := locks[id]
	if !ok {
		return false
	}
	remaining -= dt
	if remaining <= 0 {
		delete(locks, id)
	} else {
		locks[id] = remaining
	}
	return true
}

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
		if d := w.dragons[burn.ID]; d != nil {
			return w.applyMolotovBurnDamageToDragon(d)
		}
		if g := w.gelehks[burn.ID]; g != nil {
			return w.applyMolotovBurnDamageToGelehk(g)
		}
		if v := w.vanessas[burn.ID]; v != nil {
			return w.applyMolotovBurnDamageToVanessa(v)
		}
	}
	return 0, true
}

func (w *World) applyMolotovBurnDamageToDragon(d *boss.DragonLord) (int, bool) {
	if d.State == boss.StateDead {
		return 0, true
	}
	beforeHP := d.HP
	d.TakeDamage(player.MolotovBurnTickDamage)
	dealt := beforeHP - d.HP
	if d.State == boss.StateDead {
		delete(w.venomDebuffs, dynamicBodyKey("boss", d.ID))
		return dealt, true
	}
	return dealt, false
}

func (w *World) applyMolotovBurnDamageToGelehk(g *boss.Gelehk) (int, bool) {
	if g.State == boss.StateDead {
		return 0, true
	}
	beforeHP := g.HP
	g.TakeDamage(player.MolotovBurnTickDamage)
	dealt := beforeHP - g.HP
	if g.State == boss.StateDead {
		delete(w.venomDebuffs, dynamicBodyKey("boss", g.ID))
		return dealt, true
	}
	return dealt, false
}

func (w *World) applyMolotovBurnDamageToVanessa(v *boss.VanessaTheRuthless) (int, bool) {
	if v.State == boss.StateDead {
		return 0, true
	}
	beforeHP := v.HP
	v.TakeDamage(player.MolotovBurnTickDamage)
	dealt := beforeHP - v.HP
	if v.State == boss.StateDead {
		delete(w.venomDebuffs, dynamicBodyKey("boss", v.ID))
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

func (w *World) applyPlayerDamageToDragon(sourcePlayerID string, d *boss.DragonLord, baseDamage int) int {
	damage, venomSource := w.venomDamage(sourcePlayerID, "boss", d.ID, baseDamage)
	beforeHP := d.HP
	d.TakeDamage(damage)
	dealt := beforeHP - d.HP
	if d.State == boss.StateDead {
		delete(w.venomDebuffs, dynamicBodyKey("boss", d.ID))
		delete(w.molotovBurns, dynamicBodyKey("boss", d.ID))
	}
	healVenomSource(venomSource, dealt)
	return dealt
}

func (w *World) applyPlayerDamageToGelehk(sourcePlayerID string, g *boss.Gelehk, baseDamage int) int {
	damage, venomSource := w.venomDamage(sourcePlayerID, "boss", g.ID, baseDamage)
	beforeHP := g.HP
	g.TakeDamage(damage)
	dealt := beforeHP - g.HP
	if g.State == boss.StateDead {
		delete(w.venomDebuffs, dynamicBodyKey("boss", g.ID))
		delete(w.molotovBurns, dynamicBodyKey("boss", g.ID))
	}
	healVenomSource(venomSource, dealt)
	return dealt
}

func (w *World) applyPlayerDamageToVanessa(sourcePlayerID string, v *boss.VanessaTheRuthless, baseDamage int) int {
	damage, venomSource := w.venomDamage(sourcePlayerID, "boss", v.ID, baseDamage)
	beforeHP := v.HP
	v.TakeDamage(damage)
	dealt := beforeHP - v.HP
	if v.State == boss.StateDead {
		delete(w.venomDebuffs, dynamicBodyKey("boss", v.ID))
		delete(w.molotovBurns, dynamicBodyKey("boss", v.ID))
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
	for _, d := range w.dragons {
		if d.State == boss.StateDead || !withinShurikenRadius(caster.X, caster.Y, d.X, d.Y, d.ContactRadius()) {
			continue
		}
		beforeHP := d.HP
		d.TakeDamage(player.ShurikenDamage)
		dealt := beforeHP - d.HP
		totalDamage += dealt
		if d.State == boss.StateDead {
			delete(w.venomDebuffs, dynamicBodyKey("boss", d.ID))
			delete(w.molotovBurns, dynamicBodyKey("boss", d.ID))
			caster.MonsterKills++
			caster.RecordMonsterKillInCast(castID)
		}
	}
	for _, g := range w.gelehks {
		if g.State == boss.StateDead || !withinShurikenRadius(caster.X, caster.Y, g.X, g.Y, g.ContactRadius()) {
			continue
		}
		beforeHP := g.HP
		g.TakeDamage(player.ShurikenDamage)
		dealt := beforeHP - g.HP
		totalDamage += dealt
		if g.State == boss.StateDead {
			delete(w.venomDebuffs, dynamicBodyKey("boss", g.ID))
			delete(w.molotovBurns, dynamicBodyKey("boss", g.ID))
			caster.MonsterKills++
			caster.RecordMonsterKillInCast(castID)
		}
	}
	for _, v := range w.vanessas {
		if v.State == boss.StateDead || !withinShurikenRadius(caster.X, caster.Y, v.X, v.Y, v.ContactRadius()) {
			continue
		}
		beforeHP := v.HP
		v.TakeDamage(player.ShurikenDamage)
		dealt := beforeHP - v.HP
		totalDamage += dealt
		if v.State == boss.StateDead {
			delete(w.venomDebuffs, dynamicBodyKey("boss", v.ID))
			delete(w.molotovBurns, dynamicBodyKey("boss", v.ID))
			caster.MonsterKills++
			caster.RecordMonsterKillInCast(castID)
		}
	}

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

func (w *World) tickHazards(dt time.Duration) {
	// playerHalfDiag pads the hazard hit radius so players whose body overlaps
	// a hazard tile still take damage.
	const playerHalfDiag = 34.0
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
		effect := hazard.EffectFor(h.Kind)

		for _, p := range w.players {
			if p.State == player.StateDead {
				continue
			}
			if w.isProtected(p) {
				continue
			}
			actorKey := playerActorKey(p.ID)
			if !h.MarkHit(actorKey) {
				continue
			}
			hitR := h.HitRadius + playerHalfDiag
			hitR2 := hitR * hitR
			if physics.DistanceSquared(p.X, p.Y, h.X, h.Y) > hitR2 {
				delete(h.HitActorKeys, actorKey)
				continue
			}
			if effect == hazard.EffectPurpleBurning {
				if _, dup := purpleHitThisTick[actorKey]; dup {
					continue
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
		}

		if !h.HitsAllActors {
			continue
		}

		for _, e := range w.enemies {
			if e.State == enemy.StateDead {
				continue
			}
			actorKey := enemyActorKey(e.ID)
			if !h.MarkHit(actorKey) {
				continue
			}
			hitR := h.HitRadius + e.CollisionRadius()
			hitR2 := hitR * hitR
			if physics.DistanceSquared(e.X, e.Y, h.X, h.Y) > hitR2 {
				delete(h.HitActorKeys, actorKey)
				continue
			}
			wasAlive := e.State != enemy.StateDead
			w.applyPlayerDamageToEnemy(h.SourcePlayerID, e, h.Damage)
			if wasAlive && e.State == enemy.StateDead {
				w.awardHazardMonsterKill(h.SourcePlayerID, h.SourceCastID)
			}
		}

		for _, d := range w.dragons {
			if d.State == boss.StateDead {
				continue
			}
			actorKey := bossActorKey(d.ID)
			if !h.MarkHit(actorKey) {
				continue
			}
			hitR := h.HitRadius + d.ContactRadius()
			hitR2 := hitR * hitR
			if physics.DistanceSquared(d.X, d.Y, h.X, h.Y) > hitR2 {
				delete(h.HitActorKeys, actorKey)
				continue
			}
			wasAlive := d.State != boss.StateDead
			w.applyPlayerDamageToDragon(h.SourcePlayerID, d, h.Damage)
			if wasAlive && d.State == boss.StateDead {
				w.awardHazardMonsterKill(h.SourcePlayerID, h.SourceCastID)
			}
		}

		for _, g := range w.gelehks {
			if g.State == boss.StateDead {
				continue
			}
			actorKey := bossActorKey(g.ID)
			if !h.MarkHit(actorKey) {
				continue
			}
			hitR := h.HitRadius + g.ContactRadius()
			hitR2 := hitR * hitR
			if physics.DistanceSquared(g.X, g.Y, h.X, h.Y) > hitR2 {
				delete(h.HitActorKeys, actorKey)
				continue
			}
			wasAlive := g.State != boss.StateDead
			w.applyPlayerDamageToGelehk(h.SourcePlayerID, g, h.Damage)
			if wasAlive && g.State == boss.StateDead {
				w.awardHazardMonsterKill(h.SourcePlayerID, h.SourceCastID)
			}
		}

		for _, v := range w.vanessas {
			if v.State == boss.StateDead {
				continue
			}
			actorKey := bossActorKey(v.ID)
			if !h.MarkHit(actorKey) {
				continue
			}
			hitR := h.HitRadius + v.ContactRadius()
			hitR2 := hitR * hitR
			if physics.DistanceSquared(v.X, v.Y, h.X, h.Y) > hitR2 {
				delete(h.HitActorKeys, actorKey)
				continue
			}
			wasAlive := v.State != boss.StateDead
			w.applyPlayerDamageToVanessa(h.SourcePlayerID, v, h.Damage)
			if wasAlive && v.State == boss.StateDead {
				w.awardHazardMonsterKill(h.SourcePlayerID, h.SourceCastID)
			}
		}
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

func (w *World) tickDrops() {
	for id, d := range w.drops {
		if d.SpawnedAt.IsZero() {
			d.SpawnedAt = w.now
		}
		if w.now.Sub(d.SpawnedAt) < config.DefaultBalancing.HeartDropLifetime {
			continue
		}
		delete(w.drops, id)
		w.dropIndex.Remove(id)
	}
	// Pickup
	for id, d := range w.drops {
		for _, p := range w.players {
			if p.State == player.StateDead {
				continue
			}
			if physics.DistanceSquared(p.X, p.Y, d.X, d.Y) > drop.PickupRadius*drop.PickupRadius {
				continue
			}
			p.Heal(d.Kind.HealAmount())
			delete(w.drops, id)
			w.dropIndex.Remove(id)
			break
		}
	}
	// Drop chance on enemy death
	for _, e := range w.enemies {
		if e.State != enemy.StateDead || e.HasDropped {
			continue
		}
		e.HasDropped = true
		if w.cfg.Rand.Float64() < drop.DropChance {
			id := w.cfg.IDs.NewID("drop")
			d := &drop.Drop{ID: id, X: e.X, Y: e.Y, Kind: e.DropKind, SpawnedAt: w.now}
			w.drops[id] = d
			w.dropIndex.Upsert(id, d.X, d.Y)
		}
	}
}

func (w *World) tickPortals() {
	// Boss-death portal spawning (mirrors PortalSystem.handleBossDeathPortals).
	w.handleBossDeathPortals()

	nextOverlaps := make(map[string]map[string]struct{}, len(w.portalOverlapsByPlayer))
	transferredPlayerIDs := make(map[string]struct{})

	for id, pt := range w.portals {
		if pt.ExpiresAt != nil && !w.now.Before(*pt.ExpiresAt) {
			delete(w.portals, id)
			w.portalIndex.Remove(id)
			continue
		}
		if !pt.Active(w.now) {
			continue
		}
		for _, p := range w.players {
			if p.State == player.StateDead {
				continue
			}
			if physics.DistanceSquared(p.X, p.Y, pt.X, pt.Y) > portal.PortalRadius*portal.PortalRadius {
				continue
			}
			overlaps := nextOverlaps[p.ID]
			if overlaps == nil {
				overlaps = make(map[string]struct{})
				nextOverlaps[p.ID] = overlaps
			}
			overlaps[id] = struct{}{}
			if prev := w.portalOverlapsByPlayer[p.ID]; prev != nil {
				if _, alreadyOverlapping := prev[id]; alreadyOverlapping {
					continue
				}
			}
			if p.PhaseTransferCooldown > 0 {
				continue
			}
			if _, alreadyTransferred := transferredPlayerIDs[p.ID]; alreadyTransferred {
				continue
			}
			p.MarkPhaseTransferCooldown(portal.TransferCooldown)
			w.transferRequests = append(w.transferRequests, portal.TransferRequest{
				PlayerID:   p.ID,
				ToInstance: pt.ToInstance,
				TargetX:    pt.TargetX,
				TargetY:    pt.TargetY,
			})
			transferredPlayerIDs[p.ID] = struct{}{}
		}
	}
	w.portalOverlapsByPlayer = nextOverlaps
}

func (w *World) resolveCombat() {
	// Run focused sub-systems in a fixed order:
	// PlayerWave → PlayerNumb → PlayerPull → PlayerLandmine → PlayerGrenade →
	// PlayerMolotov → PlayerDash → PlayerShuriken → ContactDamage. Each system is
	// stateless and reads/mutates only the slices it needs.
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
		w.syncDynamicIndexesLocked()
	}
	w.resolvePlayerShurikens()
	appcombat.ContactDamageSystem{}.Resolve(
		w.players,
		filterFrozenMap(w.enemies, w.waveFrozenEnemies),
		filterFrozenMap(w.dragons, w.waveFrozenDragons),
		filterFrozenMap(w.gelehks, w.waveFrozenGelehks),
		filterFrozenMap(w.vanessas, w.waveFrozenVanessas),
		w.safeZone(),
	)
}

// playerViews builds a snapshot slice of players for AI consumption.
func (w *World) playerViews() []enemyView {
	views := make([]enemyView, 0, len(w.players))
	for _, p := range w.players {
		views = append(views, enemyView{
			ID:        p.ID,
			X:         p.X,
			Y:         p.Y,
			Alive:     p.State != player.StateDead,
			Protected: w.isProtected(p),
		})
	}
	return views
}

type enemyView = enemy.PlayerView

// findNearestPlayerFunc returns a closure suitable for both enemy and boss AI.
func (w *World) findNearestPlayerFunc() enemy.FindNearestPlayer {
	return func(x, y, radius float64, predicate func(enemy.PlayerView) bool) *enemy.PlayerView {
		var best *enemy.PlayerView
		bestSq := radius * radius
		w.playerIndex.ForEachInRadius(x, y, radius, func(id spatial.EntityID) {
			p := w.players[id]
			if p == nil {
				return
			}
			view := enemy.PlayerView{
				ID: p.ID, X: p.X, Y: p.Y,
				Alive:     p.State != player.StateDead,
				Protected: w.isProtected(p),
			}
			if predicate != nil && !predicate(view) {
				return
			}
			dsq := physics.DistanceSquared(x, y, p.X, p.Y)
			if dsq <= bestSq {
				bestSq = dsq
				cp := view
				best = &cp
			}
		})
		return best
	}
}

// Snapshot returns a thread-safe copy of the world state for the snapshot
// builder. Callers must not mutate the returned slices.
type SnapshotView struct {
	Tick           uint64
	Instance       domworld.InstanceID
	Players        []player.Snapshot
	Enemies        []enemy.Snapshot
	Bosses         []BossSnapshot
	Drops          []drop.Snapshot
	Portals        []portal.Snapshot
	Hazards        []hazard.Snapshot
	IceZones       []boss.IceZone
	AOEIndicators  []boss.AOEIndicator
	WaveIndicators []boss.WaveIndicator
}

// BossSnapshot wraps the domain boss snapshot with optional target hints used
// by the wire layer for telegraph rendering.
type BossSnapshot struct {
	boss.Snapshot
	TargetX     float64
	TargetY     float64
	HasTarget   bool
	SpeechText  string
	SpeechColor string
	HasSpeech   bool
}

// Snapshot returns the world state as a flat projection.
func (w *World) Snapshot() SnapshotView {
	w.mu.Lock()
	defer w.mu.Unlock()

	view := SnapshotView{Tick: w.tick, Instance: w.cfg.InstanceID}
	for _, p := range w.players {
		view.Players = append(view.Players, p.Snapshot())
		if wave := p.WaveIndicator(); wave != nil {
			view.WaveIndicators = append(view.WaveIndicators, boss.WaveIndicator{OwnerID: p.ID, X: wave.X, Y: wave.Y, Radius: wave.Radius, State: boss.WaveState(wave.State), Kind: string(wave.Kind)})
		}
	}
	for _, e := range w.enemies {
		snapshot := e.Snapshot()
		snapshot.VenomMarked = w.venomDebuffs[dynamicBodyKey("enemy", e.ID)].Remaining > 0
		snapshot.BurningTicksRemaining = w.molotovBurns[dynamicBodyKey("enemy", e.ID)].TicksRemaining
		view.Enemies = append(view.Enemies, snapshot)
	}
	playerViews := w.playerViewsLocked()
	for _, d := range w.dragons {
		bs := BossSnapshot{Snapshot: d.Snapshot()}
		bs.VenomMarked = w.venomDebuffs[dynamicBodyKey("boss", d.ID)].Remaining > 0
		bs.BurningTicksRemaining = w.molotovBurns[dynamicBodyKey("boss", d.ID)].TicksRemaining
		if tx, ty, ok := d.TargetPosition(playerViews); ok {
			bs.TargetX, bs.TargetY, bs.HasTarget = physics.QuantizePosition(tx), physics.QuantizePosition(ty), true
		}
		view.Bosses = append(view.Bosses, bs)
	}
	for _, g := range w.gelehks {
		bs := BossSnapshot{Snapshot: g.Snapshot()}
		bs.VenomMarked = w.venomDebuffs[dynamicBodyKey("boss", g.ID)].Remaining > 0
		bs.BurningTicksRemaining = w.molotovBurns[dynamicBodyKey("boss", g.ID)].TicksRemaining
		view.Bosses = append(view.Bosses, bs)
		view.IceZones = append(view.IceZones, g.IceZones...)
		view.AOEIndicators = append(view.AOEIndicators, g.AOEIndicators...)
		if wave := g.WaveIndicator(); wave != nil {
			view.WaveIndicators = append(view.WaveIndicators, *wave)
		}
	}
	for _, v := range w.vanessas {
		bs := BossSnapshot{Snapshot: v.Snapshot()}
		bs.VenomMarked = w.venomDebuffs[dynamicBodyKey("boss", v.ID)].Remaining > 0
		bs.BurningTicksRemaining = w.molotovBurns[dynamicBodyKey("boss", v.ID)].TicksRemaining
		if text, color, ok := v.Speech(); ok {
			bs.SpeechText = text
			bs.SpeechColor = color
			bs.HasSpeech = true
		}
		view.Bosses = append(view.Bosses, bs)
	}
	for _, d := range w.drops {
		view.Drops = append(view.Drops, d.Snapshot())
	}
	for _, pt := range w.portals {
		view.Portals = append(view.Portals, portal.Snapshot{ID: pt.ID, X: physics.QuantizePosition(pt.X), Y: physics.QuantizePosition(pt.Y), Kind: pt.Kind})
	}
	for _, h := range w.hazards {
		ttl := int64(math.Max(0, math.Round(float64(h.TTL.Milliseconds()))))
		view.Hazards = append(view.Hazards, hazard.Snapshot{ID: h.ID, X: physics.QuantizePosition(h.X), Y: physics.QuantizePosition(h.Y), Kind: h.Kind, TTLMs: ttl, Tint: h.Tint, Direction: h.Direction})
	}
	return view
}

// playerViewsLocked is identical to playerViews but does not acquire the
// world mutex (already held by Snapshot()).
func (w *World) playerViewsLocked() []boss.PlayerView {
	views := make([]boss.PlayerView, 0, len(w.players))
	for _, p := range w.players {
		views = append(views, boss.PlayerView{
			ID: p.ID, X: p.X, Y: p.Y,
			Alive:     p.State != player.StateDead,
			Protected: w.isProtected(p),
		})
	}
	return views
}

// safeZone returns the spawn protection zone for this world.
func (w *World) safeZone() safezone.Zone {
	return safezone.Zone{X: w.cfg.SpawnX, Y: w.cfg.SpawnY, Radius: domworld.SpawnSafeZoneRadius}
}

// isProtected is the canonical "is this player invulnerable in the spawn
// zone?" check. Every system (hazard ticking, contact damage, PvP, AI
// targeting, snapshot projection) routes through this helper so safezone
// rules cannot drift between callsites.
func (w *World) isProtected(p *player.Player) bool {
	return w.safeZone().Protects(p)
}

// Players returns a defensive copy of the player map.
func (w *World) Players() map[string]*player.Player {
	w.mu.Lock()
	defer w.mu.Unlock()
	out := make(map[string]*player.Player, len(w.players))
	for k, v := range w.players {
		out[k] = v
	}
	return out
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

func (w *World) landmineTriggered(h *hazard.Hazard, playerHalfDiag float64) bool {
	for _, p := range w.players {
		if p.State == player.StateDead {
			continue
		}
		actorKey := playerActorKey(p.ID)
		if _, ignored := h.IgnoredActorKeys[actorKey]; ignored {
			continue
		}
		if hazardTouchesActor(h.X, h.Y, h.HitRadius, p.X, p.Y, playerHalfDiag) {
			return true
		}
	}
	for _, e := range w.enemies {
		if e.State == enemy.StateDead {
			continue
		}
		if hazardTouchesActor(h.X, h.Y, h.HitRadius, e.X, e.Y, e.CollisionRadius()) {
			return true
		}
	}
	for _, d := range w.dragons {
		if d.State == boss.StateDead {
			continue
		}
		if hazardTouchesActor(h.X, h.Y, h.HitRadius, d.X, d.Y, d.ContactRadius()) {
			return true
		}
	}
	for _, g := range w.gelehks {
		if g.State == boss.StateDead {
			continue
		}
		if hazardTouchesActor(h.X, h.Y, h.HitRadius, g.X, g.Y, g.ContactRadius()) {
			return true
		}
	}
	for _, v := range w.vanessas {
		if v.State == boss.StateDead {
			continue
		}
		if hazardTouchesActor(h.X, h.Y, h.HitRadius, v.X, v.Y, v.ContactRadius()) {
			return true
		}
	}
	return false
}

func (w *World) detonatePlayerExplosive(h *hazard.Hazard, playerHalfDiag float64) {
	explosionKind := hazard.KindLandmineExplosion
	if h.Kind == hazard.KindMolotov {
		explosionKind = hazard.KindMolotovExplosion
	}
	w.spawnPlayerExplosion(h.SourcePlayerID, h.X, h.Y, explosionKind)
	isMolotov := h.Kind == hazard.KindMolotov

	for _, p := range w.players {
		if p.State == player.StateDead || p.ID == h.SourcePlayerID {
			continue
		}
		if !h.HitsPlayers || w.isProtected(p) {
			continue
		}
		if !hazardTouchesActor(h.X, h.Y, hazard.LandmineExplosionRadius, p.X, p.Y, playerHalfDiag) {
			continue
		}
		wasAlive := p.State != player.StateDead
		p.TakeDamage(h.Damage)
		if wasAlive && p.State == player.StateDead {
			w.awardHazardPlayerKill(h.SourcePlayerID)
		}
	}
	for _, e := range w.enemies {
		if e.State == enemy.StateDead || !hazardTouchesActor(h.X, h.Y, hazard.LandmineExplosionRadius, e.X, e.Y, e.CollisionRadius()) {
			continue
		}
		wasAlive := e.State != enemy.StateDead
		w.applyPlayerDamageToEnemy(h.SourcePlayerID, e, h.Damage)
		if isMolotov && e.State != enemy.StateDead {
			w.armMolotovBurn("enemy", e.ID, h.SourcePlayerID)
		}
		if wasAlive && e.State == enemy.StateDead {
			w.awardHazardMonsterKill(h.SourcePlayerID, h.SourceCastID)
		}
	}
	for _, d := range w.dragons {
		if d.State == boss.StateDead || !hazardTouchesActor(h.X, h.Y, hazard.LandmineExplosionRadius, d.X, d.Y, d.ContactRadius()) {
			continue
		}
		wasAlive := d.State != boss.StateDead
		w.applyPlayerDamageToDragon(h.SourcePlayerID, d, h.Damage)
		if isMolotov && d.State != boss.StateDead {
			w.armMolotovBurn("boss", d.ID, h.SourcePlayerID)
		}
		if wasAlive && d.State == boss.StateDead {
			w.awardHazardMonsterKill(h.SourcePlayerID, h.SourceCastID)
		}
	}
	for _, g := range w.gelehks {
		if g.State == boss.StateDead || !hazardTouchesActor(h.X, h.Y, hazard.LandmineExplosionRadius, g.X, g.Y, g.ContactRadius()) {
			continue
		}
		wasAlive := g.State != boss.StateDead
		w.applyPlayerDamageToGelehk(h.SourcePlayerID, g, h.Damage)
		if isMolotov && g.State != boss.StateDead {
			w.armMolotovBurn("boss", g.ID, h.SourcePlayerID)
		}
		if wasAlive && g.State == boss.StateDead {
			w.awardHazardMonsterKill(h.SourcePlayerID, h.SourceCastID)
		}
	}
	for _, v := range w.vanessas {
		if v.State == boss.StateDead || !hazardTouchesActor(h.X, h.Y, hazard.LandmineExplosionRadius, v.X, v.Y, v.ContactRadius()) {
			continue
		}
		wasAlive := v.State != boss.StateDead
		w.applyPlayerDamageToVanessa(h.SourcePlayerID, v, h.Damage)
		if isMolotov && v.State != boss.StateDead {
			w.armMolotovBurn("boss", v.ID, h.SourcePlayerID)
		}
		if wasAlive && v.State == boss.StateDead {
			w.awardHazardMonsterKill(h.SourcePlayerID, h.SourceCastID)
		}
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

func sign(v float64) float64 {
	if v > 0 {
		return 1
	}
	if v < 0 {
		return -1
	}
	return 0
}
