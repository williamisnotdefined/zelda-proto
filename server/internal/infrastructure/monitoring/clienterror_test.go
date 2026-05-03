package monitoring

import (
	"context"
	"encoding/json"
	"errors"
	"os"
	"path/filepath"
	"strings"
	"testing"
	"time"
)

func TestAppendEnvelopePersistsRecords(t *testing.T) {
	t.Parallel()

	dir := t.TempDir()
	store := NewClientErrorLogStore(dir)

	receivedAt := time.Date(2026, 4, 26, 10, 0, 0, 0, time.UTC)
	envelope := ClientErrorEnvelope{
		SentAt: "2026-04-26T09:59:59.500Z",
		App:    map[string]any{"name": "client", "version": "1.0.0"},
		Client: map[string]any{"installId": "abc"},
		Events: []ClientErrorEvent{
			{ID: "evt-1", Level: "error", Message: "boom"},
			{ID: "evt-2", Level: "warn", Message: "soft"},
		},
	}

	written, err := store.AppendEnvelope(context.Background(), envelope, RequestMeta{
		ReceivedAt: receivedAt,
		IP:         "10.0.0.1",
		RequestID:  "req-1",
	})
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if written != 2 {
		t.Fatalf("expected 2 records, got %d", written)
	}

	expectedFile := filepath.Join(dir, "client-errors-2026-04-26.ndjson")
	contents, err := os.ReadFile(expectedFile)
	if err != nil {
		t.Fatalf("expected file: %v", err)
	}

	lines := strings.Split(strings.TrimSpace(string(contents)), "\n")
	if len(lines) != 2 {
		t.Fatalf("expected 2 lines, got %d", len(lines))
	}

	var parsed map[string]any
	if err := json.Unmarshal([]byte(lines[0]), &parsed); err != nil {
		t.Fatalf("expected valid json: %v", err)
	}
	if parsed["ip"] != "10.0.0.1" || parsed["requestId"] != "req-1" {
		t.Fatalf("unexpected metadata: %+v", parsed)
	}
	event, ok := parsed["event"].(map[string]any)
	if !ok || event["id"] != "evt-1" {
		t.Fatalf("unexpected event payload: %+v", parsed)
	}
}

func TestAppendEnvelopeRejectsEmptyEvents(t *testing.T) {
	t.Parallel()

	store := NewClientErrorLogStore(t.TempDir())
	_, err := store.AppendEnvelope(context.Background(), ClientErrorEnvelope{}, RequestMeta{ReceivedAt: time.Now()})
	if !errors.Is(err, ErrNoEvents) {
		t.Fatalf("expected ErrNoEvents, got %v", err)
	}
}

func TestReadRecentEntriesReturnsNewestFirst(t *testing.T) {
	t.Parallel()

	dir := t.TempDir()
	store := NewClientErrorLogStore(dir)

	first := time.Date(2026, 4, 24, 10, 0, 0, 0, time.UTC)
	second := time.Date(2026, 4, 26, 10, 0, 0, 0, time.UTC)

	_, err := store.AppendEnvelope(context.Background(), ClientErrorEnvelope{
		Events: []ClientErrorEvent{{ID: "old"}},
	}, RequestMeta{ReceivedAt: first, IP: "1.1.1.1", RequestID: "old-req"})
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}

	_, err = store.AppendEnvelope(context.Background(), ClientErrorEnvelope{
		Events: []ClientErrorEvent{{ID: "new-1"}, {ID: "new-2"}},
	}, RequestMeta{ReceivedAt: second, IP: "2.2.2.2", RequestID: "new-req"})
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}

	entries, err := store.ReadRecentEntries(2, "")
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if len(entries) != 2 {
		t.Fatalf("expected 2 entries, got %d", len(entries))
	}

	firstEvent, _ := entries[0]["event"].(map[string]any)
	secondEvent, _ := entries[1]["event"].(map[string]any)
	if firstEvent["id"] != "new-2" {
		t.Fatalf("expected first entry to be new-2, got %v", firstEvent)
	}
	if secondEvent["id"] != "new-1" {
		t.Fatalf("expected second entry to be new-1, got %v", secondEvent)
	}
}

func TestReadRecentEntriesFiltersByDate(t *testing.T) {
	t.Parallel()

	dir := t.TempDir()
	store := NewClientErrorLogStore(dir)

	when := time.Date(2026, 4, 26, 10, 0, 0, 0, time.UTC)
	_, err := store.AppendEnvelope(context.Background(), ClientErrorEnvelope{
		Events: []ClientErrorEvent{{ID: "match"}},
	}, RequestMeta{ReceivedAt: when, RequestID: "r"})
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}

	entries, err := store.ReadRecentEntries(10, "2026-04-26")
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if len(entries) != 1 {
		t.Fatalf("expected 1 entry, got %d", len(entries))
	}

	none, err := store.ReadRecentEntries(10, "2026-04-25")
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if len(none) != 0 {
		t.Fatalf("expected empty result, got %d", len(none))
	}
}

func TestReadRecentEntriesReturnsEmptyWhenDirMissing(t *testing.T) {
	t.Parallel()

	store := NewClientErrorLogStore(filepath.Join(t.TempDir(), "missing"))
	entries, err := store.ReadRecentEntries(10, "")
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if len(entries) != 0 {
		t.Fatalf("expected empty entries, got %v", entries)
	}
}

func TestReadRecentEntriesHandlesMalformedLine(t *testing.T) {
	t.Parallel()

	dir := t.TempDir()
	path := filepath.Join(dir, "client-errors-2026-04-26.ndjson")
	if err := os.WriteFile(path, []byte("not-json\n"), 0o644); err != nil {
		t.Fatalf("setup error: %v", err)
	}

	store := NewClientErrorLogStore(dir)
	entries, err := store.ReadRecentEntries(10, "")
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if len(entries) != 1 {
		t.Fatalf("expected 1 entry, got %d", len(entries))
	}
	if entries[0]["malformedLine"] != "not-json" {
		t.Fatalf("expected malformed marker, got %+v", entries[0])
	}
}

func TestReadRecentEntriesNegativeLimit(t *testing.T) {
	t.Parallel()

	store := NewClientErrorLogStore(t.TempDir())
	entries, err := store.ReadRecentEntries(0, "")
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if len(entries) != 0 {
		t.Fatalf("expected empty, got %v", entries)
	}
}

func TestSanitizeTruncatesAndCapsArrays(t *testing.T) {
	t.Parallel()

	long := strings.Repeat("a", defaultMaxStringLength+10)
	dir := t.TempDir()
	store := NewClientErrorLogStore(dir)

	bigArray := make([]any, maxArrayItems+5)
	for index := range bigArray {
		bigArray[index] = "item"
	}

	envelope := ClientErrorEnvelope{
		Events: []ClientErrorEvent{{
			ID:      "evt",
			Stack:   long,
			Tags:    map[string]any{"deep": map[string]any{"a": map[string]any{"b": map[string]any{"c": map[string]any{"d": map[string]any{"e": map[string]any{"f": "deep"}}}}}}},
			Context: map[string]any{"items": bigArray},
		}},
	}

	if _, err := store.AppendEnvelope(context.Background(), envelope, RequestMeta{
		ReceivedAt: time.Now().UTC(),
		RequestID:  "r",
	}); err != nil {
		t.Fatalf("unexpected error: %v", err)
	}

	entries, err := store.ReadRecentEntries(1, "")
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	event := entries[0]["event"].(map[string]any)
	if stack, ok := event["stack"].(string); !ok || len(stack) != defaultMaxStringLength {
		t.Fatalf("expected stack truncated to %d chars, got len=%d", defaultMaxStringLength, len(stack))
	}
	context := event["context"].(map[string]any)
	items := context["items"].([]any)
	if len(items) != maxArrayItems {
		t.Fatalf("expected array capped at %d, got %d", maxArrayItems, len(items))
	}
}
