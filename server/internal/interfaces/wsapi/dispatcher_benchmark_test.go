package wsapi

import (
	"strconv"
	"testing"
	"time"

	appinst "github.com/williamisnotdefined/zelda-proto/server/internal/application/instance"
	appsess "github.com/williamisnotdefined/zelda-proto/server/internal/application/session"
	"github.com/williamisnotdefined/zelda-proto/server/internal/domain/drop"
	"github.com/williamisnotdefined/zelda-proto/server/internal/domain/enemy"
	"github.com/williamisnotdefined/zelda-proto/server/internal/domain/player"
	domworld "github.com/williamisnotdefined/zelda-proto/server/internal/domain/world"
	"github.com/williamisnotdefined/zelda-proto/server/internal/protocol"
)

type discardConn struct{ id string }

func (c discardConn) Send([]byte) error    { return nil }
func (c discardConn) ConnectionID() string { return c.id }

func BenchmarkBroadcastStress(b *testing.B) {
	d := newBenchmarkDispatcher(b)

	b.ReportAllocs()
	b.ResetTimer()
	for i := 0; i < b.N; i++ {
		d.Broadcast()
	}
}

func BenchmarkBroadcastDeltaSteadyState(b *testing.B) {
	d := newBenchmarkDispatcher(b)
	d.Broadcast()
	d.Broadcast()

	b.ReportAllocs()
	b.ResetTimer()
	for i := 0; i < b.N; i++ {
		d.Broadcast()
	}
}

func BenchmarkBroadcastDeltaWithMovement(b *testing.B) {
	d := newBenchmarkDispatcher(b)
	d.Broadcast()
	d.Broadcast()

	b.ReportAllocs()
	b.ResetTimer()
	for i := 0; i < b.N; i++ {
		for playerIndex := 1; playerIndex <= 24; playerIndex++ {
			d.manager.HandleInput("player_"+strconv.Itoa(playerIndex), player.Input{
				Seq:   int64(i + 1),
				Right: i%2 == 0,
				Left:  i%2 != 0,
			})
		}
		d.manager.Tick(time.Second / 60)
		d.Broadcast()
	}
}

func newBenchmarkDispatcher(b *testing.B) *Dispatcher {
	b.Helper()

	ids := &counterIDs{}
	manager := appinst.New(appinst.Config{IDs: ids, StartPhase: domworld.InstancePhase1})
	sessions := appsess.NewManager(appsess.Options{TokenGenerator: &tokenGen{}})
	d := NewDispatcher(manager, sessions, ids, func() time.Time { return time.Unix(0, 0) })

	for i := 0; i < 24; i++ {
		connID := "c" + strconv.Itoa(i)
		d.Register(discardConn{id: connID})
		if err := d.HandleJoin(connID, protocol.JoinMessage{Nickname: "p" + strconv.Itoa(i)}); err != nil {
			b.Fatal(err)
		}
	}
	w := manager.World(domworld.InstancePhase1)
	for i := 0; i < 400; i++ {
		x := 900.0 + float64(i%25)*44
		y := 900.0 + float64(i/25)*44
		w.SpawnEnemy(enemy.New("e"+strconv.Itoa(i), x, y, "bench", enemy.BlobConfig, drop.KindHeartSmall))
	}
	return d
}
