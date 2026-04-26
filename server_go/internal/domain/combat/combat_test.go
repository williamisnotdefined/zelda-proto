package combat

import "testing"

func TestRolesAndReasons(t *testing.T) {
	t.Parallel()

	roles := []ActorRole{RolePlayer, RoleEnemy, RoleBoss}
	for _, r := range roles {
		if r == "" {
			t.Fatal("empty role")
		}
	}
	if ReasonPVP == ReasonContact {
		t.Fatal("distinct reasons")
	}
}

func TestPendingDamageAlias(t *testing.T) {
	t.Parallel()

	var p PendingDamage = HitIntent{Amount: 10, SourceRole: RolePlayer}
	if p.Amount != 10 {
		t.Fatal("alias mismatch")
	}
}
