// Package world is the application-layer runtime for a single instance:
// it owns the players, enemies, bosses, drops, portals and hazards, drives
// the simulation tick in the canonical order, and exposes spatial queries
// used by the snapshot builder and combat systems.
package world

import (
	"math"
	"math/rand"
	"sort"
	"sync"
	"time"

	"github.com/williamisnotdefined/zelda-proto/server/internal/application/bossregion"
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
	confusedEnemies        map[string]confusionStatus
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

type confusionStatus struct {
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
		confusedEnemies:        make(map[string]confusionStatus),
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

// EnsurePhase2PopulationNear tops up the Phase 2 starter skeleton ring around
// the given entry point if too few are alive nearby, and seeds a Dragon Lord
// when none is in range. No-op for instances that aren't Phase 2 (i.e.
// the SpawnSystem is not configured for skeletons), keeping the call site safe
// to dispatch by InstanceID.
func (w *World) EnsurePhase2PopulationNear(entryX, entryY float64) {
	w.mu.Lock()
	defer w.mu.Unlock()
	if w.def == nil || w.spawnSystem == nil || w.cfg.IDs == nil {
		return
	}
	if w.def.SpawnSystem.EnemyKind != enemy.KindSkeleton {
		return
	}
	b := config.DefaultBalancing
	radiusSq := b.Phase2NearbyRadius * b.Phase2NearbyRadius
	nearby := 0
	for _, e := range w.enemies {
		if e.Kind != enemy.KindSkeleton || e.State == enemy.StateDead {
			continue
		}
		dx := e.X - entryX
		dy := e.Y - entryY
		if dx*dx+dy*dy <= radiusSq {
			nearby++
		}
	}
	if nearby < b.Phase2MinNearbySkeletons {
		w.spawnSystem.SpawnStarterEnemies(
			entryX, entryY, b.Phase2StarterSkeletons, b.Phase2StarterSkeletonRadius,
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
	if w.safeZoneBlocksHostiles() {
		w.expelHostilesFromSafeZone()
	}
}

// SpawnDragon adds a DragonLord boss.
func (w *World) SpawnDragon(b *boss.DragonLord) {
	w.mu.Lock()
	defer w.mu.Unlock()
	w.dragons[b.ID] = b
	w.bossIndex.Upsert(b.ID, b.X, b.Y)
	if w.safeZoneBlocksHostiles() {
		w.expelHostilesFromSafeZone()
	}
}

// SpawnGelehk adds a Gelehk boss.
func (w *World) SpawnGelehk(b *boss.Gelehk) {
	w.mu.Lock()
	defer w.mu.Unlock()
	w.gelehks[b.ID] = b
	w.bossIndex.Upsert(b.ID, b.X, b.Y)
	if w.safeZoneBlocksHostiles() {
		w.expelHostilesFromSafeZone()
	}
}

// SpawnVanessa adds a Vanessa the Ruthless boss.
func (w *World) SpawnVanessa(b *boss.VanessaTheRuthless) {
	w.mu.Lock()
	defer w.mu.Unlock()
	w.vanessas[b.ID] = b
	w.bossIndex.Upsert(b.ID, b.X, b.Y)
	if w.safeZoneBlocksHostiles() {
		w.expelHostilesFromSafeZone()
	}
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
	safeZoneBlocksHostiles := safeZoneActive || w.safeZone().Permanent
	if w.spawnSystem != nil {
		w.spawnSystem.Update(
			w.now.UnixMilli(), w.players, w.enemies,
			func(e *enemy.Enemy) { w.enemyIndex.Upsert(e.ID, e.X, e.Y) },
			func(id string) { w.enemyIndex.Remove(id) },
		)
	}
	if safeZoneBlocksHostiles {
		w.expelHostilesFromSafeZone()
	}
	w.advanceMolotovBurns(dt)
	w.advanceConfusionStatuses(dt)
	playerViews := w.playerViews()
	w.tickEnemies(dt, safeZoneBlocksHostiles, playerViews)
	w.tickBosses(dt, playerViews)
	if safeZoneBlocksHostiles && (w.safeZone().Permanent || !w.wasSafeZoneActive || safeZoneJustCreated) {
		w.expelHostilesFromSafeZone()
	}
	w.advanceVenomDebuffs(dt)
	w.advancePullOverlapBodies(dt)
	w.resolveBodyCollisionsLocked()
	if w.resolvePlayersStaticCollisionsLocked() {
		w.syncDynamicIndexesLocked()
	}
	w.wasSafeZoneActive = safeZoneBlocksHostiles
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
	zone := w.safeZone()
	cx, cy, radius := zone.X, zone.Y, zone.Radius
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
		w.resolvePlayerStaticCollisionsLocked(p)
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
		if ok {
			p.SetNumbTargets(w.capturePlayerWaveTargets(cx, cy, p.NumbRemainingDuration()+player.NumbFreezeDuration))
		}

		cx, cy, ok = p.ConsumePullStart()
		if ok {
			p.SetPullTargets(w.capturePlayerWaveTargets(cx, cy, p.PullRemainingDuration()+player.PullClusterHoldDuration))
		}

		cx, cy, ok = p.ConsumeVenomStart()
		if ok {
			p.SetVenomTargets(w.capturePlayerWaveTargets(cx, cy, p.VenomRemainingDuration()))
		}

		cx, cy, ok = p.ConsumeConfusionStart()
		if ok {
			p.SetConfusionTargets(w.capturePlayerConfusionTargets(cx, cy, p.ConfusionRemainingDuration()))
		}
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

func (w *World) capturePlayerConfusionTargets(cx, cy float64, freezeFor time.Duration) player.WaveTargets {
	targets := player.WaveTargets{}

	w.enemyIndex.ForEachInRadius(cx, cy, player.WaveMaxRadius+64, func(id spatial.EntityID) {
		e := w.enemies[id]
		if e == nil || e.State == enemy.StateDead || !withinPlayerWave(cx, cy, e.X, e.Y, e.CollisionRadius()) {
			return
		}
		targets.EnemyIDs = append(targets.EnemyIDs, e.ID)
		// Only normal enemies are pre-locked for the incoming confusion status;
		// elites still take the wave's damage but never receive the control effect.
		if !e.Elite {
			armFreeze(w.waveFrozenEnemies, e.ID, freezeFor)
			e.TargetID = ""
			e.State = enemy.StateIdle
		}
	})

	w.bossIndex.ForEachInRadius(cx, cy, player.WaveMaxRadius+64, func(id spatial.EntityID) {
		if d := w.dragons[id]; d != nil {
			if d.State != boss.StateDead && withinPlayerWave(cx, cy, d.X, d.Y, d.ContactRadius()) {
				targets.DragonIDs = append(targets.DragonIDs, d.ID)
			}
			return
		}
		if g := w.gelehks[id]; g != nil {
			if g.State != boss.StateDead && withinPlayerWave(cx, cy, g.X, g.Y, g.ContactRadius()) {
				targets.GelehkIDs = append(targets.GelehkIDs, g.ID)
			}
			return
		}
		if v := w.vanessas[id]; v != nil && v.State != boss.StateDead && withinPlayerWave(cx, cy, v.X, v.Y, v.ContactRadius()) {
			targets.VanessaIDs = append(targets.VanessaIDs, v.ID)
		}
	})

	return targets
}

func (w *World) tickEnemies(dt time.Duration, safeZoneBlocksHostiles bool, views []enemyView) {
	zone := w.safeZone()
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
		if w.updateEnemyConfusionAI(e, dt, safeZoneBlocksHostiles, zone) {
			w.enemyIndex.Upsert(id, e.X, e.Y)
			continue
		}
		e.Update(dt, views, safeZoneBlocksHostiles, zone.X, zone.Y, zone.Radius, find)
		if direction, ok := e.ConsumeKnightBladeWave(); ok {
			w.spawnKnightBladeWave(e, direction)
		}
		w.enemyIndex.Upsert(id, e.X, e.Y)
	}
}

func (w *World) updateEnemyConfusionAI(e *enemy.Enemy, dt time.Duration, safeZoneBlocksHostiles bool, zone safezone.Zone) bool {
	if w.isEnemyConfused(e.ID) {
		target := w.nearestEnemyTarget(e, func(candidate *enemy.Enemy) bool {
			return !w.isEnemyConfused(candidate.ID)
		})
		e.UpdateAgainstMonster(dt, target, safeZoneBlocksHostiles, zone.X, zone.Y, zone.Radius)
		return true
	}

	target := w.nearestEnemyTarget(e, func(candidate *enemy.Enemy) bool {
		return w.isEnemyConfused(candidate.ID)
	})
	if target == nil {
		return false
	}
	e.UpdateAgainstMonster(dt, target, safeZoneBlocksHostiles, zone.X, zone.Y, zone.Radius)
	return true
}

func (w *World) nearestEnemyTarget(e *enemy.Enemy, predicate func(*enemy.Enemy) bool) *enemy.MonsterView {
	var best *enemy.MonsterView
	bestSq := e.Config.AggroRadius * e.Config.AggroRadius
	w.enemyIndex.ForEachInRadius(e.X, e.Y, e.Config.AggroRadius, func(id spatial.EntityID) {
		candidate := w.enemies[id]
		if candidate == nil || candidate.ID == e.ID || candidate.State == enemy.StateDead {
			return
		}
		if predicate != nil && !predicate(candidate) {
			return
		}
		dsq := physics.DistanceSquared(e.X, e.Y, candidate.X, candidate.Y)
		if dsq > bestSq {
			return
		}
		bestSq = dsq
		best = &enemy.MonsterView{
			ID:     candidate.ID,
			X:      candidate.X,
			Y:      candidate.Y,
			Alive:  true,
			Radius: candidate.CollisionRadius(),
		}
	})
	return best
}

func (w *World) isEnemyConfused(id string) bool {
	status, ok := w.confusedEnemies[id]
	return ok && status.Remaining > 0
}

func (w *World) tickBosses(dt time.Duration, views []enemyView) {
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

func (w *World) tickDrops() {
	for id, d := range w.drops {
		if d.SpawnedAt.IsZero() {
			d.SpawnedAt = w.now
		}
		if w.now.Sub(d.SpawnedAt) < config.DefaultBalancing.FoodDropLifetime {
			continue
		}
		delete(w.drops, id)
		w.dropIndex.Remove(id)
	}
	// Pickup
	for _, p := range w.players {
		if p.State == player.StateDead {
			continue
		}
		w.dropIndex.ForEachInRadius(p.X, p.Y, drop.PickupRadius, func(id spatial.EntityID) {
			d := w.drops[id]
			if d == nil {
				return
			}
			p.Heal(d.Kind.HealAmount())
			delete(w.drops, id)
			w.dropIndex.Remove(id)
		})
	}
	// Food drop chance on normal monster death.
	for _, e := range w.enemies {
		if e.State != enemy.StateDead || e.HasDropped {
			continue
		}
		e.HasDropped = true
		if e.Elite || e.ChunkKey == "minion" {
			continue
		}
		if w.cfg.Rand.Float64() < drop.FoodDropChance {
			id := w.cfg.IDs.NewID("drop")
			d := &drop.Drop{ID: id, X: e.X, Y: e.Y, Kind: e.DropKind, SpawnedAt: w.now}
			w.drops[id] = d
			w.dropIndex.Upsert(id, d.X, d.Y)
		}
	}
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

	view := SnapshotView{
		Tick:     w.tick,
		Instance: w.cfg.InstanceID,
		Players:  make([]player.Snapshot, 0, len(w.players)),
		Enemies:  make([]enemy.Snapshot, 0, len(w.enemies)),
		Bosses:   make([]BossSnapshot, 0, len(w.dragons)+len(w.gelehks)+len(w.vanessas)),
		Drops:    make([]drop.Snapshot, 0, len(w.drops)),
		Portals:  make([]portal.Snapshot, 0, len(w.portals)),
		Hazards:  make([]hazard.Snapshot, 0, len(w.hazards)),
	}
	for _, p := range w.players {
		view.Players = append(view.Players, p.Snapshot())
		if wave := p.WaveIndicator(); wave != nil {
			view.WaveIndicators = append(view.WaveIndicators, boss.WaveIndicator{OwnerID: p.ID, X: wave.X, Y: wave.Y, Radius: wave.Radius, State: boss.WaveState(wave.State), Kind: string(wave.Kind)})
		}
	}
	for _, e := range w.enemies {
		snapshot := e.Snapshot()
		snapshot.VenomMarked = w.venomDebuffs[dynamicBodyKey("enemy", e.ID)].Remaining > 0
		snapshot.Confused = e.State != enemy.StateDead && !e.Elite && w.isEnemyConfused(e.ID)
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
	sortSnapshotView(&view)
	return view
}

func sortSnapshotView(view *SnapshotView) {
	if len(view.Players) > 1 {
		sort.Slice(view.Players, func(i, j int) bool { return view.Players[i].ID < view.Players[j].ID })
	}
	if len(view.Enemies) > 1 {
		sort.Slice(view.Enemies, func(i, j int) bool { return view.Enemies[i].ID < view.Enemies[j].ID })
	}
	if len(view.Bosses) > 1 {
		sort.Slice(view.Bosses, func(i, j int) bool { return view.Bosses[i].ID < view.Bosses[j].ID })
	}
	if len(view.Drops) > 1 {
		sort.Slice(view.Drops, func(i, j int) bool { return view.Drops[i].ID < view.Drops[j].ID })
	}
	if len(view.Portals) > 1 {
		sort.Slice(view.Portals, func(i, j int) bool { return view.Portals[i].ID < view.Portals[j].ID })
	}
	if len(view.Hazards) > 1 {
		sort.Slice(view.Hazards, func(i, j int) bool { return view.Hazards[i].ID < view.Hazards[j].ID })
	}
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

// safeZone returns the protection zone for this world. Phase 1 hosts the
// permanent city safe zone; other phases keep the temporary spawn bubble.
func (w *World) safeZone() safezone.Zone {
	if w.cfg.InstanceID == domworld.InstancePhase1 {
		return safezone.Zone{X: w.cfg.SpawnX, Y: w.cfg.SpawnY, Radius: domworld.CityOneSafeZoneRadius, Permanent: true}
	}
	return safezone.Zone{X: w.cfg.SpawnX, Y: w.cfg.SpawnY, Radius: domworld.SpawnSafeZoneRadius}
}

func (w *World) safeZoneBlocksHostiles() bool {
	zone := w.safeZone()
	return zone.Permanent || zone.AnyProtected(w.players)
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

// PlayerSnapshots returns immutable projections for every player.
func (w *World) PlayerSnapshots() []player.Snapshot {
	w.mu.Lock()
	defer w.mu.Unlock()

	out := make([]player.Snapshot, 0, len(w.players))
	for _, p := range w.players {
		out = append(out, p.Snapshot())
	}
	return out
}

func sign(v float64) float64 {
	if v > 0 {
		return 1
	}
	if v < 0 {
		return -1
	}
	return 0
}
