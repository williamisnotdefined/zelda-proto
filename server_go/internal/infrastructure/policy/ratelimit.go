package policy

import (
	"sync"
	"time"
)

// Clock returns the current time. It is abstracted to enable deterministic
// tests of the rate-limiting state machine.
type Clock func() time.Time

// FixedWindowLimiter implements the legacy server's per-connection rate-limit
// semantics: independent counters per category that reset every windowDuration.
type FixedWindowLimiter struct {
	windowDuration time.Duration
	limits         map[string]int
	clock          Clock

	mu          sync.Mutex
	windowStart time.Time
	counters    map[string]int
}

// NewFixedWindowLimiter returns a limiter where each category has its own
// integer ceiling per windowDuration. When clock is nil time.Now is used.
func NewFixedWindowLimiter(windowDuration time.Duration, limits map[string]int, clock Clock) *FixedWindowLimiter {
	if clock == nil {
		clock = time.Now
	}
	copied := make(map[string]int, len(limits))
	for category, limit := range limits {
		copied[category] = limit
	}
	return &FixedWindowLimiter{
		windowDuration: windowDuration,
		limits:         copied,
		clock:          clock,
		counters:       make(map[string]int, len(copied)),
	}
}

// Allow records one event in the given category and returns whether the
// caller is still under its quota. Unknown categories are always allowed.
func (l *FixedWindowLimiter) Allow(category string) bool {
	limit, exists := l.limits[category]
	if !exists {
		return true
	}

	l.mu.Lock()
	defer l.mu.Unlock()

	now := l.clock()
	if l.windowStart.IsZero() || now.Sub(l.windowStart) > l.windowDuration {
		l.windowStart = now
		for key := range l.counters {
			l.counters[key] = 0
		}
	}

	l.counters[category] += 1
	return l.counters[category] <= limit
}

// IPConnectionTracker bounds concurrent connections per remote IP and globally.
type IPConnectionTracker struct {
	maxGlobal int
	maxPerIP  int

	mu      sync.Mutex
	total   int
	perIP   map[string]int
}

// NewIPConnectionTracker returns a tracker enforcing the given limits.
func NewIPConnectionTracker(maxGlobal int, maxPerIP int) *IPConnectionTracker {
	return &IPConnectionTracker{
		maxGlobal: maxGlobal,
		maxPerIP:  maxPerIP,
		perIP:     make(map[string]int),
	}
}

// Acquire reserves a connection slot for ip. The returned bool reports whether
// the reservation succeeded; the caller must invoke Release on success.
func (t *IPConnectionTracker) Acquire(ip string) bool {
	t.mu.Lock()
	defer t.mu.Unlock()

	if t.total >= t.maxGlobal {
		return false
	}
	if t.perIP[ip] >= t.maxPerIP {
		return false
	}

	t.total += 1
	t.perIP[ip] += 1
	return true
}

// Release returns a previously acquired slot. Calls beyond the acquired count
// are no-ops to keep counters stable when callers double-release.
func (t *IPConnectionTracker) Release(ip string) {
	t.mu.Lock()
	defer t.mu.Unlock()

	count, exists := t.perIP[ip]
	if !exists || count == 0 {
		return
	}

	if t.total > 0 {
		t.total -= 1
	}

	if count <= 1 {
		delete(t.perIP, ip)
	} else {
		t.perIP[ip] = count - 1
	}
}

// Total returns the current concurrent connection count.
func (t *IPConnectionTracker) Total() int {
	t.mu.Lock()
	defer t.mu.Unlock()
	return t.total
}

// Count returns the current connections held by ip.
func (t *IPConnectionTracker) Count(ip string) int {
	t.mu.Lock()
	defer t.mu.Unlock()
	return t.perIP[ip]
}
