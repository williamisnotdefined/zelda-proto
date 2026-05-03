package hazard

import (
	"testing"
	"time"
)

func TestEffectAndTTL(t *testing.T) {
	t.Parallel()

	if EffectFor(KindFireField) != EffectBurning {
		t.Fatal("fire→burning")
	}
	if EffectFor(KindPurpleField) != EffectPurpleBurning {
		t.Fatal("purple→purpleBurning")
	}
	if EffectFor(KindBlueFlame) != EffectBlueBurning {
		t.Fatal("blue→blueBurning")
	}
	if TTLFor(KindFireField) != DefaultTTL {
		t.Fatal("fire ttl")
	}
	if TTLFor(KindPurpleField) != PurpleTTL {
		t.Fatal("purple ttl")
	}
	if TTLFor(KindLandmine) != LandmineTTL {
		t.Fatal("landmine ttl")
	}
	if TTLFor(KindLandmineExplosion) != LandmineExplosionTTL {
		t.Fatal("landmine explosion ttl")
	}
}

func TestTickExpires(t *testing.T) {
	t.Parallel()

	h := New("h1", 0, 0, KindFireField)
	if h.Tick(DefaultTTL / 2) {
		t.Fatal("expected not expired")
	}
	if !h.Tick(DefaultTTL) {
		t.Fatal("expected expired")
	}
}

func TestMarkHitOnce(t *testing.T) {
	t.Parallel()

	h := New("h1", 0, 0, KindFireField)
	if !h.MarkHit("p1") {
		t.Fatal("first hit must succeed")
	}
	if h.MarkHit("p1") {
		t.Fatal("repeat hit must fail")
	}
}

func TestNewDefaults(t *testing.T) {
	t.Parallel()

	h := New("h1", 0, 0, KindFireField)
	if h.Damage != BurningTickDamage || h.BurningTicks != BurningTicks {
		t.Fatalf("unexpected defaults: %+v", h)
	}
	if h.TTL != DefaultTTL {
		t.Fatalf("unexpected ttl %s", h.TTL)
	}
	mine := NewLandmine("m1", 0, 0)
	if mine.TTL != LandmineTTL || mine.BurningTicks != 0 {
		t.Fatalf("unexpected landmine defaults: %+v", mine)
	}
	explosion := NewLandmineExplosion("x1", 0, 0)
	if explosion.TTL != LandmineExplosionTTL || explosion.Damage != 0 || explosion.HitRadius != LandmineExplosionRadius {
		t.Fatalf("unexpected explosion defaults: %+v", explosion)
	}
	_ = time.Second // keep import
}
