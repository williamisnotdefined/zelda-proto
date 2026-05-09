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

	"github.com/williamisnotdefined/zelda-proto/server/internal/codec"
	"github.com/williamisnotdefined/zelda-proto/server/internal/infrastructure/policy"
	"github.com/williamisnotdefined/zelda-proto/server/internal/interfaces/wsapi"
	"github.com/williamisnotdefined/zelda-proto/server/internal/protocol"
	"nhooyr.io/websocket"
)

// Constants define the transport safety budgets.
const (
	ReadLimit           = 1024
	HeartbeatInterval   = 25 * time.Second
	HeartbeatTimeout    = 35 * time.Second
	JoinTimeout         = 5 * time.Second
	RateWindow          = time.Second
	MaxConnections      = 200
	MaxConnectionsPerIP = 12
	InputRateLimit      = 65
	MaxRateViolations   = 15
	MaxInvalidMessages  = 8
)

// ConnectionIDFactory mints unique connection ids.
type ConnectionIDFactory interface {
	NewConnectionID() string
}

// OriginValidator returns true when the request origin is allowed.
type OriginValidator interface {
	Allow(req *http.Request) bool
}

// IPExtractor determines the client IP for connection-level policy checks.
type IPExtractor interface {
	Extract(req *http.Request) string
}

// Handler is the http.Handler that upgrades to WebSocket and pumps frames.
type Handler struct {
	dispatcher  *wsapi.Dispatcher
	ids         ConnectionIDFactory
	origins     OriginValidator
	ips         IPExtractor
	connections *policy.IPConnectionTracker
	now         func() time.Time
}

// NewHandler constructs the handler.
func NewHandler(dispatcher *wsapi.Dispatcher, ids ConnectionIDFactory, origins OriginValidator, ips IPExtractor, now func() time.Time) *Handler {
	if now == nil {
		now = time.Now
	}
	return &Handler{
		dispatcher:  dispatcher,
		ids:         ids,
		origins:     origins,
		ips:         ips,
		connections: policy.NewIPConnectionTracker(MaxConnections, MaxConnectionsPerIP),
		now:         now,
	}
}

// ServeHTTP upgrades the request and runs the per-connection loop.
func (h *Handler) ServeHTTP(w http.ResponseWriter, r *http.Request) {
	if h.origins != nil && !h.origins.Allow(r) {
		http.Error(w, "forbidden", http.StatusForbidden)
		return
	}

	ip := "unknown"
	if h.ips != nil {
		ip = h.ips.Extract(r)
	}
	if h.connections != nil && !h.connections.Acquire(ip) {
		if h.connections.Count(ip) >= MaxConnectionsPerIP {
			http.Error(w, "too many connections from IP", http.StatusForbidden)
			return
		}
		http.Error(w, "server full", http.StatusServiceUnavailable)
		return
	}
	defer func() {
		if h.connections != nil {
			h.connections.Release(ip)
		}
	}()

	conn, err := websocket.Accept(w, r, &websocket.AcceptOptions{
		// Origin policy is enforced above so the websocket library should not
		// apply its own Host-vs-Origin check, which breaks proxied production
		// traffic where the origin host differs from the local upstream host.
		InsecureSkipVerify: true,
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
	go h.enforceJoinTimeout(ctx, c)

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
	rateWindowStart := h.now()
	inputCount := 0
	rateViolations := 0
	invalidMessages := 0

	resetWindow := func(now time.Time) {
		if now.Sub(rateWindowStart) <= RateWindow {
			return
		}
		inputCount = 0
		rateViolations = 0
		invalidMessages = 0
		rateWindowStart = now
	}
	registerInvalidMessage := func() bool {
		invalidMessages += 1
		if invalidMessages > MaxInvalidMessages {
			c.closeWithStatus(websocket.StatusPolicyViolation, "Too many invalid messages")
			return false
		}
		return true
	}
	registerRateViolation := func() bool {
		rateViolations += 1
		if rateViolations > MaxRateViolations {
			c.closeWithStatus(websocket.StatusPolicyViolation, "Rate limit exceeded")
			return false
		}
		return true
	}

	for {
		typ, data, err := c.conn.Read(ctx)
		if err != nil {
			return
		}
		resetWindow(h.now())
		if typ != websocket.MessageBinary {
			continue
		}
		decoded, err := codec.Decode(data)
		if err != nil {
			if !registerInvalidMessage() {
				return
			}
			continue
		}
		validation := protocol.ValidateClientMessage(decoded, h.dispatcher.HasJoined(c.id))
		if !validation.OK {
			if validation.Reason == protocol.ValidationFailureReasonProtocolMismatch {
				c.closeWithStatus(websocket.StatusProtocolError, "Protocol version mismatch")
				return
			}
			if !registerInvalidMessage() {
				return
			}
			continue
		}
		switch msg := validation.Message.(type) {
		case protocol.JoinMessage:
			if err := h.dispatcher.HandleJoin(c.id, msg); err != nil && !registerInvalidMessage() {
				return
			}
		case protocol.ResumeSessionMessage:
			if err := h.dispatcher.HandleResume(c.id, msg); err != nil && !registerInvalidMessage() {
				return
			}
		case protocol.InputMessage:
			inputCount += 1
			if inputCount > InputRateLimit {
				if !registerRateViolation() {
					return
				}
				continue
			}
			if err := h.dispatcher.HandleInput(c.id, msg); err != nil && !registerInvalidMessage() {
				return
			}
		case protocol.SnapshotResyncMessage:
			if err := h.dispatcher.HandleSnapshotResync(c.id, msg); err != nil && !registerInvalidMessage() {
				return
			}
		}
	}
}

func (h *Handler) enforceJoinTimeout(ctx context.Context, c *Connection) {
	timer := time.NewTimer(JoinTimeout)
	defer timer.Stop()
	select {
	case <-ctx.Done():
		return
	case <-timer.C:
		if !h.dispatcher.HasJoined(c.id) {
			c.closeWithStatus(websocket.StatusPolicyViolation, "Join timeout")
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
	c.closeWithStatus(websocket.StatusNormalClosure, "")
}

func (c *Connection) closeWithStatus(code websocket.StatusCode, reason string) {
	if c.closed.CompareAndSwap(false, true) {
		close(c.closeCh)
		_ = c.conn.Close(code, reason)
	}
}
