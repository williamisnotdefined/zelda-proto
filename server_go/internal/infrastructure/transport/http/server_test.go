package httpsrv

import (
	"bytes"
	"net/http"
	"net/http/httptest"
	"os"
	"path/filepath"
	"testing"
	"time"

	"github.com/williamisnotdefined/zelda-proto/server_go/internal/infrastructure/monitoring"
	"github.com/williamisnotdefined/zelda-proto/server_go/internal/infrastructure/policy"
)

func TestHealthRouting(t *testing.T) {
	t.Parallel()

	mux := NewMux(Config{
		HealthHandler: http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
			w.WriteHeader(http.StatusOK)
		}),
	})
	rec := httptest.NewRecorder()
	mux.ServeHTTP(rec, httptest.NewRequest(http.MethodGet, "/healthz", nil))
	if rec.Code != 200 {
		t.Fatalf("expected 200, got %d", rec.Code)
	}
}

func TestClientErrorEndpointAccepts(t *testing.T) {
	t.Parallel()

	dir := t.TempDir()
	store := monitoring.NewClientErrorLogStore(dir)
	mux := NewMux(Config{
		ErrorStore: store,
		Now:        func() time.Time { return time.Unix(0, 0) },
	})
	body := bytes.NewReader([]byte(`{"events":[{"message":"oops"}]}`))
	req := httptest.NewRequest(http.MethodPost, ClientErrorPathPrefix, body)
	req.Header.Set("Content-Type", "application/json")
	rec := httptest.NewRecorder()
	mux.ServeHTTP(rec, req)
	if rec.Code != http.StatusAccepted {
		t.Fatalf("expected 202, got %d (body=%s)", rec.Code, rec.Body.String())
	}
}

func TestClientErrorEndpointRejectsMethod(t *testing.T) {
	t.Parallel()

	mux := NewMux(Config{})
	req := httptest.NewRequest(http.MethodGet, ClientErrorPathPrefix, nil)
	rec := httptest.NewRecorder()
	mux.ServeHTTP(rec, req)
	if rec.Code != http.StatusMethodNotAllowed {
		t.Fatalf("expected 405, got %d", rec.Code)
	}
}

func TestClientErrorRateLimiter(t *testing.T) {
	t.Parallel()

	limiter := policy.NewFixedWindowLimiter(time.Minute, map[string]int{ClientErrorRateCategory: 1}, func() time.Time { return time.Unix(0, 0) })
	mux := NewMux(Config{ErrorRateLimiter: limiter})
	for i := 0; i < 2; i++ {
		req := httptest.NewRequest(http.MethodPost, ClientErrorPathPrefix, bytes.NewReader([]byte(`{}`)))
		rec := httptest.NewRecorder()
		mux.ServeHTTP(rec, req)
		if i == 1 && rec.Code != http.StatusTooManyRequests {
			t.Fatalf("expected 429 on second request, got %d", rec.Code)
		}
	}
}

func TestSPAServesIndexFallback(t *testing.T) {
	t.Parallel()

	dir := t.TempDir()
	if err := os.WriteFile(filepath.Join(dir, "index.html"), []byte("<!doctype html>hello"), 0o644); err != nil {
		t.Fatal(err)
	}
	mux := NewMux(Config{StaticRoot: dir})
	rec := httptest.NewRecorder()
	mux.ServeHTTP(rec, httptest.NewRequest(http.MethodGet, "/some/random/path", nil))
	if rec.Code != http.StatusOK {
		t.Fatalf("expected 200, got %d", rec.Code)
	}
	if !bytes.Contains(rec.Body.Bytes(), []byte("hello")) {
		t.Fatalf("expected index body, got %q", rec.Body.String())
	}
}

func TestSPAServesAssetsWithImmutableCache(t *testing.T) {
	t.Parallel()

	dir := t.TempDir()
	assetsDir := filepath.Join(dir, "assets")
	_ = os.Mkdir(assetsDir, 0o755)
	if err := os.WriteFile(filepath.Join(assetsDir, "app.js"), []byte("console.log(1)"), 0o644); err != nil {
		t.Fatal(err)
	}
	mux := NewMux(Config{StaticRoot: dir})
	rec := httptest.NewRecorder()
	mux.ServeHTTP(rec, httptest.NewRequest(http.MethodGet, "/assets/app.js", nil))
	if rec.Code != http.StatusOK {
		t.Fatalf("expected 200, got %d", rec.Code)
	}
	if !bytes.Contains([]byte(rec.Header().Get("Cache-Control")), []byte("immutable")) {
		t.Fatalf("expected immutable cache, got %q", rec.Header().Get("Cache-Control"))
	}
}
