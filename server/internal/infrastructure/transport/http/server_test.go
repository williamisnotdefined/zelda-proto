package httpsrv

import (
	"bytes"
	"net/http"
	"net/http/httptest"
	"os"
	"path/filepath"
	"testing"
	"time"

	"github.com/williamisnotdefined/zelda-proto/server/internal/config"
	"github.com/williamisnotdefined/zelda-proto/server/internal/infrastructure/monitoring"
	"github.com/williamisnotdefined/zelda-proto/server/internal/infrastructure/policy"
	"github.com/williamisnotdefined/zelda-proto/server/internal/observability"
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

func TestDebugMetricsEndpointRequiresFlag(t *testing.T) {
	t.Parallel()

	mux := NewMux(Config{Metrics: &observability.RuntimeMetrics{}})
	rec := httptest.NewRecorder()
	mux.ServeHTTP(rec, httptest.NewRequest(http.MethodGet, DebugMetricsPath, nil))
	if rec.Code != http.StatusNotFound {
		t.Fatalf("expected 404 when debug metrics disabled, got %d", rec.Code)
	}
}

func TestDebugMetricsEndpointReturnsSnapshot(t *testing.T) {
	t.Parallel()

	metrics := &observability.RuntimeMetrics{}
	metrics.ConnectionOpened()
	mux := NewMux(Config{Metrics: metrics, DebugMetrics: true})
	rec := httptest.NewRecorder()
	mux.ServeHTTP(rec, httptest.NewRequest(http.MethodGet, DebugMetricsPath, nil))
	if rec.Code != http.StatusOK {
		t.Fatalf("expected 200, got %d", rec.Code)
	}
	if !bytes.Contains(rec.Body.Bytes(), []byte(`"activeConnections":1`)) {
		t.Fatalf("expected active connection metric, got %s", rec.Body.String())
	}
}

func TestDebugPprofRequiresFlag(t *testing.T) {
	t.Parallel()

	mux := NewMux(Config{})
	rec := httptest.NewRecorder()
	mux.ServeHTTP(rec, httptest.NewRequest(http.MethodGet, "/debug/pprof/", nil))
	if rec.Code != http.StatusNotFound {
		t.Fatalf("expected 404 when debug pprof disabled, got %d", rec.Code)
	}
}

func TestDebugPprofEndpointWhenEnabled(t *testing.T) {
	t.Parallel()

	mux := NewMux(Config{DebugMetrics: true})
	rec := httptest.NewRecorder()
	mux.ServeHTTP(rec, httptest.NewRequest(http.MethodGet, "/debug/pprof/", nil))
	if rec.Code != http.StatusOK {
		t.Fatalf("expected 200, got %d", rec.Code)
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
	mux := NewMux(Config{ErrorRateLimiter: limiter, IPExtractor: policy.NewIPExtractor(policyConfig())})
	for i := 0; i < 2; i++ {
		req := httptest.NewRequest(http.MethodPost, ClientErrorPathPrefix, bytes.NewReader([]byte(`{}`)))
		req.RemoteAddr = "10.0.0.1:1234"
		rec := httptest.NewRecorder()
		mux.ServeHTTP(rec, req)
		if i == 1 && rec.Code != http.StatusTooManyRequests {
			t.Fatalf("expected 429 on second request, got %d", rec.Code)
		}
	}
}

func TestClientErrorRateLimiterIsPerIP(t *testing.T) {
	t.Parallel()

	limiter := policy.NewFixedWindowLimiter(time.Minute, map[string]int{ClientErrorRateCategory: 1}, func() time.Time { return time.Unix(0, 0) })
	mux := NewMux(Config{ErrorRateLimiter: limiter, IPExtractor: policy.NewIPExtractor(policyConfig())})

	first := httptest.NewRequest(http.MethodPost, ClientErrorPathPrefix, bytes.NewReader([]byte(`{}`)))
	first.RemoteAddr = "10.0.0.1:1234"
	mux.ServeHTTP(httptest.NewRecorder(), first)

	second := httptest.NewRequest(http.MethodPost, ClientErrorPathPrefix, bytes.NewReader([]byte(`{}`)))
	second.RemoteAddr = "10.0.0.2:1234"
	rec := httptest.NewRecorder()
	mux.ServeHTTP(rec, second)
	if rec.Code == http.StatusTooManyRequests {
		t.Fatal("expected different ip to have separate quota")
	}
}

func policyConfig() config.Config { return config.Config{} }

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
