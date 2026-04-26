package loop

import (
	"context"
	"sync"
	"sync/atomic"
	"testing"
	"time"
)

type spyTarget struct {
	mu                       sync.Mutex
	sim, broadcast, leaders  int
	lastDT                   time.Duration
}

func (s *spyTarget) Sim(dt time.Duration) {
	s.mu.Lock()
	s.sim++
	s.lastDT = dt
	s.mu.Unlock()
}
func (s *spyTarget) Broadcast() {
	s.mu.Lock()
	s.broadcast++
	s.mu.Unlock()
}
func (s *spyTarget) PublishLeaderboard() {
	s.mu.Lock()
	s.leaders++
	s.mu.Unlock()
}

func TestLoopFiresAllCadences(t *testing.T) {
	t.Parallel()

	clock := NewFakeClock(time.Unix(0, 0))
	target := &spyTarget{}
	l := New(Config{
		Clock:               clock,
		Target:              target,
		SimInterval:         100 * time.Millisecond,
		NetInterval:         200 * time.Millisecond,
		LeaderboardInterval: 1000 * time.Millisecond,
	})

	ctx, cancel := context.WithCancel(context.Background())
	done := make(chan struct{})
	go func() {
		l.Run(ctx)
		close(done)
	}()
	// Allow loop to install tickers.
	time.Sleep(20 * time.Millisecond)

	clock.Advance(1100 * time.Millisecond)
	// Allow loop to drain.
	time.Sleep(50 * time.Millisecond)
	cancel()
	<-done

	target.mu.Lock()
	defer target.mu.Unlock()
	if target.sim < 10 {
		t.Errorf("expected ≥10 sim ticks, got %d", target.sim)
	}
	if target.broadcast < 5 {
		t.Errorf("expected ≥5 broadcasts, got %d", target.broadcast)
	}
	if target.leaders < 1 {
		t.Errorf("expected ≥1 leaderboard tick, got %d", target.leaders)
	}
}

func TestLoopClampsLargeDT(t *testing.T) {
	t.Parallel()

	clock := NewFakeClock(time.Unix(0, 0))
	target := &spyTarget{}
	l := New(Config{
		Clock:       clock,
		Target:      target,
		SimInterval: 5 * time.Second, // way past clamp
	})
	ctx, cancel := context.WithCancel(context.Background())
	done := make(chan struct{})
	go func() {
		l.Run(ctx)
		close(done)
	}()
	time.Sleep(20 * time.Millisecond)
	clock.Advance(5 * time.Second)
	time.Sleep(20 * time.Millisecond)
	cancel()
	<-done

	target.mu.Lock()
	defer target.mu.Unlock()
	if target.lastDT > 250*time.Millisecond {
		t.Fatalf("dt should be clamped, got %v", target.lastDT)
	}
}

type stopCounter struct{ stopped atomic.Bool }

func (s *stopCounter) Sim(time.Duration)    {}
func (s *stopCounter) Broadcast()           {}
func (s *stopCounter) PublishLeaderboard()  {}

func TestRealClockTickerStops(t *testing.T) {
	t.Parallel()

	tk := RealClock{}.NewTicker(time.Millisecond)
	tk.Stop()
	// Ensure channel exists.
	_ = tk.C()
}

func TestDefaultConfig(t *testing.T) {
	t.Parallel()

	cfg := DefaultConfig(&stopCounter{})
	if cfg.SimInterval == 0 || cfg.NetInterval == 0 || cfg.LeaderboardInterval == 0 {
		t.Fatal("expected all intervals set")
	}
}
