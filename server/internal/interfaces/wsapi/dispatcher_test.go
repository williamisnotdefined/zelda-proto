package wsapi

import (
	"strconv"
	"sync"
	"sync/atomic"
	"testing"
	"time"

	appinst "github.com/williamisnotdefined/zelda-proto/server/internal/application/instance"
	appsess "github.com/williamisnotdefined/zelda-proto/server/internal/application/session"
	appworld "github.com/williamisnotdefined/zelda-proto/server/internal/application/world"
	bossdom "github.com/williamisnotdefined/zelda-proto/server/internal/domain/boss"
	"github.com/williamisnotdefined/zelda-proto/server/internal/domain/hazard"
	"github.com/williamisnotdefined/zelda-proto/server/internal/domain/portal"
	domworld "github.com/williamisnotdefined/zelda-proto/server/internal/domain/world"
	"github.com/williamisnotdefined/zelda-proto/server/internal/protocol"
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

func TestDisconnectSuspendsPlayer(t *testing.T) {
	t.Parallel()

	d, mgr, _ := newDispatcher(t)
	if err := d.HandleJoin("c1", protocol.JoinMessage{Nickname: "Link"}); err != nil {
		t.Fatal(err)
	}
	playerID := d.connections["c1"].playerID
	loc, _ := mgr.LocationOf(playerID)
	w := mgr.World(loc)
	startX := w.Players()[playerID].X
	if err := d.HandleInput("c1", protocol.InputMessage{Seq: 1, Right: true}); err != nil {
		t.Fatal(err)
	}
	d.Disconnect("c1")
	d.Sim(time.Second)
	p := w.Players()[playerID]
	if p == nil {
		t.Fatal("expected disconnected player to remain resumable in world")
	}
	if p.X != startX {
		t.Fatalf("expected suspended player to stop moving after disconnect, x %.1f -> %.1f", startX, p.X)
	}
	if string(p.State) != "idle" {
		t.Fatalf("expected suspended player to be idle, got %q", p.State)
	}
}

func TestChatBroadcastsOnlyWithinInstance(t *testing.T) {
	t.Parallel()

	d, mgr, conn1 := newDispatcher(t)
	conn2 := &fakeConn{id: "c2"}
	d.Register(conn2)
	if err := d.HandleJoin("c1", protocol.JoinMessage{Nickname: "Link"}); err != nil {
		t.Fatal(err)
	}
	if err := d.HandleJoin("c2", protocol.JoinMessage{Nickname: "Zelda"}); err != nil {
		t.Fatal(err)
	}
	player2ID := d.connections["c2"].playerID
	w := mgr.World(domworld.InstancePhase1)
	p2 := w.Players()[player2ID]
	p2.SafeZoneTimer = 0
	p2.X, p2.Y = 500, 500
	w.SpawnPortal(&portal.Portal{
		ID: "pt", X: 500, Y: 500, Kind: portal.Phase1ToPhase2,
		ToInstance: domworld.InstancePhase2,
		TargetX:    100, TargetY: 100,
	})
	d.Sim(20 * time.Millisecond)
	if loc, _ := mgr.LocationOf(player2ID); loc != domworld.InstancePhase2 {
		t.Fatalf("expected second player transferred to phase2, got %s", loc)
	}

	before1 := len(conn1.snapshot())
	before2 := len(conn2.snapshot())
	if err := d.HandleChat("c1", protocol.ChatMessage{Text: "hello"}); err != nil {
		t.Fatal(err)
	}
	if got := len(conn1.snapshot()); got != before1+1 {
		t.Fatalf("expected sender instance to receive chat, got frames %d -> %d", before1, got)
	}
	if got := len(conn2.snapshot()); got != before2 {
		t.Fatalf("expected other instance to miss chat, got frames %d -> %d", before2, got)
	}
}

func TestSessionExpiryRemovesPlayerAfterResumeTTL(t *testing.T) {
	t.Parallel()

	now := time.Unix(0, 0)
	ids := &counterIDs{}
	manager := appinst.New(appinst.Config{IDs: ids, StartPhase: domworld.InstancePhase1})
	sessions := appsess.NewManager(appsess.Options{
		ResumeTTL:      20 * time.Second,
		Clock:          func() time.Time { return now },
		TokenGenerator: &tokenGen{},
	})
	d := NewDispatcher(manager, sessions, ids, func() time.Time { return now })
	sessions.SetExpiryHandler(func(playerID string) { d.HandleSessionExpired(playerID) })
	conn := &fakeConn{id: "c1"}
	d.Register(conn)
	if err := d.HandleJoin("c1", protocol.JoinMessage{Nickname: "Link"}); err != nil {
		t.Fatal(err)
	}
	playerID := d.connections["c1"].playerID
	d.Disconnect("c1")

	now = now.Add(20*time.Second + time.Millisecond)
	d.Sim(0)
	if _, ok := manager.LocationOf(playerID); ok {
		t.Fatal("expected expired session player removed from manager")
	}
}

func TestAOEIndicatorWireUsesTimerField(t *testing.T) {
	t.Parallel()

	obj := aoeIndicatorObj(bossdom.AOEIndicator{OwnerID: "g1", X: 1, Y: 2, Radius: 80, Timer: 123 * time.Millisecond})
	if _, ok := obj.Lookup("timer"); !ok {
		t.Fatal("expected timer field on AOE indicator wire object")
	}
	if _, ok := obj.Lookup("remainingMs"); ok {
		t.Fatal("did not expect remainingMs field on AOE indicator wire object")
	}
}

func TestBossWireIncludesOptionalSpeechFields(t *testing.T) {
	t.Parallel()

	obj := bossObj(appworld.BossSnapshot{
		Snapshot:    bossdom.Snapshot{ID: "v1", Kind: bossdom.KindVanessaTheRuthless},
		SpeechText:  "hello",
		SpeechColor: "#ff0000",
		HasSpeech:   true,
	})
	if v, ok := obj.Lookup("speechText"); !ok || v != "hello" {
		t.Fatalf("expected speechText on boss wire object, got %v ok=%v", v, ok)
	}
	if v, ok := obj.Lookup("speechColor"); !ok || v != "#ff0000" {
		t.Fatalf("expected speechColor on boss wire object, got %v ok=%v", v, ok)
	}
}

func TestHazardWireOmitsZeroTintAndIncludesNonZeroTint(t *testing.T) {
	t.Parallel()

	plain := hazardObj(hazard.Snapshot{ID: "h1", Kind: hazard.KindFireField})
	if _, ok := plain.Lookup("tint"); ok {
		t.Fatal("did not expect tint field for zero tint")
	}

	tinted := hazardObj(hazard.Snapshot{ID: "h2", Kind: hazard.KindFireField, Tint: 0xff8844})
	if v, ok := tinted.Lookup("tint"); !ok || v != int64(0xff8844) {
		t.Fatalf("expected tint field on tinted hazard wire object, got %v ok=%v", v, ok)
	}

	fireball := hazardObj(hazard.Snapshot{ID: "h3", Kind: hazard.KindFireball, Direction: domworld.DirectionLeft})
	if v, ok := fireball.Lookup("direction"); !ok || v != string(domworld.DirectionLeft) {
		t.Fatalf("expected direction field on fireball wire object, got %v ok=%v", v, ok)
	}
}
