package observability

import (
	"testing"
	"time"
)

func TestRuntimeMetricsSnapshot(t *testing.T) {
	t.Parallel()

	m := &RuntimeMetrics{}
	m.ConnectionOpened()
	m.ConnectionOpened()
	m.ConnectionClosed()
	m.SlowConsumer()
	m.SimTick(2 * time.Millisecond)
	m.Broadcast(3 * time.Millisecond)
	m.Leaderboard(4 * time.Millisecond)
	m.SnapshotDelta(true)
	m.SnapshotDelta(false)
	m.Payload(128)

	s := m.Snapshot()
	if s.ActiveConnections != 1 || s.TotalConnections != 2 || s.SlowConsumers != 1 {
		t.Fatalf("unexpected connection metrics: %+v", s)
	}
	if s.SimTicks != 1 || s.SimTotalMs != 2 || s.Broadcasts != 1 || s.BroadcastTotalMs != 3 || s.Leaderboards != 1 || s.LeaderboardTotalMs != 4 {
		t.Fatalf("unexpected timing metrics: %+v", s)
	}
	if s.SnapshotFull != 1 || s.SnapshotDelta != 1 || s.Payloads != 1 || s.PayloadBytes != 128 {
		t.Fatalf("unexpected payload metrics: %+v", s)
	}
}
