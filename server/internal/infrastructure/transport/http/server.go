// Package httpsrv exposes the HTTP transport: static file serving with SPA
// fallback, the client-error log endpoint, and the health probe.
package httpsrv

import (
	"context"
	"encoding/json"
	"errors"
	"io"
	"io/fs"
	"net/http"
	"net/http/pprof"
	"os"
	"path/filepath"
	"strings"
	"time"

	"github.com/williamisnotdefined/zelda-proto/server/internal/infrastructure/monitoring"
	"github.com/williamisnotdefined/zelda-proto/server/internal/infrastructure/policy"
	"github.com/williamisnotdefined/zelda-proto/server/internal/observability"
)

// Limits.
const (
	MaxClientErrorBody    = 256 * 1024
	ClientErrorPathPrefix = "/api/logs/client-errors"
	DebugMetricsPath      = "/api/debug/metrics"
)

// Config holds dependencies for the HTTP layer.
type Config struct {
	StaticRoot       string
	HealthHandler    http.Handler
	WSHandler        http.Handler
	ErrorStore       *monitoring.ClientErrorLogStore
	ErrorRateLimiter *policy.FixedWindowLimiter
	IPExtractor      *policy.IPExtractor
	Metrics          *observability.RuntimeMetrics
	DebugMetrics     bool
	Now              func() time.Time
}

// NewMux assembles the canonical HTTP mux.
func NewMux(cfg Config) http.Handler {
	if cfg.Now == nil {
		cfg.Now = time.Now
	}
	mux := http.NewServeMux()
	if cfg.WSHandler != nil {
		mux.Handle("/ws", cfg.WSHandler)
	}
	if cfg.HealthHandler != nil {
		mux.Handle("/healthz", cfg.HealthHandler)
	}
	mux.HandleFunc(ClientErrorPathPrefix, func(w http.ResponseWriter, r *http.Request) {
		handleClientError(w, r, cfg)
	})
	if cfg.DebugMetrics {
		mux.HandleFunc(DebugMetricsPath, func(w http.ResponseWriter, r *http.Request) {
			handleDebugMetrics(w, r, cfg)
		})
		registerDebugPprof(mux)
	}
	if cfg.StaticRoot != "" {
		mux.Handle("/", spaHandler{root: cfg.StaticRoot})
	}
	return mux
}

// ClientErrorRateCategory is the category key used by the rate limiter for
// client error log requests.
const ClientErrorRateCategory = "client_error"

func handleClientError(w http.ResponseWriter, r *http.Request, cfg Config) {
	if r.Method != http.MethodPost {
		w.Header().Set("Allow", http.MethodPost)
		http.Error(w, "method not allowed", http.StatusMethodNotAllowed)
		return
	}
	ip := ""
	if cfg.IPExtractor != nil {
		ip = cfg.IPExtractor.Extract(r)
	}
	if cfg.ErrorRateLimiter != nil && !cfg.ErrorRateLimiter.AllowKey(ClientErrorRateCategory, ip) {
		http.Error(w, "rate limited", http.StatusTooManyRequests)
		return
	}
	body, err := io.ReadAll(io.LimitReader(r.Body, MaxClientErrorBody+1))
	if err != nil {
		http.Error(w, "read error", http.StatusBadRequest)
		return
	}
	if len(body) > MaxClientErrorBody {
		http.Error(w, "payload too large", http.StatusRequestEntityTooLarge)
		return
	}
	var envelope monitoring.ClientErrorEnvelope
	if err := json.Unmarshal(body, &envelope); err != nil {
		http.Error(w, "invalid json", http.StatusBadRequest)
		return
	}
	meta := monitoring.RequestMeta{IP: ip, ReceivedAt: cfg.Now()}
	if cfg.ErrorStore != nil {
		_, _ = cfg.ErrorStore.AppendEnvelope(context.Background(), envelope, meta)
	}
	w.WriteHeader(http.StatusAccepted)
}

func handleDebugMetrics(w http.ResponseWriter, r *http.Request, cfg Config) {
	if r.Method != http.MethodGet {
		w.Header().Set("Allow", http.MethodGet)
		http.Error(w, "method not allowed", http.StatusMethodNotAllowed)
		return
	}
	w.Header().Set("Content-Type", "application/json; charset=utf-8")
	_ = json.NewEncoder(w).Encode(cfg.Metrics.Snapshot())
}

func registerDebugPprof(mux *http.ServeMux) {
	mux.HandleFunc("/debug/pprof/", pprof.Index)
	mux.HandleFunc("/debug/pprof/cmdline", pprof.Cmdline)
	mux.HandleFunc("/debug/pprof/profile", pprof.Profile)
	mux.HandleFunc("/debug/pprof/symbol", pprof.Symbol)
	mux.HandleFunc("/debug/pprof/trace", pprof.Trace)
	mux.Handle("/debug/pprof/goroutine", pprof.Handler("goroutine"))
	mux.Handle("/debug/pprof/heap", pprof.Handler("heap"))
	mux.Handle("/debug/pprof/threadcreate", pprof.Handler("threadcreate"))
	mux.Handle("/debug/pprof/block", pprof.Handler("block"))
	mux.Handle("/debug/pprof/mutex", pprof.Handler("mutex"))
}

type spaHandler struct{ root string }

func (h spaHandler) ServeHTTP(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodGet && r.Method != http.MethodHead {
		http.Error(w, "method not allowed", http.StatusMethodNotAllowed)
		return
	}
	clean := filepath.Clean(strings.TrimPrefix(r.URL.Path, "/"))
	if clean == "." || clean == "" {
		clean = "index.html"
	}
	full := filepath.Join(h.root, clean)
	info, err := os.Stat(full)
	if err != nil {
		if errors.Is(err, fs.ErrNotExist) {
			h.serveIndex(w, r)
			return
		}
		http.Error(w, "internal", http.StatusInternalServerError)
		return
	}
	if info.IsDir() {
		h.serveIndex(w, r)
		return
	}
	applyCacheHeaders(w, clean)
	http.ServeFile(w, r, full)
}

func (h spaHandler) serveIndex(w http.ResponseWriter, r *http.Request) {
	w.Header().Set("Cache-Control", "no-cache")
	http.ServeFile(w, r, filepath.Join(h.root, "index.html"))
}

func applyCacheHeaders(w http.ResponseWriter, path string) {
	switch {
	case strings.HasSuffix(path, ".html"),
		strings.HasSuffix(path, ".webmanifest"),
		strings.HasSuffix(path, "service-worker.js"):
		w.Header().Set("Cache-Control", "no-cache")
	case strings.Contains(path, "assets/"):
		w.Header().Set("Cache-Control", "public, max-age=31536000, immutable")
	default:
		w.Header().Set("Cache-Control", "public, max-age=3600")
	}
}
