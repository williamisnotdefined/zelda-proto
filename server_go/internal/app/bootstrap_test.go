package app

import (
	"context"
	"encoding/json"
	"io"
	"log"
	"net/http"
	"net/http/httptest"
	"testing"
	"time"

	"github.com/williamisnotdefined/zelda-proto/server_go/internal/config"
)

func TestHealthzReturnsActiveStatus(t *testing.T) {
	application := New(config.Config{
		Environment: "development",
		Port:        3002,
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
	if payload.Port != 3002 {
		t.Fatalf("expected port 3002, got %d", payload.Port)
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
