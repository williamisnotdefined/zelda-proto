package ws

import (
	"context"
	"crypto/rand"
	"net/http"
	"net/http/httptest"
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

type fakeIDs struct{ n atomic.Int64 }

type allowAllOrigins struct{}

func (f *fakeIDs) NewID(prefix string) string    { return prefix }
func (f *fakeIDs) NewPlayerID() string           { f.n.Add(1); return "player_x" }
func (f *fakeIDs) NewConnectionID() string       { f.n.Add(1); return "conn_x" }
func (allowAllOrigins) Allow(*http.Request) bool { return true }

func TestHandlerAcceptsAndReceivesWelcome(t *testing.T) {
	t.Parallel()

	ids := &fakeIDs{}
	gen := id.NewGenerator(rand.Reader)
	sessions := appsess.NewManager(appsess.Options{TokenGenerator: gen})
	manager := appinst.New(appinst.Config{IDs: ids})
	dispatcher := wsapi.NewDispatcher(manager, sessions, ids, time.Now)
	handler := NewHandler(dispatcher, ids, nil, nil, time.Now)

	srv := httptest.NewServer(handler)
	defer srv.Close()

	wsURL := strings.Replace(srv.URL, "http://", "ws://", 1)
	ctx, cancel := context.WithTimeout(context.Background(), 2*time.Second)
	defer cancel()
	c, _, err := websocket.Dial(ctx, wsURL, nil)
	if err != nil {
		t.Fatalf("dial: %v", err)
	}
	defer c.Close(websocket.StatusNormalClosure, "")

	join := codec.Object{
		{Key: "protocolVersion", Value: int64(protocol.ProtocolVersion)},
		{Key: "type", Value: string(protocol.ClientMessageTypeJoin)},
		{Key: "nickname", Value: "alice"},
	}
	encoded, err := codec.Marshal(join)
	if err != nil {
		t.Fatalf("encode: %v", err)
	}
	if err := c.Write(ctx, websocket.MessageBinary, encoded); err != nil {
		t.Fatalf("write: %v", err)
	}

	typ, data, err := c.Read(ctx)
	if err != nil {
		t.Fatalf("read: %v", err)
	}
	if typ != websocket.MessageBinary {
		t.Fatalf("expected binary message, got %v", typ)
	}
	decoded, err := codec.Decode(data)
	if err != nil {
		t.Fatalf("decode: %v", err)
	}
	obj, ok := decoded.(codec.Object)
	if !ok {
		t.Fatalf("expected codec.Object, got %T", decoded)
	}
	v, _ := obj.Lookup("type")
	if s, _ := v.(string); s != string(protocol.ServerMessageTypeWelcome) {
		t.Fatalf("expected welcome, got %q", s)
	}
}

func TestHandlerClosesOnProtocolMismatch(t *testing.T) {
	t.Parallel()

	ids := &fakeIDs{}
	gen := id.NewGenerator(rand.Reader)
	sessions := appsess.NewManager(appsess.Options{TokenGenerator: gen})
	manager := appinst.New(appinst.Config{IDs: ids})
	dispatcher := wsapi.NewDispatcher(manager, sessions, ids, time.Now)
	handler := NewHandler(dispatcher, ids, nil, nil, time.Now)

	srv := httptest.NewServer(handler)
	defer srv.Close()

	wsURL := strings.Replace(srv.URL, "http://", "ws://", 1)
	ctx, cancel := context.WithTimeout(context.Background(), 2*time.Second)
	defer cancel()
	c, _, err := websocket.Dial(ctx, wsURL, nil)
	if err != nil {
		t.Fatalf("dial: %v", err)
	}
	defer c.Close(websocket.StatusNormalClosure, "")

	join := codec.Object{
		{Key: "protocolVersion", Value: int64(protocol.ProtocolVersion - 1)},
		{Key: "type", Value: string(protocol.ClientMessageTypeJoin)},
		{Key: "nickname", Value: "alice"},
	}
	encoded, err := codec.Marshal(join)
	if err != nil {
		t.Fatalf("encode: %v", err)
	}
	if err := c.Write(ctx, websocket.MessageBinary, encoded); err != nil {
		t.Fatalf("write: %v", err)
	}

	_, _, err = c.Read(ctx)
	if websocket.CloseStatus(err) != websocket.StatusProtocolError {
		t.Fatalf("expected protocol-error close, got %v", err)
	}
}

func TestHandlerCountsNonBinaryFramesAsInvalid(t *testing.T) {
	t.Parallel()

	ids := &fakeIDs{}
	gen := id.NewGenerator(rand.Reader)
	sessions := appsess.NewManager(appsess.Options{TokenGenerator: gen})
	manager := appinst.New(appinst.Config{IDs: ids})
	dispatcher := wsapi.NewDispatcher(manager, sessions, ids, time.Now)
	handler := NewHandler(dispatcher, ids, nil, nil, time.Now)

	srv := httptest.NewServer(handler)
	defer srv.Close()

	wsURL := strings.Replace(srv.URL, "http://", "ws://", 1)
	ctx, cancel := context.WithTimeout(context.Background(), 2*time.Second)
	defer cancel()
	c, _, err := websocket.Dial(ctx, wsURL, nil)
	if err != nil {
		t.Fatalf("dial: %v", err)
	}
	defer c.Close(websocket.StatusNormalClosure, "")

	for i := 0; i <= MaxInvalidMessages; i++ {
		if err := c.Write(ctx, websocket.MessageText, []byte("not-msgpack")); err != nil {
			t.Fatalf("write: %v", err)
		}
	}
	_, _, err = c.Read(ctx)
	if websocket.CloseStatus(err) != websocket.StatusPolicyViolation {
		t.Fatalf("expected policy-violation close, got %v", err)
	}
}

func TestConnectionClosesWhenOutboxIsFull(t *testing.T) {
	t.Parallel()

	c := &Connection{id: "c1", outbox: make(chan []byte, 1), closeCh: make(chan struct{})}
	c.outbox <- []byte("first")
	if err := c.Send([]byte("second")); err == nil {
		t.Fatal("expected outbox full error")
	}
	if !c.closed.Load() {
		t.Fatal("expected slow consumer to be closed")
	}
}

func TestNewHandlerWithLimitsAppliesCustomBudgets(t *testing.T) {
	t.Parallel()

	ids := &fakeIDs{}
	gen := id.NewGenerator(rand.Reader)
	sessions := appsess.NewManager(appsess.Options{TokenGenerator: gen})
	manager := appinst.New(appinst.Config{IDs: ids})
	dispatcher := wsapi.NewDispatcher(manager, sessions, ids, time.Now)
	handler := NewHandlerWithLimits(dispatcher, ids, nil, nil, Limits{
		MaxConnections:      10,
		MaxConnectionsPerIP: 2,
		InputRateLimit:      3,
		SnapshotResyncLimit: 4,
		MaxRateViolations:   5,
		MaxInvalidMessages:  6,
		OutboxSize:          7,
	}, time.Now)

	if handler.limits.MaxConnections != 10 || handler.limits.MaxConnectionsPerIP != 2 || handler.limits.InputRateLimit != 3 ||
		handler.limits.SnapshotResyncLimit != 4 || handler.limits.MaxRateViolations != 5 || handler.limits.MaxInvalidMessages != 6 ||
		handler.limits.OutboxSize != 7 {
		t.Fatalf("unexpected handler limits: %+v", handler.limits)
	}
}

func TestHandlerAcceptsAllowedOriginBehindProxyHostMismatch(t *testing.T) {
	t.Parallel()

	ids := &fakeIDs{}
	gen := id.NewGenerator(rand.Reader)
	sessions := appsess.NewManager(appsess.Options{TokenGenerator: gen})
	manager := appinst.New(appinst.Config{IDs: ids})
	dispatcher := wsapi.NewDispatcher(manager, sessions, ids, time.Now)
	handler := NewHandler(dispatcher, ids, allowAllOrigins{}, nil, time.Now)

	srv := httptest.NewServer(handler)
	defer srv.Close()

	wsURL := strings.Replace(srv.URL, "http://", "ws://", 1)
	ctx, cancel := context.WithTimeout(context.Background(), 2*time.Second)
	defer cancel()
	c, _, err := websocket.Dial(ctx, wsURL, &websocket.DialOptions{
		HTTPHeader: http.Header{"Origin": []string{"https://wilho.com.br"}},
	})
	if err != nil {
		t.Fatalf("dial: %v", err)
	}
	defer c.Close(websocket.StatusNormalClosure, "")
}
