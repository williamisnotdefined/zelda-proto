// Package enemy hosts the Enemy aggregate (Blob and its variants Skeleton,
// Knight, PacmanGhost). Variants are configuration-driven: a single Enemy struct
// covers all kinds.
package enemy

import (
	"hash/fnv"
	"math"
	"time"

	"github.com/williamisnotdefined/zelda-proto/server/internal/domain/drop"
	"github.com/williamisnotdefined/zelda-proto/server/internal/domain/physics"
	domworld "github.com/williamisnotdefined/zelda-proto/server/internal/domain/world"
)

// Kind identifies the enemy variant. Mirrors client/src/shared/types.ts.
type Kind string

// Enemy variant identifiers.
const (
	KindBlob        Kind = "blob"
	KindSkeleton    Kind = "skeleton"
	KindKnight      Kind = "knight"
	KindPacmanGhost Kind = "pacman_ghost"
)

// State enumerates the enemy AI states.
type State string

// Canonical state values.
const (
	StateIdle      State = "idle"
	StateChasing   State = "chasing"
	StateAttacking State = "attacking"
	StateShielding State = "shielding"
	StateSprinting State = "sprinting"
	StateRolling   State = "rolling"
	StateCasting   State = "casting"
	StateDead      State = "dead"
)

// PacmanVariant is the visual variant for the PacmanGhost kind.
type PacmanVariant string

// Pacman ghost colors.
const (
	PacmanRed    PacmanVariant = "red"
	PacmanBlue   PacmanVariant = "blue"
	PacmanOrange PacmanVariant = "orange"
	PacmanPink   PacmanVariant = "pink"
)

// TargetReacquireInterval bounds how often AI scans for a new target.
const TargetReacquireInterval = 120 * time.Millisecond

const (
	EliteSizeMultiplier = 2
	EliteStatMultiplier = 3
)

const (
	knightBladeWaveMinRange = 150
	knightBladeWaveMaxRange = 620
	knightSprintMinRange    = 180
	knightSprintMaxRange    = 520
	knightRollRange         = 115
	knightShieldRange       = 130
	knightCastDuration      = 420 * time.Millisecond
	knightSprintDuration    = 360 * time.Millisecond
	knightRollDuration      = 420 * time.Millisecond
	knightShieldDuration    = 520 * time.Millisecond
	knightAbilityCooldown   = 1500 * time.Millisecond
	knightSprintSpeed       = 265
	knightRollSpeed         = 215
)

// PlayerSize is the conventional axis-aligned player extent.
const (
	PlayerWidth  float64 = 48
	PlayerHeight float64 = 48
)

// Config defines the static parameters of an enemy variant.
type Config struct {
	Kind          Kind
	MaxHP         int
	Speed         float64
	Damage        int
	AggroRadius   float64
	ContactRadius float64
	Width         float64
	Height        float64
	RespawnTime   time.Duration
}

// Variant configurations for each enemy family.
var (
	BlobConfig = Config{
		Kind: KindBlob, MaxHP: 30, Speed: 60, Damage: 5,
		AggroRadius: 600, ContactRadius: 14,
		Width: 48, Height: 48, RespawnTime: 10 * time.Second,
	}
	SkeletonConfig = Config{
		Kind: KindSkeleton, MaxHP: 45, Speed: 60, Damage: 10,
		AggroRadius: 600, ContactRadius: 24,
		Width: 48, Height: 48, RespawnTime: 10 * time.Second,
	}
	KnightConfig = Config{
		Kind: KindKnight, MaxHP: 70, Speed: 74, Damage: 14,
		AggroRadius: 760, ContactRadius: 26,
		Width: 56, Height: 56, RespawnTime: 10 * time.Second,
	}
	PacmanGhostConfig = Config{
		Kind: KindPacmanGhost, MaxHP: 80, Speed: 90, Damage: 20,
		AggroRadius: 600, ContactRadius: 24,
		Width: 48, Height: 48, RespawnTime: 10 * time.Second,
	}
)

// PlayerView is the read-only snapshot of a player relevant to enemy AI.
type PlayerView struct {
	ID        string
	X, Y      float64
	Alive     bool
	Protected bool
}

// MonsterView is the read-only enemy target consumed by the confusion AI.
// Confusion never retargets players or bosses; it only redirects monsters to
// fight other monsters.
type MonsterView struct {
	ID     string
	X, Y   float64
	Alive  bool
	Radius float64
}

// Enemy is the AI aggregate.
type Enemy struct {
	ID             string
	Kind           Kind
	Elite          bool
	Variant        PacmanVariant
	Config         Config
	X, Y           float64
	SpawnX, SpawnY float64
	ChunkKey       string
	HP             int
	State          State
	Facing         domworld.Direction
	TargetID       string
	DamageCooldown time.Duration
	RespawnTimer   time.Duration
	HasDropped     bool
	DropKind       drop.Kind
	RespawnEnabled bool

	reacquireTimer  time.Duration
	reacquireOffset time.Duration

	knightAbilityTimer       time.Duration
	knightAbilityCooldown    time.Duration
	knightDirX, knightDirY   float64
	knightAbilitySerial      int
	knightBladeWaveQueued    bool
	knightBladeWaveDirection domworld.Direction
}

// New constructs an enemy at (x, y) with the supplied configuration.
func New(id string, x, y float64, chunkKey string, cfg Config, dropKind drop.Kind) *Enemy {
	return newEnemy(id, x, y, chunkKey, cfg, dropKind, false)
}

// NewElite constructs an elite enemy at (x, y) with the supplied configuration.
func NewElite(id string, x, y float64, chunkKey string, cfg Config, dropKind drop.Kind) *Enemy {
	return newEnemy(id, x, y, chunkKey, cfg, dropKind, true)
}

func newEnemy(id string, x, y float64, chunkKey string, cfg Config, dropKind drop.Kind, elite bool) *Enemy {
	if elite {
		cfg = cfg.WithEliteStats()
	}
	return &Enemy{
		ID: id, Kind: cfg.Kind, Elite: elite, Config: cfg,
		X: x, Y: y, SpawnX: x, SpawnY: y,
		ChunkKey:        chunkKey,
		HP:              cfg.MaxHP,
		State:           StateIdle,
		DropKind:        dropKind,
		RespawnEnabled:  true,
		reacquireOffset: hashOffset(id),
	}
}

// NewPacmanGhost constructs a PacmanGhost variant.
func NewPacmanGhost(id string, x, y float64, chunkKey string, variant PacmanVariant, dropKind drop.Kind) *Enemy {
	e := New(id, x, y, chunkKey, PacmanGhostConfig, dropKind)
	e.Variant = variant
	return e
}

// NewElitePacmanGhost constructs an elite PacmanGhost variant.
func NewElitePacmanGhost(id string, x, y float64, chunkKey string, variant PacmanVariant, dropKind drop.Kind) *Enemy {
	e := NewElite(id, x, y, chunkKey, PacmanGhostConfig, dropKind)
	e.Variant = variant
	return e
}

// WithEliteStats returns a copy of cfg with elite stat multipliers applied.
func (cfg Config) WithEliteStats() Config {
	cfg.MaxHP *= EliteStatMultiplier
	cfg.Damage *= EliteStatMultiplier
	cfg.ContactRadius *= EliteSizeMultiplier
	cfg.Width *= EliteSizeMultiplier
	cfg.Height *= EliteSizeMultiplier
	return cfg
}

func hashOffset(id string) time.Duration {
	h := fnv.New32a()
	_, _ = h.Write([]byte(id))
	return time.Duration(h.Sum32()%uint32(TargetReacquireInterval.Milliseconds())) * time.Millisecond
}

// FindNearestPlayer is supplied by callers (typically the spatial index) to
// avoid an O(N) scan in the AI hot path.
type FindNearestPlayer func(x, y, radius float64, predicate func(PlayerView) bool) *PlayerView

// Update advances the enemy. spawnSafeZoneActive prevents the enemy from
// entering the spawn safe zone.
func (e *Enemy) Update(dt time.Duration, players []PlayerView, spawnSafeZoneActive bool, spawnX, spawnY, safeRadius float64, find FindNearestPlayer) {
	if e.DamageCooldown > 0 {
		e.DamageCooldown -= dt
		if e.DamageCooldown < 0 {
			e.DamageCooldown = 0
		}
	}
	if e.State == StateDead {
		return
	}
	if e.knightAbilityCooldown > 0 {
		e.knightAbilityCooldown -= dt
		if e.knightAbilityCooldown < 0 {
			e.knightAbilityCooldown = 0
		}
	}
	if e.Kind == KindKnight {
		e.updateKnight(dt, players, spawnSafeZoneActive, spawnX, spawnY, safeRadius, find)
		return
	}

	e.reacquireTimer -= dt
	if e.reacquireTimer <= 0 {
		e.reacquireTimer = TargetReacquireInterval + e.reacquireOffset
		e.acquireTarget(players, find)
	}

	target := e.lookupTarget(players)
	if target == nil {
		e.TargetID = ""
		e.State = StateIdle
		return
	}

	dx := target.X - e.X
	dy := target.Y - e.Y
	dist := math.Hypot(dx, dy)
	if dist == 0 {
		return
	}
	e.Facing = cardinalDirection(dx, dy)
	step := e.Config.Speed * dt.Seconds()
	nx := e.X + (dx/dist)*step
	ny := e.Y + (dy/dist)*step

	if spawnSafeZoneActive && physics.IsInSafeZone(nx, ny, spawnX, spawnY, safeRadius) {
		// Tangential deflection: rotate normalized direction 90°.
		nx = e.X + (-dy/dist)*step
		ny = e.Y + (dx/dist)*step
	}

	e.X, e.Y = nx, ny
	e.State = StateChasing

	if e.overlapsTarget(target) && e.DamageCooldown <= 0 {
		e.State = StateAttacking
	}
}

// UpdateAgainstMonster advances the enemy while targeting another monster. It
// is used only by the confusion status, so it intentionally bypasses player AI
// acquisition and prevents confused monsters from choosing players as targets.
func (e *Enemy) UpdateAgainstMonster(dt time.Duration, target *MonsterView, spawnSafeZoneActive bool, spawnX, spawnY, safeRadius float64) {
	if e.DamageCooldown > 0 {
		e.DamageCooldown -= dt
		if e.DamageCooldown < 0 {
			e.DamageCooldown = 0
		}
	}
	if e.State == StateDead {
		return
	}
	if e.knightAbilityCooldown > 0 {
		e.knightAbilityCooldown -= dt
		if e.knightAbilityCooldown < 0 {
			e.knightAbilityCooldown = 0
		}
	}

	if target == nil || !target.Alive || target.ID == e.ID {
		e.TargetID = ""
		e.State = StateIdle
		e.knightAbilityTimer = 0
		return
	}

	e.TargetID = target.ID
	dx := target.X - e.X
	dy := target.Y - e.Y
	dist := math.Hypot(dx, dy)
	if dist == 0 {
		if e.DamageCooldown <= 0 {
			e.State = StateAttacking
		}
		return
	}
	e.Facing = cardinalDirection(dx, dy)

	if e.overlapsMonsterTarget(target) && e.DamageCooldown <= 0 {
		e.State = StateAttacking
		return
	}

	step := e.Config.Speed * dt.Seconds()
	nx := e.X + (dx/dist)*step
	ny := e.Y + (dy/dist)*step
	if spawnSafeZoneActive && physics.IsInSafeZone(nx, ny, spawnX, spawnY, safeRadius) {
		nx = e.X + (-dy/dist)*step
		ny = e.Y + (dx/dist)*step
	}
	e.X, e.Y = nx, ny
	e.State = StateChasing
	if e.overlapsMonsterTarget(target) && e.DamageCooldown <= 0 {
		e.State = StateAttacking
	}
}

func (e *Enemy) updateKnight(dt time.Duration, players []PlayerView, spawnSafeZoneActive bool, spawnX, spawnY, safeRadius float64, find FindNearestPlayer) {
	e.reacquireTimer -= dt
	if e.reacquireTimer <= 0 {
		e.reacquireTimer = TargetReacquireInterval + e.reacquireOffset
		e.acquireTarget(players, find)
	}

	target := e.lookupTarget(players)
	if target == nil {
		e.TargetID = ""
		e.State = StateIdle
		e.knightAbilityTimer = 0
		return
	}

	dx := target.X - e.X
	dy := target.Y - e.Y
	dist := math.Hypot(dx, dy)
	if dist == 0 {
		dx, dist = 1, 1
	}
	e.Facing = cardinalDirection(dx, dy)
	dirX := dx / dist
	dirY := dy / dist

	if e.knightAbilityTimer > 0 {
		e.advanceKnightAbility(dt, spawnSafeZoneActive, spawnX, spawnY, safeRadius)
		return
	}

	if e.overlapsTarget(target) && e.DamageCooldown <= 0 {
		e.State = StateAttacking
		return
	}

	if e.knightAbilityCooldown <= 0 && e.tryStartKnightAbility(dist, dirX, dirY) {
		return
	}

	step := e.Config.Speed * dt.Seconds()
	e.moveKnightBy(dirX, dirY, step, spawnSafeZoneActive, spawnX, spawnY, safeRadius)
	e.State = StateChasing
	if e.overlapsTarget(target) && e.DamageCooldown <= 0 {
		e.State = StateAttacking
	}
}

func (e *Enemy) tryStartKnightAbility(dist, dirX, dirY float64) bool {
	choice := e.knightAbilitySerial % 4

	if dist <= knightRollRange {
		rollX, rollY := -dirX, -dirY
		if choice%2 == 1 {
			rollX, rollY = -dirY, dirX
		}
		e.startKnightAbility(StateRolling, knightRollDuration, rollX, rollY)
		return true
	}

	if dist <= knightShieldRange && choice == 3 {
		e.startKnightAbility(StateShielding, knightShieldDuration, 0, 0)
		return true
	}

	if dist >= knightSprintMinRange && dist <= knightSprintMaxRange && (choice == 1 || choice == 2) {
		e.startKnightAbility(StateSprinting, knightSprintDuration, dirX, dirY)
		return true
	}

	if dist >= knightBladeWaveMinRange && dist <= knightBladeWaveMaxRange {
		e.startKnightAbility(StateCasting, knightCastDuration, 0, 0)
		e.knightBladeWaveQueued = true
		e.knightBladeWaveDirection = cardinalDirection(dirX, dirY)
		return true
	}

	if dist <= knightShieldRange {
		e.startKnightAbility(StateShielding, knightShieldDuration, 0, 0)
		return true
	}

	return false
}

func (e *Enemy) startKnightAbility(state State, duration time.Duration, dirX, dirY float64) {
	e.State = state
	e.knightAbilityTimer = duration
	e.knightAbilityCooldown = e.knightCooldown(knightAbilityCooldown)
	e.knightDirX = dirX
	e.knightDirY = dirY
	e.knightAbilitySerial++
}

func (e *Enemy) advanceKnightAbility(dt time.Duration, spawnSafeZoneActive bool, spawnX, spawnY, safeRadius float64) {
	if e.State == StateSprinting || e.State == StateRolling {
		speed := knightSprintSpeed
		if e.State == StateRolling {
			speed = knightRollSpeed
		}
		if e.Elite {
			speed = int(float64(speed) * 1.18)
		}
		e.moveKnightBy(e.knightDirX, e.knightDirY, float64(speed)*dt.Seconds(), spawnSafeZoneActive, spawnX, spawnY, safeRadius)
	}

	e.knightAbilityTimer -= dt
	if e.knightAbilityTimer <= 0 {
		e.knightAbilityTimer = 0
		e.State = StateIdle
	}
}

func (e *Enemy) moveKnightBy(dirX, dirY, step float64, spawnSafeZoneActive bool, spawnX, spawnY, safeRadius float64) {
	if dirX == 0 && dirY == 0 {
		return
	}
	nx := e.X + dirX*step
	ny := e.Y + dirY*step
	if spawnSafeZoneActive && physics.IsInSafeZone(nx, ny, spawnX, spawnY, safeRadius) {
		nx = e.X + (-dirY)*step
		ny = e.Y + dirX*step
	}
	e.X, e.Y = nx, ny
}

func (e *Enemy) knightCooldown(base time.Duration) time.Duration {
	if e.Elite {
		return time.Duration(float64(base) * 0.72)
	}
	return base
}

// FaceMonsterTarget switches the enemy's visual/AI intent away from players and
// toward a monster target without advancing movement. Confusion uses this at the
// moment the status lands so clients see the turn immediately.
func (e *Enemy) FaceMonsterTarget(target *MonsterView) {
	if target == nil || !target.Alive || target.ID == e.ID || e.State == StateDead {
		return
	}
	e.TargetID = target.ID
	e.faceToward(target.X, target.Y)
}

func (e *Enemy) faceToward(x, y float64) {
	dx := x - e.X
	dy := y - e.Y
	if dx == 0 && dy == 0 {
		return
	}
	e.Facing = cardinalDirection(dx, dy)
}

func cardinalDirection(dx, dy float64) domworld.Direction {
	if math.Abs(dx) >= math.Abs(dy) {
		if dx < 0 {
			return domworld.DirectionLeft
		}
		return domworld.DirectionRight
	}
	if dy < 0 {
		return domworld.DirectionUp
	}
	return domworld.DirectionDown
}

func max(a, b int) int {
	if a > b {
		return a
	}
	return b
}

// ConsumeKnightBladeWave drains the one-shot ranged attack queued by the Knight AI.
func (e *Enemy) ConsumeKnightBladeWave() (domworld.Direction, bool) {
	if !e.knightBladeWaveQueued {
		return "", false
	}
	e.knightBladeWaveQueued = false
	return e.knightBladeWaveDirection, e.knightBladeWaveDirection != ""
}

func (e *Enemy) acquireTarget(players []PlayerView, find FindNearestPlayer) {
	pred := func(p PlayerView) bool { return p.Alive && !p.Protected }
	if find != nil {
		if found := find(e.X, e.Y, e.Config.AggroRadius, pred); found != nil {
			e.TargetID = found.ID
			return
		}
		e.TargetID = ""
		return
	}

	bestDistSq := e.Config.AggroRadius * e.Config.AggroRadius
	best := ""
	for _, p := range players {
		if !pred(p) {
			continue
		}
		dsq := physics.DistanceSquared(e.X, e.Y, p.X, p.Y)
		if dsq <= bestDistSq {
			bestDistSq = dsq
			best = p.ID
		}
	}
	e.TargetID = best
}

func (e *Enemy) lookupTarget(players []PlayerView) *PlayerView {
	if e.TargetID == "" {
		return nil
	}
	for i := range players {
		if players[i].ID == e.TargetID && players[i].Alive {
			return &players[i]
		}
	}
	return nil
}

func (e *Enemy) overlapsTarget(target *PlayerView) bool {
	r := e.CollisionRadius() + PlayerWidth/2
	return physics.DistanceSquared(e.X, e.Y, target.X, target.Y) <= r*r
}

func (e *Enemy) overlapsMonsterTarget(target *MonsterView) bool {
	r := e.CollisionRadius() + target.Radius
	return physics.DistanceSquared(e.X, e.Y, target.X, target.Y) <= r*r
}

// CollisionRadius returns the solid body radius used for actor-vs-actor
// blocking. This is intentionally wider than some contact-damage radii so the
// visual sprite body cannot pass through other solid actors.
func (e *Enemy) CollisionRadius() float64 {
	return math.Max(e.Config.Width, e.Config.Height) / 2
}

// MarkContactDamageDealt sets the global damage cooldown.
func (e *Enemy) MarkContactDamageDealt() {
	e.DamageCooldown = 1000 * time.Millisecond
}

// TakeDamage applies amount of damage. Negative or zero amounts are ignored.
func (e *Enemy) TakeDamage(amount int) {
	if amount <= 0 || e.State == StateDead {
		return
	}
	if e.Kind == KindKnight && e.State == StateShielding {
		amount = max(1, amount/2)
	}
	e.HP -= amount
	if e.HP <= 0 {
		e.HP = 0
		e.State = StateDead
		e.TargetID = ""
		e.RespawnTimer = e.Config.RespawnTime
	}
}

// TryRespawn decrements the respawn timer and resets the enemy when it
// reaches zero. Returns true on respawn.
func (e *Enemy) TryRespawn(dt time.Duration) bool {
	if e.State != StateDead || !e.RespawnEnabled {
		return false
	}
	e.RespawnTimer -= dt
	if e.RespawnTimer > 0 {
		return false
	}
	e.X = e.SpawnX
	e.Y = e.SpawnY
	e.HP = e.Config.MaxHP
	e.State = StateIdle
	e.DamageCooldown = 0
	e.TargetID = ""
	e.HasDropped = false
	e.knightAbilityTimer = 0
	e.knightAbilityCooldown = 0
	e.knightBladeWaveQueued = false
	e.knightBladeWaveDirection = ""
	return true
}

// Snapshot is the wire projection.
type Snapshot struct {
	ID                    string
	Kind                  Kind
	Elite                 bool
	Variant               PacmanVariant
	VenomMarked           bool
	Confused              bool
	Facing                domworld.Direction
	BurningTicksRemaining int
	X, Y                  float64
	HP                    int
	MaxHP                 int
	State                 State
}

// Snapshot returns a quantized projection.
func (e *Enemy) Snapshot() Snapshot {
	return Snapshot{
		ID: e.ID, Kind: e.Kind, Elite: e.Elite, Variant: e.Variant,
		X: physics.QuantizePosition(e.X), Y: physics.QuantizePosition(e.Y),
		HP: e.HP, MaxHP: e.Config.MaxHP, State: e.State,
		Facing: e.Facing,
	}
}
