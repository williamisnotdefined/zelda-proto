package spatial

import (
	"sort"
	"testing"
)

func TestUpsertAndQuery(t *testing.T) {
	t.Parallel()

	idx := New(64)
	idx.Upsert("a", 10, 10)
	idx.Upsert("b", 20, 20)
	idx.Upsert("c", 1000, 1000)
	results := idx.QueryRadius(15, 15, 50)
	sort.Strings(results)
	want := []string{"a", "b"}
	if len(results) != len(want) || results[0] != "a" || results[1] != "b" {
		t.Fatalf("expected [a b], got %v", results)
	}
}

func TestUpsertMovesEntity(t *testing.T) {
	t.Parallel()

	idx := New(64)
	idx.Upsert("a", 0, 0)
	idx.Upsert("a", 1000, 1000)
	if len(idx.QueryRadius(0, 0, 100)) != 0 {
		t.Fatal("entity should have moved away from origin")
	}
	if len(idx.QueryRadius(1000, 1000, 50)) != 1 {
		t.Fatal("entity should be near new position")
	}
}

func TestRemove(t *testing.T) {
	t.Parallel()

	idx := New(64)
	idx.Upsert("a", 0, 0)
	idx.Remove("a")
	idx.Remove("ghost") // no-op
	if idx.Len() != 0 {
		t.Fatal("expected empty")
	}
}

func TestFindNearest(t *testing.T) {
	t.Parallel()

	idx := New(64)
	idx.Upsert("a", 0, 0)
	idx.Upsert("b", 30, 0)
	idx.Upsert("c", 10, 0)
	got := idx.FindNearest(0, 0, 100, nil)
	if got != "a" {
		t.Fatalf("expected a, got %s", got)
	}
	got = idx.FindNearest(0, 0, 100, func(id EntityID) bool { return id != "a" })
	if got != "c" {
		t.Fatalf("expected c, got %s", got)
	}
}

func TestForEachIgnoresZeroRadius(t *testing.T) {
	t.Parallel()

	idx := New(64)
	idx.Upsert("a", 0, 0)
	called := 0
	idx.ForEachInRadius(0, 0, 0, func(_ EntityID) { called++ })
	if called != 0 {
		t.Fatal("zero radius must short-circuit")
	}
}

func TestClear(t *testing.T) {
	t.Parallel()

	idx := New(64)
	idx.Upsert("a", 0, 0)
	idx.Clear()
	if idx.Len() != 0 {
		t.Fatal("expected empty after clear")
	}
}

func TestZeroCellSizeFallsBackToDefault(t *testing.T) {
	t.Parallel()

	idx := New(0)
	if idx.cellSize != 256 {
		t.Fatalf("expected fallback cell size 256, got %d", idx.cellSize)
	}
}
