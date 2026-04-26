package wsapi

import (
	"strconv"
	"sync"
	"sync/atomic"
	"testing"
	"time"

	appinst "github.com/williamisnotdefined/zelda-proto/server_go/internal/application/instance"
	appsess "github.com/williamisnotdefined/zelda-proto/server_go/internal/application/session"
	domworld "github.com/williamisnotdefined/zelda-proto/server_go/internal/domain/world"
	"github.com/williamisnotdefined/zelda-proto/server_go/internal/protocol"
)

type counterIDs struct{ n atomic.Int64 }

func (c *counterIDs) NewID(prefix string) string {
	return prefix + "_" + strconv.FormatInt(c.n.Add(1), 10)
}
func (c *counterIDs) NewPlayerID() string { return "player_" + strconv.FormatInt(c.n.Add(1), 10) }

type tokenGen struct{ n atomic.Int64 }

func (g *tokenGen) NewSessionToken() (string, error) {
	return "tok_" + strconv.FormatInt(g.n.Add(1), 10), nil
}

type fakeConn struct {
	id   string
	mu   sync.Mutex
	sent [][]byte
}

func (c *fakeConn) Send(p []byte) error {
	c.mu.Lock()
	c.sent = append(c.sent, append([]byte(nil), p...))
	c.mu.Unlock()
	return nil
}
func (c *fakeConn) ConnectionID() string { return c.id }
func (c *fakeConn) snapshot() [][]byte {
	c.mu.Lock()
	defer c.mu.Unlock()
	out := make([][]byte, len(c.sent))
	copy(out, c.sent)
	return out
}

func newDispatcher(t *testing.T) (*Dispatcher, *appinst.Manager, *fakeConn) {
	t.Helper()
	ids := &counterIDs{}
	manager := appinst.New(appinst.Config{IDs: ids, StartPhase: domworld.InstancePhase1})
	sessions := appsess.NewManager(appsess.Options{TokenGenerator: &tokenGen{}})
	d := NewDispatcher(manager, sessions, ids, func() time.Time { return time.Unix(0, 0) })
	conn := &fakeConn{id: "c1"}
	d.Register(conn)
	return d, manager, conn
}

func TestJoinSendsWelcome(t *testing.T) {
	t.Parallel()

	d, _, conn := newDispatcher(t)
	if err := d.HandleJoin("c1", protocol.JoinMessage{Nickname: "Link"}); err != nil {
		t.Fatal(err)
	}
	if len(conn.snapshot()) != 1 {
		t.Fatalf("expected 1 reply, got %d", len(conn.snapshot()))
	}
}

func TestResumeRejectsUnknown(t *testing.T) {
	t.Parallel()

	d, _, conn := newDispatcher(t)
	if err := d.HandleResume("c1", protocol.ResumeSessionMessage{SessionToken: "ghost"}); err != nil {
		t.Fatal(err)
	}
	if len(conn.snapshot()) != 1 {
		t.Fatal("expected resume_rejected")
	}
}

func TestInputBeforeJoinFails(t *testing.T) {
	t.Parallel()

	d, _, _ := newDispatcher(t)
	err := d.HandleInput("c1", protocol.InputMessage{Seq: 1, Right: true})
	if err != ErrNotJoined {
		t.Fatalf("expected ErrNotJoined, got %v", err)
	}
}

func TestChatBroadcastsToAll(t *testing.T) {
	t.Parallel()

	d, _, conn := newDispatcher(t)
	if err := d.HandleJoin("c1", protocol.JoinMessage{Nickname: "Link"}); err != nil {
		t.Fatal(err)
	}
	if err := d.HandleChat("c1", protocol.ChatMessage{Text: "hello"}); err != nil {
		t.Fatal(err)
	}
	// welcome + chat = 2
	if len(conn.snapshot()) < 2 {
		t.Fatalf("expected ≥2 messages, got %d", len(conn.snapshot()))
	}
}

func TestBroadcastSendsSnapshot(t *testing.T) {
	t.Parallel()

	d, _, conn := newDispatcher(t)
	if err := d.HandleJoin("c1", protocol.JoinMessage{Nickname: "Link"}); err != nil {
		t.Fatal(err)
	}
	d.Sim(20 * time.Millisecond)
	d.Broadcast()
	if len(conn.snapshot()) < 2 {
		t.Fatal("expected snapshot in addition to welcome")
	}
}

func TestPublishLeaderboardWorks(t *testing.T) {
	t.Parallel()

	d, _, conn := newDispatcher(t)
	if err := d.HandleJoin("c1", protocol.JoinMessage{Nickname: "Link"}); err != nil {
		t.Fatal(err)
	}
	d.PublishLeaderboard()
	if len(conn.snapshot()) < 2 {
		t.Fatal("expected leaderboard message")
	}
}

func TestDisconnectCleansUp(t *testing.T) {
	t.Parallel()

	d, _, _ := newDispatcher(t)
	if err := d.HandleJoin("c1", protocol.JoinMessage{Nickname: "Link"}); err != nil {
		t.Fatal(err)
	}
	d.Disconnect("c1")
	d.Disconnect("ghost")
}
