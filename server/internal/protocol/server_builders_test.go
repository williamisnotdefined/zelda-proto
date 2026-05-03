package protocol

import (
	"testing"

	"github.com/williamisnotdefined/zelda-proto/server/internal/codec"
)

func TestBuildWelcomeRoundtrip(t *testing.T) {
	t.Parallel()

	msg := BuildWelcome("p1", "tok", false, 0, 0)
	data, err := codec.Marshal(msg)
	if err != nil {
		t.Fatal(err)
	}
	decoded, err := codec.Decode(data)
	if err != nil {
		t.Fatal(err)
	}
	obj, ok := decoded.(codec.Object)
	if !ok {
		t.Fatalf("expected Object, got %T", decoded)
	}
	v, _ := obj.Lookup("type")
	if v != ServerMessageTypeWelcome {
		t.Fatalf("expected welcome type, got %v", v)
	}
	if id, _ := obj.Lookup("id"); id != "p1" {
		t.Fatalf("expected id=p1, got %v", id)
	}
}

func TestBuildResumeRejected(t *testing.T) {
	t.Parallel()

	msg := BuildResumeRejected(ResumeRejectedReasonInvalidSession)
	v, _ := msg.Lookup("reason")
	if v != "invalid_session" {
		t.Fatalf("unexpected reason: %v", v)
	}
}

func TestBuildSnapshotIncludesIceZones(t *testing.T) {
	t.Parallel()

	msg := BuildSnapshot(InstanceIDPhase1, nil, nil, nil, nil, nil, nil, nil, nil, nil)
	if _, ok := msg.Lookup("iceZones"); !ok {
		t.Fatalf("expected iceZones key")
	}
	if _, ok := msg.Lookup("aoeIndicators"); !ok {
		t.Fatalf("expected aoeIndicators key")
	}
	if _, ok := msg.Lookup("waveIndicators"); !ok {
		t.Fatalf("expected waveIndicators key")
	}
}

func TestBuildSnapshotDeltaIncludesUpsertRemove(t *testing.T) {
	t.Parallel()

	msg := BuildSnapshotDelta(SnapshotDeltaInput{
		Tick:            1,
		Full:            false,
		Instance:        InstanceIDPhase1,
		Enemies:         []codec.Object{{{Key: "id", Value: "e1"}}},
		RemovedEnemyIDs: []string{"e2"},
	})
	v, _ := msg.Lookup("enemies")
	if len(v.([]any)) != 1 {
		t.Fatal("expected 1 enemy upsert")
	}
	v, _ = msg.Lookup("removedEnemyIds")
	if len(v.([]any)) != 1 {
		t.Fatal("expected 1 enemy remove")
	}
}

func TestBuildChatBroadcastTimestamp(t *testing.T) {
	t.Parallel()

	msg := BuildChatBroadcast("p1", "Link", "hello", 12345)
	v, _ := msg.Lookup("timestamp")
	if v.(int64) != 12345 {
		t.Fatalf("expected timestamp 12345")
	}
}

func TestBuildLeaderboardOrder(t *testing.T) {
	t.Parallel()

	msg := BuildLeaderboard([]LeaderboardEntry{
		{PlayerID: "a", Nickname: "Link", MonsterKills: 3, PlayerKills: 1, Deaths: 2},
	})
	entries, _ := msg.Lookup("players")
	if len(entries.([]any)) != 1 {
		t.Fatal("expected 1 entry")
	}
}

func TestBuildErrorIncludesCode(t *testing.T) {
	t.Parallel()

	msg := BuildError(ServerErrorCodeRateLimited, "slow down")
	v, _ := msg.Lookup("code")
	if v != "rate_limited" {
		t.Fatalf("unexpected code")
	}
}
