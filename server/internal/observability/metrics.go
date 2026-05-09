package observability

import (
	"sync/atomic"
	"time"
)

// RuntimeMetrics stores lightweight process-local counters for the game loop
// and websocket transport. It is intentionally dependency-free and lock-free.
type RuntimeMetrics struct {
	activeConnections atomic.Int64
	totalConnections  atomic.Int64
	slowConsumers     atomic.Int64

	simTicks       atomic.Int64
	simNanos       atomic.Int64
	broadcasts     atomic.Int64
	broadcastNanos atomic.Int64
	leaderboards   atomic.Int64
	leaderNanos    atomic.Int64

	snapshotFull  atomic.Int64
	snapshotDelta atomic.Int64
	payloads      atomic.Int64
	payloadBytes  atomic.Int64
}

// Snapshot is the JSON-friendly projection returned by the debug endpoint.
type Snapshot struct {
	ActiveConnections int64 `json:"activeConnections"`
	TotalConnections  int64 `json:"totalConnections"`
	SlowConsumers     int64 `json:"slowConsumers"`

	SimTicks           int64 `json:"simTicks"`
	SimTotalMs         int64 `json:"simTotalMs"`
	Broadcasts         int64 `json:"broadcasts"`
	BroadcastTotalMs   int64 `json:"broadcastTotalMs"`
	Leaderboards       int64 `json:"leaderboards"`
	LeaderboardTotalMs int64 `json:"leaderboardTotalMs"`

	SnapshotFull  int64 `json:"snapshotFull"`
	SnapshotDelta int64 `json:"snapshotDelta"`
	Payloads      int64 `json:"payloads"`
	PayloadBytes  int64 `json:"payloadBytes"`
}

func (m *RuntimeMetrics) ConnectionOpened() {
	if m == nil {
		return
	}
	m.activeConnections.Add(1)
	m.totalConnections.Add(1)
}

func (m *RuntimeMetrics) ConnectionClosed() {
	if m == nil {
		return
	}
	m.activeConnections.Add(-1)
}

func (m *RuntimeMetrics) SlowConsumer() {
	if m != nil {
		m.slowConsumers.Add(1)
	}
}

func (m *RuntimeMetrics) SimTick(duration time.Duration) {
	if m == nil {
		return
	}
	m.simTicks.Add(1)
	m.simNanos.Add(duration.Nanoseconds())
}

func (m *RuntimeMetrics) Broadcast(duration time.Duration) {
	if m == nil {
		return
	}
	m.broadcasts.Add(1)
	m.broadcastNanos.Add(duration.Nanoseconds())
}

func (m *RuntimeMetrics) Leaderboard(duration time.Duration) {
	if m == nil {
		return
	}
	m.leaderboards.Add(1)
	m.leaderNanos.Add(duration.Nanoseconds())
}

func (m *RuntimeMetrics) SnapshotDelta(full bool) {
	if m == nil {
		return
	}
	if full {
		m.snapshotFull.Add(1)
		return
	}
	m.snapshotDelta.Add(1)
}

func (m *RuntimeMetrics) Payload(bytes int) {
	if m == nil {
		return
	}
	m.payloads.Add(1)
	m.payloadBytes.Add(int64(bytes))
}

func (m *RuntimeMetrics) Snapshot() Snapshot {
	if m == nil {
		return Snapshot{}
	}
	return Snapshot{
		ActiveConnections:  m.activeConnections.Load(),
		TotalConnections:   m.totalConnections.Load(),
		SlowConsumers:      m.slowConsumers.Load(),
		SimTicks:           m.simTicks.Load(),
		SimTotalMs:         m.simNanos.Load() / int64(time.Millisecond),
		Broadcasts:         m.broadcasts.Load(),
		BroadcastTotalMs:   m.broadcastNanos.Load() / int64(time.Millisecond),
		Leaderboards:       m.leaderboards.Load(),
		LeaderboardTotalMs: m.leaderNanos.Load() / int64(time.Millisecond),
		SnapshotFull:       m.snapshotFull.Load(),
		SnapshotDelta:      m.snapshotDelta.Load(),
		Payloads:           m.payloads.Load(),
		PayloadBytes:       m.payloadBytes.Load(),
	}
}
