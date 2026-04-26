// Package monitoring persists structured client error reports to NDJSON files,
// rotating per UTC date.
package monitoring

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"os"
	"path/filepath"
	"sort"
	"strings"
	"sync"
	"time"
)

const (
	defaultMaxStringLength = 16000
	defaultMaxDepth        = 5
	maxArrayItems          = 50
	maxFieldStringLength   = 1000
)

// ErrNoEvents indicates the envelope did not contain any events to persist.
var ErrNoEvents = errors.New("monitoring: envelope contains no events")

// ClientErrorEvent mirrors the JSON shape posted by the client error logger.
type ClientErrorEvent struct {
	ID             string         `json:"id,omitempty"`
	Timestamp      string         `json:"ts,omitempty"`
	Level          string         `json:"level,omitempty"`
	Category       string         `json:"category,omitempty"`
	Type           string         `json:"type,omitempty"`
	Message        string         `json:"message,omitempty"`
	Name           string         `json:"name,omitempty"`
	Stack          string         `json:"stack,omitempty"`
	ComponentStack string         `json:"componentStack,omitempty"`
	Source         string         `json:"source,omitempty"`
	Line           *float64       `json:"line,omitempty"`
	Column         *float64       `json:"column,omitempty"`
	Handled        *bool          `json:"handled,omitempty"`
	Tags           map[string]any `json:"tags,omitempty"`
	Context        map[string]any `json:"context,omitempty"`
	Queue          map[string]any `json:"queue,omitempty"`
}

// ClientErrorEnvelope is the deserialized payload received from the client.
type ClientErrorEnvelope struct {
	SchemaVersion *int               `json:"schemaVersion,omitempty"`
	SentAt        string             `json:"sentAt,omitempty"`
	App           map[string]any     `json:"app,omitempty"`
	Client        map[string]any     `json:"client,omitempty"`
	Events        []ClientErrorEvent `json:"events"`
}

// RequestMeta captures HTTP metadata associated with a single envelope.
type RequestMeta struct {
	ReceivedAt time.Time
	IP         string
	RequestID  string
}

// ClientErrorLogStore appends sanitized records to per-day NDJSON files.
type ClientErrorLogStore struct {
	logDir string

	mu sync.Mutex
}

// NewClientErrorLogStore returns a store that writes under logDir.
func NewClientErrorLogStore(logDir string) *ClientErrorLogStore {
	return &ClientErrorLogStore{logDir: logDir}
}

// LogDir returns the directory the store writes to.
func (s *ClientErrorLogStore) LogDir() string {
	return s.logDir
}

// AppendEnvelope persists every event in the envelope and returns the number
// of records written. ErrNoEvents is returned when there are no events.
func (s *ClientErrorLogStore) AppendEnvelope(_ context.Context, envelope ClientErrorEnvelope, meta RequestMeta) (int, error) {
	if len(envelope.Events) == 0 {
		return 0, ErrNoEvents
	}

	receivedAt := meta.ReceivedAt.UTC()
	dateKey := receivedAt.Format("2006-01-02")
	filePath := filepath.Join(s.logDir, fmt.Sprintf("client-errors-%s.ndjson", dateKey))

	s.mu.Lock()
	defer s.mu.Unlock()

	if err := os.MkdirAll(s.logDir, 0o755); err != nil {
		return 0, err
	}

	file, err := os.OpenFile(filePath, os.O_APPEND|os.O_CREATE|os.O_WRONLY, 0o644)
	if err != nil {
		return 0, err
	}
	defer file.Close()

	encoder := json.NewEncoder(file)
	encoder.SetEscapeHTML(false)

	written := 0
	for _, event := range envelope.Events {
		record := buildRecord(event, envelope, meta)
		if err := encoder.Encode(record); err != nil {
			return written, err
		}
		written += 1
	}

	return written, nil
}

// ReadRecentEntries returns up to limit decoded entries, scanning newest log
// files first. When date is non-empty only the matching file is scanned.
func (s *ClientErrorLogStore) ReadRecentEntries(limit int, date string) ([]map[string]any, error) {
	if limit <= 0 {
		return nil, nil
	}

	files, err := s.listLogFiles(date)
	if err != nil {
		return nil, err
	}

	collected := make([]map[string]any, 0, limit)
	for _, name := range files {
		content, readErr := os.ReadFile(filepath.Join(s.logDir, name))
		if readErr != nil {
			return nil, readErr
		}
		lines := strings.Split(string(content), "\n")
		for index := len(lines) - 1; index >= 0; index -= 1 {
			line := strings.TrimSpace(lines[index])
			if line == "" {
				continue
			}
			parsed := map[string]any{}
			if err := json.Unmarshal([]byte(line), &parsed); err != nil {
				parsed = map[string]any{"malformedLine": line, "file": name}
			}
			collected = append(collected, parsed)
			if len(collected) >= limit {
				return collected, nil
			}
		}
	}

	return collected, nil
}

func (s *ClientErrorLogStore) listLogFiles(date string) ([]string, error) {
	entries, err := os.ReadDir(s.logDir)
	if err != nil {
		if errors.Is(err, os.ErrNotExist) {
			return nil, nil
		}
		return nil, err
	}

	matches := make([]string, 0, len(entries))
	for _, entry := range entries {
		name := entry.Name()
		if !strings.HasPrefix(name, "client-errors-") || !strings.HasSuffix(name, ".ndjson") {
			continue
		}
		if date != "" && name != fmt.Sprintf("client-errors-%s.ndjson", date) {
			continue
		}
		matches = append(matches, name)
	}

	sort.Sort(sort.Reverse(sort.StringSlice(matches)))
	return matches, nil
}

func buildRecord(event ClientErrorEvent, envelope ClientErrorEnvelope, meta RequestMeta) map[string]any {
	schemaVersion := 1
	if envelope.SchemaVersion != nil {
		schemaVersion = *envelope.SchemaVersion
	}

	record := map[string]any{
		"schemaVersion": schemaVersion,
		"receivedAt":    meta.ReceivedAt.UTC().Format(time.RFC3339Nano),
		"requestId":     meta.RequestID,
		"ip":            meta.IP,
	}

	if normalized := normalizeISODate(envelope.SentAt); normalized != "" {
		record["sentAt"] = normalized
	}
	if envelope.App != nil {
		record["app"] = sanitizeUnknown(envelope.App, 0)
	}
	if envelope.Client != nil {
		record["client"] = sanitizeUnknown(envelope.Client, 0)
	}

	record["event"] = buildEventRecord(event)
	return record
}

func buildEventRecord(event ClientErrorEvent) map[string]any {
	out := map[string]any{}
	addString(out, "id", event.ID, 200)
	if normalized := normalizeISODate(event.Timestamp); normalized != "" {
		out["ts"] = normalized
	}
	addString(out, "level", event.Level, 32)
	addString(out, "category", event.Category, 64)
	addString(out, "type", event.Type, 120)
	addString(out, "message", event.Message, defaultMaxStringLength)
	addString(out, "name", event.Name, 200)
	addString(out, "stack", event.Stack, defaultMaxStringLength)
	addString(out, "componentStack", event.ComponentStack, defaultMaxStringLength)
	addString(out, "source", event.Source, maxFieldStringLength)

	if event.Line != nil {
		out["line"] = *event.Line
	}
	if event.Column != nil {
		out["column"] = *event.Column
	}
	if event.Handled != nil {
		out["handled"] = *event.Handled
	}
	if event.Tags != nil {
		out["tags"] = sanitizeUnknown(event.Tags, 0)
	}
	if event.Context != nil {
		out["context"] = sanitizeUnknown(event.Context, 0)
	}
	if event.Queue != nil {
		out["queue"] = sanitizeUnknown(event.Queue, 0)
	}
	return out
}

func addString(out map[string]any, key string, value string, maxLength int) {
	if value == "" {
		return
	}
	out[key] = truncateString(value, maxLength)
}

func truncateString(value string, maxLength int) string {
	if len(value) <= maxLength {
		return value
	}
	if maxLength <= 3 {
		return value[:maxLength]
	}
	return value[:maxLength-3] + "..."
}

func sanitizeUnknown(value any, depth int) any {
	if depth > defaultMaxDepth {
		return "[max-depth]"
	}

	switch typed := value.(type) {
	case nil:
		return nil
	case bool, float64, float32, int, int32, int64, uint, uint32, uint64:
		return typed
	case string:
		return truncateString(typed, defaultMaxStringLength)
	case []any:
		limit := len(typed)
		if limit > maxArrayItems {
			limit = maxArrayItems
		}
		out := make([]any, 0, limit)
		for index := 0; index < limit; index += 1 {
			out = append(out, sanitizeUnknown(typed[index], depth+1))
		}
		return out
	case map[string]any:
		out := make(map[string]any, len(typed))
		for key, entry := range typed {
			out[key] = sanitizeUnknown(entry, depth+1)
		}
		return out
	default:
		return truncateString(fmt.Sprintf("%v", typed), maxFieldStringLength)
	}
}

func normalizeISODate(value string) string {
	value = strings.TrimSpace(value)
	if value == "" {
		return ""
	}
	parsed, err := time.Parse(time.RFC3339Nano, value)
	if err != nil {
		parsed, err = time.Parse(time.RFC3339, value)
		if err != nil {
			return ""
		}
	}
	return parsed.UTC().Format(time.RFC3339Nano)
}
