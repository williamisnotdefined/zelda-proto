package session

import (
	"errors"
	"strconv"
	"sync"
	"sync/atomic"
	"testing"
	"time"
)

type fakeGenerator struct {
	counter atomic.Int64
	failErr error
}

func (g *fakeGenerator) NewSessionToken() (string, error) {
	if g.failErr != nil {
		return "", g.failErr
	}
	return "token-" + strconv.FormatInt(g.counter.Add(1), 10), nil
}

type fakeClock struct {
	mu  sync.Mutex
	now time.Time
}

func (c *fakeClock) Now() time.Time {
	c.mu.Lock()
	defer c.mu.Unlock()
	return c.now
}

func (c *fakeClock) Advance(d time.Duration) {
	c.mu.Lock()
	defer c.mu.Unlock()
	c.now = c.now.Add(d)
}

func newManager(t *testing.T) (*Manager, *fakeGenerator, *fakeClock) {
	t.Helper()
	gen := &fakeGenerator{}
	clock := &fakeClock{now: time.Date(2026, 1, 1, 0, 0, 0, 0, time.UTC)}
	mgr := NewManager(Options{
		ResumeTTL:      time.Second,
		Clock:          clock.Now,
		TokenGenerator: gen,
	})
	return mgr, gen, clock
}

func TestCreateSessionIssuesUniqueTokens(t *testing.T) {
	t.Parallel()

	mgr, _, _ := newManager(t)
	r1, err := mgr.CreateSession("p1", "Link")
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	r2, err := mgr.CreateSession("p2", "Zelda")
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if r1.Token == r2.Token {
		t.Fatal("expected distinct tokens")
	}
}

func TestCreateSessionReusesExistingToken(t *testing.T) {
	t.Parallel()

	mgr, _, _ := newManager(t)
	r1, _ := mgr.CreateSession("p1", "Link")
	r2, err := mgr.CreateSession("p1", "LinkTwo")
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if r1.Token != r2.Token {
		t.Fatalf("expected same token, got %q vs %q", r1.Token, r2.Token)
	}
	if r2.Nickname != "LinkTwo" {
		t.Fatalf("expected nickname updated, got %q", r2.Nickname)
	}
}

func TestCreateSessionPropagatesGeneratorError(t *testing.T) {
	t.Parallel()

	gen := &fakeGenerator{failErr: errors.New("nope")}
	mgr := NewManager(Options{TokenGenerator: gen})
	if _, err := mgr.CreateSession("p1", "Link"); err == nil {
		t.Fatal("expected error")
	}
}

func TestCreateSessionWithoutGeneratorErrors(t *testing.T) {
	t.Parallel()

	mgr := NewManager(Options{})
	if _, err := mgr.CreateSession("p1", "Link"); err == nil {
		t.Fatal("expected configuration error")
	}
}

func TestMarkConnectedAndDisconnectedRoundTrip(t *testing.T) {
	t.Parallel()

	mgr, _, _ := newManager(t)
	if _, err := mgr.MarkConnected("ghost"); !errors.Is(err, ErrUnknownPlayer) {
		t.Fatalf("expected ErrUnknownPlayer, got %v", err)
	}

	mgr.CreateSession("p1", "Link")
	if _, err := mgr.MarkDisconnected("p1"); err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if _, err := mgr.MarkConnected("p1"); err != nil {
		t.Fatalf("expected reattach to succeed, got %v", err)
	}
}

func TestTryResumeSucceedsAfterDisconnect(t *testing.T) {
	t.Parallel()

	mgr, _, _ := newManager(t)
	rec, _ := mgr.CreateSession("p1", "Link")
	mgr.MarkDisconnected("p1")

	result := mgr.TryResume(rec.Token)
	if !result.OK || result.Record.PlayerID != "p1" {
		t.Fatalf("expected resume to succeed, got %+v", result)
	}

	again := mgr.TryResume(rec.Token)
	if again.OK || again.Reason != RejectSessionInUse {
		t.Fatalf("expected SessionInUse on second attempt, got %+v", again)
	}
}

func TestTryResumeRejectsUnknownToken(t *testing.T) {
	t.Parallel()

	mgr, _, _ := newManager(t)
	result := mgr.TryResume("missing")
	if result.OK || result.Reason != RejectInvalidSession {
		t.Fatalf("expected InvalidSession, got %+v", result)
	}
}

func TestTickPurgesExpiredSessionsAndFiresCallback(t *testing.T) {
	t.Parallel()

	gen := &fakeGenerator{}
	clock := &fakeClock{now: time.Date(2026, 1, 1, 0, 0, 0, 0, time.UTC)}
	expired := make(chan string, 1)
	mgr := NewManager(Options{
		ResumeTTL:      500 * time.Millisecond,
		Clock:          clock.Now,
		TokenGenerator: gen,
		OnExpired:      func(playerID string) { expired <- playerID },
	})

	rec, _ := mgr.CreateSession("p1", "Link")
	mgr.MarkDisconnected("p1")

	clock.Advance(time.Second)
	mgr.Tick()

	select {
	case got := <-expired:
		if got != "p1" {
			t.Fatalf("expected p1 expired, got %q", got)
		}
	default:
		t.Fatal("expected expiry callback")
	}

	if result := mgr.TryResume(rec.Token); result.OK {
		t.Fatal("expected expired session to no longer resume")
	}
}

func TestInvalidatePlayerRemovesSession(t *testing.T) {
	t.Parallel()

	mgr, _, _ := newManager(t)
	rec, _ := mgr.CreateSession("p1", "Link")
	mgr.InvalidatePlayer("p1")
	mgr.InvalidatePlayer("missing") // no-op

	if result := mgr.TryResume(rec.Token); result.OK {
		t.Fatal("expected token to be invalidated")
	}
	if _, ok := mgr.Token("p1"); ok {
		t.Fatal("expected no token after invalidation")
	}
}

func TestShutdownClearsAllSessionsWithoutCallback(t *testing.T) {
	t.Parallel()

	expired := make(chan string, 1)
	clock := &fakeClock{now: time.Now()}
	mgr := NewManager(Options{
		ResumeTTL:      time.Second,
		Clock:          clock.Now,
		TokenGenerator: &fakeGenerator{},
		OnExpired:      func(p string) { expired <- p },
	})

	mgr.CreateSession("p1", "Link")
	mgr.MarkDisconnected("p1")
	mgr.Shutdown()

	if _, ok := mgr.Token("p1"); ok {
		t.Fatal("expected sessions to be cleared")
	}
	select {
	case <-expired:
		t.Fatal("expected no expiry callback during shutdown")
	default:
	}
}

func TestDefaultResumeTTLIsApplied(t *testing.T) {
	t.Parallel()

	mgr := NewManager(Options{TokenGenerator: &fakeGenerator{}})
	if mgr.resumeTTL != DefaultResumeTTL {
		t.Fatalf("expected default TTL, got %s", mgr.resumeTTL)
	}
}

func TestTokenLookupForUnknownPlayer(t *testing.T) {
	t.Parallel()

	mgr, _, _ := newManager(t)
	if _, ok := mgr.Token("ghost"); ok {
		t.Fatal("expected no token for unknown player")
	}
}
