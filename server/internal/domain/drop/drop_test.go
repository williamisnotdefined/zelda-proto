package drop

import "testing"

func TestHealAmount(t *testing.T) {
	t.Parallel()

	cases := map[Kind]int{
		KindFoodSmall:   25,
		KindFoodLarge:   50,
		KindFoodPacman:  25,
		Kind("unknown"): 0,
	}
	for k, want := range cases {
		if got := k.HealAmount(); got != want {
			t.Errorf("HealAmount(%s)=%d, want %d", k, got, want)
		}
	}
}

func TestFoodDropChance(t *testing.T) {
	t.Parallel()

	if FoodDropChance != 0.1 {
		t.Fatalf("FoodDropChance=%v, want 0.1", FoodDropChance)
	}
}
