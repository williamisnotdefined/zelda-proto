package drop

import "testing"

func TestHealAmount(t *testing.T) {
	t.Parallel()

	cases := map[Kind]int{
		KindHeartSmall:  25,
		KindHeartLarge:  50,
		KindHeartPacman: 25,
		Kind("unknown"): 0,
	}
	for k, want := range cases {
		if got := k.HealAmount(); got != want {
			t.Errorf("HealAmount(%s)=%d, want %d", k, got, want)
		}
	}
}
