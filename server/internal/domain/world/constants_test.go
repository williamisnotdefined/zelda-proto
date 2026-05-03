package world

import "testing"

func TestAllInstancesOrder(t *testing.T) {
	t.Parallel()

	expected := []InstanceID{InstancePhase1, InstancePhase2, InstancePhase3, InstancePhase4}
	got := AllInstances()
	if len(got) != len(expected) {
		t.Fatalf("expected %d instances, got %d", len(expected), len(got))
	}
	for index, id := range expected {
		if got[index] != id {
			t.Fatalf("expected instance[%d]=%s, got %s", index, id, got[index])
		}
	}
}

func TestInstanceIDIsValid(t *testing.T) {
	t.Parallel()

	cases := []struct {
		id    InstanceID
		valid bool
	}{
		{InstancePhase1, true},
		{InstancePhase2, true},
		{InstancePhase3, true},
		{InstancePhase4, true},
		{InstanceID(""), false},
		{InstanceID("phase5"), false},
	}

	for _, tc := range cases {
		if got := tc.id.IsValid(); got != tc.valid {
			t.Fatalf("InstanceID(%q).IsValid()=%v, want %v", tc.id, got, tc.valid)
		}
	}
}

func TestSimTickDurationsAreConsistent(t *testing.T) {
	t.Parallel()

	nanos := int64(SimTickDuration * SimTickRate)
	if diff := nanos - 1_000_000_000; diff < -SimTickRate || diff > SimTickRate {
		t.Fatalf("SimTickDuration*SimTickRate diff from 1s exceeds rounding tolerance: %d ns", diff)
	}
	netNanos := int64(NetTickDuration * NetTickRate)
	if diff := netNanos - 1_000_000_000; diff < -NetTickRate || diff > NetTickRate {
		t.Fatalf("NetTickDuration*NetTickRate diff from 1s exceeds rounding tolerance: %d ns", diff)
	}
}
