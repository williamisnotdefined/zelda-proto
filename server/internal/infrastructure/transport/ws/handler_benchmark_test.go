package ws

import (
	"context"
	"crypto/rand"
	"net/http/httptest"
	"strconv"
	"strings"
	"sync/atomic"
	"testing"
	"time"

	appinst "github.com/williamisnotdefined/zelda-proto/server/internal/application/instance"
	appsess "github.com/williamisnotdefined/zelda-proto/server/internal/application/session"
	"github.com/williamisnotdefined/zelda-proto/server/internal/codec"
	"github.com/williamisnotdefined/zelda-proto/server/internal/infrastructure/id"
	"github.com/williamisnotdefined/zelda-proto/server/internal/interfaces/wsapi"
	"github.com/williamisnotdefined/zelda-proto/server/internal/protocol"
	"nhooyr.io/websocket"
)

type benchmarkIDs struct{ n atomic.Int64 }

func (b *benchmarkIDs) NewID(prefix string) string {
	return prefix + "_" + strconv.FormatInt(b.n.Add(1), 10)
}
func (b *benchmarkIDs) NewPlayerID() string     { return b.NewID("player") }
func (b *benchmarkIDs) NewConnectionID() string { return b.NewID("conn") }

func BenchmarkWebSocketBroadcastStress(b *testing.B) {
	const clients = 12

	ids := &benchmarkIDs{}
	gen := id.NewGenerator(rand.Reader)
	sessions := appsess.NewManager(appsess.Options{TokenGenerator: gen})
	manager := appinst.New(appinst.Config{IDs: ids})
	dispatcher := wsapi.NewDispatcher(manager, sessions, ids, time.Now)
	handler := NewHandlerWithLimits(dispatcher, ids, nil, nil, Limits{
		MaxConnections:      clients + 4,
		MaxConnectionsPerIP: clients + 4,
		InputRateLimit:      InputRateLimit,
		SnapshotResyncLimit: SnapshotResyncLimit,
		MaxRateViolations:   MaxRateViolations,
		MaxInvalidMessages:  MaxInvalidMessages,
		OutboxSize:          clients + 8,
	}, time.Now)

	srv := httptest.NewServer(handler)
	defer srv.Close()
	wsURL := strings.Replace(srv.URL, "http://", "ws://", 1)

	ctx, cancel := context.WithTimeout(context.Background(), 30*time.Second)
	defer cancel()
	connections := make([]*websocket.Conn, 0, clients)
	for i := 0; i < clients; i++ {
		conn, _, err := websocket.Dial(ctx, wsURL, nil)
		if err != nil {
			b.Fatalf("dial client %d: %v", i, err)
		}
		connections = append(connections, conn)

		join, err := codec.Marshal(protocol.NewJoinMessage("bench" + strconv.Itoa(i)))
		if err != nil {
			b.Fatalf("marshal join: %v", err)
		}
		if err := conn.Write(ctx, websocket.MessageBinary, join); err != nil {
			b.Fatalf("join write client %d: %v", i, err)
		}
		if typ, _, err := conn.Read(ctx); err != nil || typ != websocket.MessageBinary {
			b.Fatalf("welcome read client %d: typ=%v err=%v", i, typ, err)
		}
	}
	defer func() {
		for _, conn := range connections {
			_ = conn.Close(websocket.StatusNormalClosure, "")
		}
	}()

	dispatcher.Broadcast()
	readBroadcastFrames(b, ctx, connections)

	b.ReportAllocs()
	b.ResetTimer()
	for i := 0; i < b.N; i++ {
		dispatcher.Broadcast()
		readBroadcastFrames(b, ctx, connections)
	}
}

func readBroadcastFrames(b *testing.B, ctx context.Context, connections []*websocket.Conn) {
	b.Helper()
	for i, conn := range connections {
		if typ, _, err := conn.Read(ctx); err != nil || typ != websocket.MessageBinary {
			b.Fatalf("broadcast read client %d: typ=%v err=%v", i, typ, err)
		}
	}
}
