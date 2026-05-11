// Package spawn owns chunk-based monster spawning. Chunks are activated around
// players, populated with seeded-RNG enemies, and despawned after a
// player-absent timeout. Minion spawning around bosses is also handled here.
package spawn

import (
	"fmt"
	"math"

	"github.com/williamisnotdefined/zelda-proto/server/internal/application/registries"
	"github.com/williamisnotdefined/zelda-proto/server/internal/domain/enemy"
	"github.com/williamisnotdefined/zelda-proto/server/internal/domain/physics"
	"github.com/williamisnotdefined/zelda-proto/server/internal/domain/player"
)

const eliteEnemiesPerGroup = 2

// pacmanVariants matches the canonical client visual order.
var pacmanVariants = []enemy.PacmanVariant{
	enemy.PacmanRed, enemy.PacmanBlue, enemy.PacmanOrange, enemy.PacmanPink,
}

// IDFactory mints unique enemy ids.
type IDFactory interface {
	NewID(prefix string) string
}

// chunk tracks one active spawn cell.
type chunk struct {
	cx, cy           int
	enemyIDs         map[string]struct{}
	lastPlayerActive int64
}

// System drives chunk-based spawning.
type System struct {
	cfg    registries.SpawnSystemConfig
	ids    IDFactory
	chunks map[string]*chunk
}

// New constructs a System for the given phase.
func New(cfg registries.SpawnSystemConfig, ids IDFactory) *System {
	return &System{cfg: cfg, ids: ids, chunks: make(map[string]*chunk)}
}

// Update is called every sim tick. nowMs is the current wall time in ms.
// players: live player map. enemies: per-phase primary enemy store. add/remove
// hooks let the world maintain its spatial index.
func (s *System) Update(
	nowMs int64,
	players map[string]*player.Player,
	enemies map[string]*enemy.Enemy,
	addEnemy func(*enemy.Enemy),
	removeEnemy func(string),
) {
	if s.cfg.ChunkSize <= 0 || s.cfg.EnemiesPerChunk <= 0 {
		return
	}
	chunkSize := float64(s.cfg.ChunkSize)
	rangeChunks := int((s.cfg.ActiveRange + chunkSize - 1) / chunkSize)
	if rangeChunks < 1 {
		rangeChunks = 1
	}
	active := make(map[string]struct{})

	for _, p := range players {
		if p.State == player.StateDead {
			continue
		}
		pcx := int(floorDiv(p.X, chunkSize))
		pcy := int(floorDiv(p.Y, chunkSize))
		for dx := -rangeChunks; dx <= rangeChunks; dx++ {
			for dy := -rangeChunks; dy <= rangeChunks; dy++ {
				cx := pcx + dx
				cy := pcy + dy
				key := fmt.Sprintf("%d,%d", cx, cy)
				active[key] = struct{}{}
				ch, ok := s.chunks[key]
				if !ok {
					ch = &chunk{cx: cx, cy: cy, enemyIDs: make(map[string]struct{}), lastPlayerActive: nowMs}
					s.chunks[key] = ch
					s.populate(ch, enemies, addEnemy)
				} else {
					ch.lastPlayerActive = nowMs
				}
			}
		}
	}

	// Despawn idle chunks.
	for key, ch := range s.chunks {
		if _, ok := active[key]; ok {
			continue
		}
		if nowMs-ch.lastPlayerActive <= s.cfg.DespawnTimeMS {
			continue
		}
		for id := range ch.enemyIDs {
			delete(enemies, id)
			removeEnemy(id)
		}
		delete(s.chunks, key)
	}

	// Cleanup minions: drop dead-after-loot or wandered-out-of-range.
	for id, e := range enemies {
		if e.RespawnEnabled || e.ChunkKey != "minion" {
			continue
		}
		nearby := false
		for _, p := range players {
			if p.State == player.StateDead {
				continue
			}
			if physics.DistanceSquared(p.X, p.Y, e.X, e.Y) <= s.cfg.ActiveRange*s.cfg.ActiveRange {
				nearby = true
				break
			}
		}
		if e.State == enemy.StateDead {
			if !e.HasDropped {
				continue
			}
			delete(enemies, id)
			removeEnemy(id)
			continue
		}
		if !nearby {
			delete(enemies, id)
			removeEnemy(id)
		}
	}
}

// SpawnMinions spawns up to 3 boss minions near (x, y).
func (s *System) SpawnMinions(x, y float64, enemies map[string]*enemy.Enemy, addEnemy func(*enemy.Enemy)) {
	const minionCount = 3
	const minionRadius = 60.0
	active := 0
	for _, e := range enemies {
		if e.ChunkKey != "minion" || e.State == enemy.StateDead {
			continue
		}
		dx := e.X - x
		dy := e.Y - y
		if dx*dx+dy*dy <= (minionRadius*4)*(minionRadius*4) {
			active++
		}
	}
	for i := active; i < minionCount; i++ {
		angle := 2 * 3.141592653589793 * float64(i) / minionCount
		sx := x + cosApprox(angle)*minionRadius
		sy := y + sinApprox(angle)*minionRadius
		id := s.ids.NewID(s.cfg.EnemyPrefix + "_minion")
		minion := enemy.New(id, sx, sy, "minion", s.cfg.EnemyConfig, s.cfg.DefaultDropKind)
		minion.RespawnEnabled = false
		enemies[id] = minion
		addEnemy(minion)
	}
}

// SpawnStarterEnemies seeds count enemies in a circle around (cx, cy) with
// radius. Used by Phase 2 (skeletons) and Phase 4 (pacman ghosts).
func (s *System) SpawnStarterEnemies(cx, cy float64, count int, radius float64,
	enemies map[string]*enemy.Enemy, addEnemy func(*enemy.Enemy)) {
	for i := 0; i < count; i++ {
		angle := 2 * 3.141592653589793 * float64(i) / float64(count)
		x := cx + cosApprox(angle)*radius
		y := cy + sinApprox(angle)*radius
		id := s.ids.NewID(s.cfg.EnemyPrefix + "_starter")
		e := s.makeEnemy(id, x, y, "starter", i, count)
		enemies[id] = e
		addEnemy(e)
	}
}

func (s *System) populate(ch *chunk, enemies map[string]*enemy.Enemy, addEnemy func(*enemy.Enemy)) {
	chunkSize := float64(s.cfg.ChunkSize)
	baseX := float64(ch.cx) * chunkSize
	baseY := float64(ch.cy) * chunkSize
	key := fmt.Sprintf("%d,%d", ch.cx, ch.cy)
	for i := 0; i < s.cfg.EnemiesPerChunk; i++ {
		rx := seededRandom(ch.cx, ch.cy, i*2)
		ry := seededRandom(ch.cx, ch.cy, i*2+1)
		x := baseX + rx*chunkSize
		y := baseY + ry*chunkSize
		id := s.ids.NewID(s.cfg.EnemyPrefix)
		e := s.makeEnemy(id, x, y, key, i, s.cfg.EnemiesPerChunk)
		enemies[id] = e
		addEnemy(e)
		ch.enemyIDs[id] = struct{}{}
	}
}

func (s *System) makeEnemy(id string, x, y float64, chunkKey string, index int, total int) *enemy.Enemy {
	eliteCount := s.cfg.EliteEnemiesPerChunk
	if eliteCount <= 0 {
		eliteCount = eliteEnemiesPerGroup
	}
	elite := index < min(total, eliteCount)
	if s.cfg.PacmanVariants {
		variant := pacmanVariants[index%len(pacmanVariants)]
		if elite {
			return enemy.NewElitePacmanGhost(id, x, y, chunkKey, variant, s.cfg.DefaultDropKind)
		}
		return enemy.NewPacmanGhost(id, x, y, chunkKey, variant, s.cfg.DefaultDropKind)
	}
	cfg := s.cfg.EnemyConfig
	if len(s.cfg.MixedEnemyConfigs) > 0 {
		cfg = s.cfg.MixedEnemyConfigs[index%len(s.cfg.MixedEnemyConfigs)]
	}
	if elite {
		return enemy.NewElite(id, x, y, chunkKey, cfg, s.cfg.DefaultDropKind)
	}
	return enemy.New(id, x, y, chunkKey, cfg, s.cfg.DefaultDropKind)
}

// seededRandom mirrors client/src/shared/utils.ts (32-bit semantics via int32).
func seededRandom(cx, cy, index int) float64 {
	h := int32(int64(cx)*374761393 + int64(cy)*668265263 + int64(index)*1013904223)
	h = int32(int64(h^(h>>13)) * 1274126177)
	h = h ^ (h >> 16)
	return float64(uint32(h)) / 4294967296.0
}

func floorDiv(v, size float64) float64 {
	return math.Floor(v / size)
}

func min(a, b int) int {
	if a < b {
		return a
	}
	return b
}

func cosApprox(a float64) float64 { return math.Cos(a) }
func sinApprox(a float64) float64 { return math.Sin(a) }
