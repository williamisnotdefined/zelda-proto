// Package ws hosts the WebSocket transport adapter that wraps a single
// connection and forwards client messages to the wsapi dispatcher.
package ws

import (
	"context"
	"errors"
	"net/http"
	"sync"
	"sync/atomic"
	"time"

	"github.com/williamisnotdefined/zelda-proto/server_go/internal/codec"
	"github.com/williamisnotdefined/zelda-proto/server_go/internal/interfaces/wsapi"
	"github.com/williamisnotdefined/zelda-proto/server_go/internal/protocol"
	"nhooyr.io/websocket"
)

// Constants mirror the legacy server's safety budgets.
const (
	ReadLimit         = 1024
	HeartbeatInterval = 25 * time.Second
	HeartbeatTimeout  = 35 * time.Second
)

// ConnectionIDFactory mints unique connection ids.
type ConnectionIDFactory interface {
	NewConnectionID() string
}

// OriginValidator returns true when the request origin is allowed.
type OriginValidator interface {
	Allow(req *http.Request) bool
}

// Handler is the http.Handler that upgrades to WebSocket and pumps frames.
type Handler struct {
	dispatcher *wsapi.Dispatcher
	ids        ConnectionIDFactory
	origins    OriginValidator
	now        func() time.Time
}

// NewHandler constructs the handler.
func NewHandler(dispatcher *wsapi.Dispatcher, ids ConnectionIDFactory, origins OriginValidator, now func() time.Time) *Handler {
	if now == nil {
		now = time.Now
	}
	return &Handler{dispatcher: dispatcher, ids: ids, origins: origins, now: now}
}

// ServeHTTP upgrades the request and runs the per-connection loop.
func (h *Handler) ServeHTTP(w http.ResponseWriter, r *http.Request) {
	if h.origins != nil && !h.origins.Allow(r) {
		http.Error(w, "forbidden", http.StatusForbidden)
		return
	}

	conn, err := websocket.Accept(w, r, &websocket.AcceptOptions{
		InsecureSkipVerify: h.origins == nil,
	})
	if err != nil {
		return
	}
	conn.SetReadLimit(ReadLimit)

	id := h.ids.NewConnectionID()
	c := &Connection{conn: conn, id: id, outbox: make(chan []byte, 64), closeCh: make(chan struct{})}
	h.dispatcher.Register(c)

	ctx, cancel := context.WithCancel(r.Context())
	defer cancel()
	defer h.dispatcher.Disconnect(id)

	var wg sync.WaitGroup
	wg.Add(2)
	go func() { defer wg.Done(); c.writeLoop(ctx) }()
	go func() { defer wg.Done(); c.pingLoop(ctx) }()

	h.readLoop(ctx, c)
	cancel()
	c.close()
	wg.Wait()
}

func (h *Handler) readLoop(ctx context.Context, c *Connection) {
	for {
		typ, data, err := c.conn.Read(ctx)
		if err != nil {
			return
		}
		if typ != websocket.MessageBinary {
			continue
		}
		decoded, err := codec.Decode(data)
		if err != nil {
			continue
		}
		obj, ok := decoded.(codec.Object)
		if !ok {
			continue
		}
		raw, _ := obj.Lookup("type")
		t, _ := raw.(string)
		switch protocol.ClientMessageType(t) {
		case protocol.ClientMessageTypeJoin:
			msg, ok := decodeJoin(obj)
			if ok {
				_ = h.dispatcher.HandleJoin(c.id, msg)
			}
		case protocol.ClientMessageTypeResumeSession:
			msg, ok := decodeResume(obj)
			if ok {
				_ = h.dispatcher.HandleResume(c.id, msg)
			}
		case protocol.ClientMessageTypeInput:
			msg, ok := decodeInput(obj)
			if ok {
				_ = h.dispatcher.HandleInput(c.id, msg)
			}
		case protocol.ClientMessageTypeChat:
			msg, ok := decodeChat(obj)
			if ok {
				_ = h.dispatcher.HandleChat(c.id, msg)
			}
		case protocol.ClientMessageTypeSnapshotResync:
			msg, ok := decodeSnapshotResync(obj)
			if ok {
				_ = h.dispatcher.HandleSnapshotResync(c.id, msg)
			}
		}
	}
}

// Connection is the per-connection adapter implementing wsapi.Conn.
type Connection struct {
	conn    *websocket.Conn
	id      string
	outbox  chan []byte
	closed  atomic.Bool
	closeCh chan struct{}
}

// Send enqueues a frame for the writer goroutine.
func (c *Connection) Send(payload []byte) error {
	if c.closed.Load() {
		return errors.New("ws: connection closed")
	}
	select {
	case c.outbox <- payload:
		return nil
	default:
		return errors.New("ws: outbox full")
	}
}

// ConnectionID returns the unique id assigned by the handler.
func (c *Connection) ConnectionID() string { return c.id }

func (c *Connection) writeLoop(ctx context.Context) {
	for {
		select {
		case <-ctx.Done():
			return
		case <-c.closeCh:
			return
		case payload := <-c.outbox:
			writeCtx, cancel := context.WithTimeout(ctx, 5*time.Second)
			err := c.conn.Write(writeCtx, websocket.MessageBinary, payload)
			cancel()
			if err != nil {
				return
			}
		}
	}
}

func (c *Connection) pingLoop(ctx context.Context) {
	ticker := time.NewTicker(HeartbeatInterval)
	defer ticker.Stop()
	for {
		select {
		case <-ctx.Done():
			return
		case <-c.closeCh:
			return
		case <-ticker.C:
			pingCtx, cancel := context.WithTimeout(ctx, HeartbeatTimeout)
			err := c.conn.Ping(pingCtx)
			cancel()
			if err != nil {
				return
			}
		}
	}
}

func (c *Connection) close() {
	if c.closed.CompareAndSwap(false, true) {
		close(c.closeCh)
		_ = c.conn.Close(websocket.StatusNormalClosure, "")
	}
}

func decodeJoin(o codec.Object) (protocol.JoinMessage, bool) {
	pv, _ := lookupInt(o, "protocolVersion")
	nick, _ := lookupString(o, "nickname")
	return protocol.JoinMessage{ProtocolVersion: pv, Type: protocol.ClientMessageTypeJoin, Nickname: nick}, true
}

func decodeResume(o codec.Object) (protocol.ResumeSessionMessage, bool) {
	pv, _ := lookupInt(o, "protocolVersion")
	tok, _ := lookupString(o, "sessionToken")
	return protocol.ResumeSessionMessage{ProtocolVersion: pv, Type: protocol.ClientMessageTypeResumeSession, SessionToken: tok}, true
}

func decodeInput(o codec.Object) (protocol.InputMessage, bool) {
	pv, _ := lookupInt(o, "protocolVersion")
	seq, _ := lookupInt(o, "seq")
	up, _ := lookupBool(o, "up")
	dn, _ := lookupBool(o, "down")
	lf, _ := lookupBool(o, "left")
	rt, _ := lookupBool(o, "right")
	at, _ := lookupBool(o, "attack")
	return protocol.InputMessage{
		ProtocolVersion: pv, Type: protocol.ClientMessageTypeInput,
		Seq: seq, Up: up, Down: dn, Left: lf, Right: rt, Attack: at,
	}, true
}

func decodeChat(o codec.Object) (protocol.ChatMessage, bool) {
	pv, _ := lookupInt(o, "protocolVersion")
	txt, _ := lookupString(o, "text")
	return protocol.ChatMessage{ProtocolVersion: pv, Type: protocol.ClientMessageTypeChat, Text: txt}, true
}

func decodeSnapshotResync(o codec.Object) (protocol.SnapshotResyncMessage, bool) {
	pv, _ := lookupInt(o, "protocolVersion")
	reason, _ := lookupString(o, "reason")
	last, _ := lookupInt(o, "lastTick")
	inst, _ := lookupString(o, "instanceId")
	msg := protocol.SnapshotResyncMessage{
		ProtocolVersion: pv,
		Type:            protocol.ClientMessageTypeSnapshotResync,
		Reason:          protocol.SnapshotResyncReason(reason),
		LastTick:        last,
	}
	if inst != "" {
		id := protocol.InstanceID(inst)
		msg.InstanceID = &id
	}
	return msg, true
}

func lookupInt(o codec.Object, key string) (int64, bool) {
	v, ok := o.Lookup(key)
	if !ok {
		return 0, false
	}
	switch x := v.(type) {
	case int64:
		return x, true
	case uint64:
		return int64(x), true
	case int:
		return int64(x), true
	case float64:
		return int64(x), true
	}
	return 0, false
}

func lookupString(o codec.Object, key string) (string, bool) {
	v, ok := o.Lookup(key)
	if !ok {
		return "", false
	}
	s, ok := v.(string)
	return s, ok
}

func lookupBool(o codec.Object, key string) (bool, bool) {
	v, ok := o.Lookup(key)
	if !ok {
		return false, false
	}
	b, ok := v.(bool)
	return b, ok
}
