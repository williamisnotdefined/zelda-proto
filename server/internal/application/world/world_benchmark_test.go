package world

import (
	"math/rand"
	"strconv"
	"testing"
	"time"

	"github.com/williamisnotdefined/zelda-proto/server/internal/domain/drop"
	"github.com/williamisnotdefined/zelda-proto/server/internal/domain/enemy"
	domworld "github.com/williamisnotdefined/zelda-proto/server/internal/domain/world"
)

func newBenchmarkWorld() *World {
	now := time.Unix(1_700_000_000, 0)
	return New(Config{
		InstanceID: domworld.InstancePhase1,
		SpawnX:     200,
		SpawnY:     200,
		IDs:        &counterIDs{},
		Rand:       rand.New(rand.NewSource(1)),
		NowFunc:    func() time.Time { return now },
	})
}

func populateBenchmarkWorld(w *World, players int, enemies int) {
	for i := 0; i < players; i++ {
		x := 1000.0 + float64(i%10)*80
		y := 1000.0 + float64(i/10)*80
		p := w.AddPlayer("p"+strconv.Itoa(i), "player", &x, &y)
		p.SafeZoneTimer = 0
	}
	for i := 0; i < enemies; i++ {
		x := 900.0 + float64(i%25)*44
		y := 900.0 + float64(i/25)*44
		w.SpawnEnemy(enemy.New("e"+strconv.Itoa(i), x, y, "bench", enemy.BlobConfig, drop.KindFoodSmall))
	}
}

func BenchmarkWorldTickStress(b *testing.B) {
	w := newBenchmarkWorld()
	populateBenchmarkWorld(w, 24, 400)
	b.ReportAllocs()
	b.ResetTimer()
	for i := 0; i < b.N; i++ {
		w.Tick(time.Second / 60)
	}
}

func BenchmarkWorldSnapshotStress(b *testing.B) {
	w := newBenchmarkWorld()
	populateBenchmarkWorld(w, 24, 400)
	b.ReportAllocs()
	b.ResetTimer()
	for i := 0; i < b.N; i++ {
		_ = w.Snapshot()
	}
}
