package app

import (
	"context"
	"encoding/json"
	"io"
	"log"
	"net/http"
	"net/http/httptest"
	"os"
	"path/filepath"
	"testing"
	"time"

	"github.com/williamisnotdefined/zelda-proto/server/internal/config"
)

func TestHealthzReturnsActiveStatus(t *testing.T) {
	application := New(config.Config{
		Environment: "development",
		Port:        3003,
	}, log.New(io.Discard, "", 0))

	server := httptest.NewServer(application.Handler())
	defer server.Close()

	response, err := http.Get(server.URL + "/healthz")
	if err != nil {
		t.Fatalf("GET /healthz: %v", err)
	}
	defer response.Body.Close()

	if response.StatusCode != http.StatusOK {
		t.Fatalf("expected 200, got %d", response.StatusCode)
	}

	var payload healthResponse
	if err := json.NewDecoder(response.Body).Decode(&payload); err != nil {
		t.Fatalf("decode healthz response: %v", err)
	}
	if payload.Status != "ok" {
		t.Fatalf("expected status ok, got %q", payload.Status)
	}
	if payload.Runtime != "go" {
		t.Fatalf("expected runtime go, got %q", payload.Runtime)
	}
	if payload.Port != 3003 {
		t.Fatalf("expected port 3003, got %d", payload.Port)
	}
}

func TestRunHonorsContextShutdown(t *testing.T) {
	application := New(config.Config{
		Environment: "development",
		Port:        0,
	}, log.New(io.Discard, "", 0))

	ctx, cancel := context.WithCancel(context.Background())
	errCh := make(chan error, 1)
	go func() {
		errCh <- application.Run(ctx)
	}()
	time.Sleep(50 * time.Millisecond)
	cancel()

	select {
	case err := <-errCh:
		if err != nil {
			t.Fatalf("Run returned error: %v", err)
		}
	case <-time.After(2 * time.Second):
		t.Fatal("Run did not stop after context cancellation")
	}
}

func TestResolveStaticRootDefaultsToClientDist(t *testing.T) {
	t.Setenv("CLIENT_DIST_DIR", "")

	wd, err := os.Getwd()
	if err != nil {
		t.Fatalf("getwd: %v", err)
	}
	rootDir := filepath.Clean(filepath.Join(wd, "..", "..", ".."))
	if err := os.Chdir(rootDir); err != nil {
		t.Fatalf("chdir root: %v", err)
	}
	defer func() {
		if err := os.Chdir(wd); err != nil {
			t.Fatalf("restore cwd: %v", err)
		}
	}()

	if got := resolveStaticRoot(); got != filepath.Join("client", "dist") {
		t.Fatalf("expected default static root, got %q", got)
	}
}
