package logging

import (
	"bytes"
	"strings"
	"testing"
)

func TestNewProductionEmitsJSON(t *testing.T) {
	t.Parallel()

	buffer := &bytes.Buffer{}
	logger := New("production", buffer)
	logger.Info("hello", "key", "value")

	output := buffer.String()
	if !strings.Contains(output, `"msg":"hello"`) {
		t.Fatalf("expected json msg field, got %q", output)
	}
	if !strings.Contains(output, `"key":"value"`) {
		t.Fatalf("expected json key field, got %q", output)
	}
}

func TestNewDevelopmentEmitsText(t *testing.T) {
	t.Parallel()

	buffer := &bytes.Buffer{}
	logger := New("development", buffer)
	logger.Info("hello", "key", "value")

	output := buffer.String()
	if !strings.Contains(output, "msg=hello") {
		t.Fatalf("expected text msg field, got %q", output)
	}
	if !strings.Contains(output, "key=value") {
		t.Fatalf("expected text key field, got %q", output)
	}
}

func TestNewDefaultsToStdoutWhenWriterIsNil(t *testing.T) {
	t.Parallel()

	logger := New("development", nil)
	if logger == nil {
		t.Fatal("expected non-nil logger")
	}
}
