package loop

// Package loop drives the application-layer simulation, network and
// leaderboard cadences using a fixed-timestep approach. The clock is
// injected so deterministic tests can advance time discretely.

import (
	"context"
	"sync"
	"time"
)

// Clock is the abstraction the loop uses to read wall time. The standard
// implementation is RealClock; tests may use FakeClock.
type Clock interface {
	Now() time.Time
	NewTicker(d time.Duration) Ticker
}

// Ticker mirrors time.Ticker.
type Ticker interface {
	C() <-chan time.Time
	Stop()
}

// RealClock wraps the stdlib time package.
type RealClock struct{}

// Now returns time.Now().
func (RealClock) Now() time.Time { return time.Now() }

// NewTicker wraps time.NewTicker.
func (RealClock) NewTicker(d time.Duration) Ticker { return realTicker{time.NewTicker(d)} }

type realTicker struct{ t *time.Ticker }

func (r realTicker) C() <-chan time.Time { return r.t.C }
func (r realTicker) Stop()                { r.t.Stop() }

// Tickable is what the loop drives. It receives the elapsed dt for sim,
// network broadcast and leaderboard cadences respectively.
type Tickable interface {
	Sim(dt time.Duration)
	Broadcast()
	PublishLeaderboard()
}

// Loop multiplexes three cadences: 60 Hz sim, 20 Hz net, 1 Hz leaderboard.
type Loop struct {
	clock           Clock
	target          Tickable
	simInterval     time.Duration
	netInterval     time.Duration
	leaderInterval  time.Duration
}

// Config controls Loop construction.
type Config struct {
	Clock              Clock
	Target             Tickable
	SimInterval        time.Duration
	NetInterval        time.Duration
	LeaderboardInterval time.Duration
}

// DefaultConfig returns a Config with stdlib clock and the canonical 60/20/1
// Hz cadences.
func DefaultConfig(target Tickable) Config {
	return Config{
		Clock:               RealClock{},
		Target:              target,
		SimInterval:         time.Second / 60,
		NetInterval:         time.Second / 20,
		LeaderboardInterval: time.Second,
	}
}

// New constructs a Loop. Defaults are filled when fields are zero.
func New(cfg Config) *Loop {
	if cfg.Clock == nil {
		cfg.Clock = RealClock{}
	}
	if cfg.SimInterval <= 0 {
		cfg.SimInterval = time.Second / 60
	}
	if cfg.NetInterval <= 0 {
		cfg.NetInterval = time.Second / 20
	}
	if cfg.LeaderboardInterval <= 0 {
		cfg.LeaderboardInterval = time.Second
	}
	return &Loop{
		clock:          cfg.Clock,
		target:         cfg.Target,
		simInterval:    cfg.SimInterval,
		netInterval:    cfg.NetInterval,
		leaderInterval: cfg.LeaderboardInterval,
	}
}

// Run drives the loop until ctx is cancelled.
func (l *Loop) Run(ctx context.Context) {
	simTicker := l.clock.NewTicker(l.simInterval)
	netTicker := l.clock.NewTicker(l.netInterval)
	leaderTicker := l.clock.NewTicker(l.leaderInterval)
	defer simTicker.Stop()
	defer netTicker.Stop()
	defer leaderTicker.Stop()

	last := l.clock.Now()
	for {
		select {
		case <-ctx.Done():
			return
		case t := <-simTicker.C():
			dt := t.Sub(last)
			last = t
			if dt > 250*time.Millisecond {
				dt = 250 * time.Millisecond
			}
			l.target.Sim(dt)
		case <-netTicker.C():
			l.target.Broadcast()
		case <-leaderTicker.C():
			l.target.PublishLeaderboard()
		}
	}
}

// FakeClock is a manual-control clock for tests.
type FakeClock struct {
	mu   sync.Mutex
	now  time.Time
	tickers []*fakeTicker
}

// NewFakeClock returns a FakeClock starting at time 0.
func NewFakeClock(start time.Time) *FakeClock { return &FakeClock{now: start} }

// Now returns the fake current time.
func (c *FakeClock) Now() time.Time {
	c.mu.Lock()
	defer c.mu.Unlock()
	return c.now
}

// NewTicker registers a fake ticker driven by Advance.
func (c *FakeClock) NewTicker(d time.Duration) Ticker {
	c.mu.Lock()
	defer c.mu.Unlock()
	t := &fakeTicker{ch: make(chan time.Time, 1024), interval: d, next: c.now.Add(d)}
	c.tickers = append(c.tickers, t)
	return t
}

// Advance pushes the fake clock forward by d, firing all due tickers.
func (c *FakeClock) Advance(d time.Duration) {
	c.mu.Lock()
	c.now = c.now.Add(d)
	now := c.now
	tickers := append([]*fakeTicker(nil), c.tickers...)
	c.mu.Unlock()
	for _, t := range tickers {
		for !t.next.After(now) && !t.stopped {
			select {
			case t.ch <- t.next:
			default:
			}
			t.next = t.next.Add(t.interval)
		}
	}
}

type fakeTicker struct {
	ch       chan time.Time
	interval time.Duration
	next     time.Time
	stopped  bool
}

func (t *fakeTicker) C() <-chan time.Time { return t.ch }
func (t *fakeTicker) Stop()                { t.stopped = true }
