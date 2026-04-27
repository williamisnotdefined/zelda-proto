// Package app is the composition root: it wires every infrastructure adapter
// to the application services and exposes Run for cmd/server.
package app

import (
	"context"
	"crypto/rand"
	"encoding/json"
	"errors"
	"io/fs"
	"log"
	"net"
	"net/http"
	"os"
	"path/filepath"
	"strconv"
	"sync"
	"sync/atomic"
	"time"

	appinst "github.com/williamisnotdefined/zelda-proto/server_go/internal/application/instance"
	apploop "github.com/williamisnotdefined/zelda-proto/server_go/internal/application/loop"
	appsess "github.com/williamisnotdefined/zelda-proto/server_go/internal/application/session"
	"github.com/williamisnotdefined/zelda-proto/server_go/internal/config"
	domworld "github.com/williamisnotdefined/zelda-proto/server_go/internal/domain/world"
	"github.com/williamisnotdefined/zelda-proto/server_go/internal/infrastructure/id"
	"github.com/williamisnotdefined/zelda-proto/server_go/internal/infrastructure/monitoring"
	"github.com/williamisnotdefined/zelda-proto/server_go/internal/infrastructure/policy"
	httpsrv "github.com/williamisnotdefined/zelda-proto/server_go/internal/infrastructure/transport/http"
	wsxport "github.com/williamisnotdefined/zelda-proto/server_go/internal/infrastructure/transport/ws"
	"github.com/williamisnotdefined/zelda-proto/server_go/internal/interfaces/wsapi"
)

const shutdownTimeout = 5 * time.Second

// App holds the composed runtime.
type App struct {
	config     config.Config
	logger     *log.Logger
	manager    *appinst.Manager
	sessions   *appsess.Manager
	dispatcher *wsapi.Dispatcher
	loop       *apploop.Loop
	httpMux    http.Handler
}

// healthResponse is the payload for /healthz.
type healthResponse struct {
	Status      string `json:"status"`
	Environment string `json:"environment"`
	Port        int    `json:"port"`
	Runtime     string `json:"runtime"`
	WebSocket   string `json:"webSocket"`
	Gameplay    string `json:"gameplay"`
}

// idFactory satisfies application.world.IDFactory plus PlayerIDFactory and
// ConnectionIDFactory used by wsapi and the WS transport.
type idFactory struct {
	gen *id.Generator
	n   atomic.Int64
}

func (f *idFactory) NewID(prefix string) string {
	tok, err := f.gen.NewToken(8)
	if err != nil {
		return prefix + "_" + strconv.FormatInt(f.n.Add(1), 10)
	}
	return prefix + "_" + tok
}
func (f *idFactory) NewPlayerID() string     { return f.NewID("player") }
func (f *idFactory) NewConnectionID() string { return f.NewID("conn") }

// New constructs an App with all dependencies wired.
func New(cfg config.Config, logger *log.Logger) *App {
	if logger == nil {
		logger = log.Default()
	}

	idGen := id.NewGenerator(rand.Reader)
	ids := &idFactory{gen: idGen}

	sessions := appsess.NewManager(appsess.Options{TokenGenerator: idGen})
	startPhase := domworld.InstanceID(cfg.DevStartPhase)
	if !startPhase.IsValid() {
		startPhase = domworld.InstancePhase1
	}
	manager := appinst.New(appinst.Config{
		IDs:                   ids,
		StartPhase:            startPhase,
		StressEnemiesPerChunk: cfg.DevStressEnemiesPerChunk,
	})
	dispatcher := wsapi.NewDispatcher(manager, sessions, ids, time.Now)
	sessions.SetExpiryHandler(func(playerID string) {
		dispatcher.HandleSessionExpired(playerID)
	})

	originValidator := policy.NewOriginValidator(cfg)
	ipExtractor := policy.NewIPExtractor(cfg)
	errorStore := monitoring.NewClientErrorLogStore("logs")
	errorRateLimiter := policy.NewFixedWindowLimiter(time.Minute, map[string]int{httpsrv.ClientErrorRateCategory: 120}, time.Now)

	wsHandler := wsxport.NewHandler(dispatcher, ids, originValidator, ipExtractor, time.Now)

	app := &App{
		config:     cfg,
		logger:     logger,
		manager:    manager,
		sessions:   sessions,
		dispatcher: dispatcher,
		loop:       apploop.New(apploop.DefaultConfig(dispatcher)),
	}

	healthHandler := http.HandlerFunc(app.handleHealthz)
	app.httpMux = httpsrv.NewMux(httpsrv.Config{
		StaticRoot:       resolveStaticRoot(),
		HealthHandler:    healthHandler,
		WSHandler:        wsHandler,
		ErrorStore:       errorStore,
		ErrorRateLimiter: errorRateLimiter,
		IPExtractor:      ipExtractor,
		Now:              time.Now,
	})

	return app
}

func resolveStaticRoot() string {
	if staticRoot := os.Getenv("CLIENT_DIST_DIR"); staticRoot != "" {
		return staticRoot
	}

	defaultRoot := filepath.Join("client", "dist")
	info, err := os.Stat(defaultRoot)
	if err != nil || !info.IsDir() {
		return ""
	}

	if _, err := os.Stat(filepath.Join(defaultRoot, "index.html")); err != nil {
		if errors.Is(err, fs.ErrNotExist) {
			return ""
		}
		return ""
	}

	return defaultRoot
}

// Handler returns the HTTP mux (exposed for tests).
func (a *App) Handler() http.Handler { return a.httpMux }

// Run starts the loop and HTTP server until ctx is cancelled.
func (a *App) Run(ctx context.Context) error {
	a.logger.Printf("starting server on %s (%s)", a.config.ListenAddr(), a.config.Environment)

	listener, err := net.Listen("tcp", a.config.ListenAddr())
	if err != nil {
		return err
	}
	server := &http.Server{
		Handler:           a.httpMux,
		ReadHeaderTimeout: 5 * time.Second,
	}

	loopCtx, cancelLoop := context.WithCancel(ctx)
	var wg sync.WaitGroup
	wg.Add(1)
	go func() {
		defer wg.Done()
		a.loop.Run(loopCtx)
	}()

	serveErrCh := make(chan error, 1)
	go func() {
		err := server.Serve(listener)
		if err != nil && !errors.Is(err, http.ErrServerClosed) {
			serveErrCh <- err
			return
		}
		serveErrCh <- nil
	}()

	select {
	case <-ctx.Done():
		cancelLoop()
		shutdownCtx, cancel := context.WithTimeout(context.Background(), shutdownTimeout)
		defer cancel()
		_ = server.Shutdown(shutdownCtx)
		wg.Wait()
		<-serveErrCh
		a.logger.Printf("stopped server on %s", a.config.ListenAddr())
		return nil
	case err := <-serveErrCh:
		cancelLoop()
		wg.Wait()
		return err
	}
}

func (a *App) handleHealthz(w http.ResponseWriter, req *http.Request) {
	if req.Method != http.MethodGet {
		w.Header().Set("Allow", http.MethodGet)
		http.Error(w, "method not allowed", http.StatusMethodNotAllowed)
		return
	}
	w.Header().Set("Content-Type", "application/json; charset=utf-8")
	_ = json.NewEncoder(w).Encode(healthResponse{
		Status:      "ok",
		Environment: a.config.Environment,
		Port:        a.config.Port,
		Runtime:     "go",
		WebSocket:   "active",
		Gameplay:    "active",
	})
}
