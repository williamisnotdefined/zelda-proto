package app

import (
	"context"
	"encoding/json"
	"errors"
	"log"
	"net"
	"net/http"
	"time"

	"github.com/williamisnotdefined/zelda-proto/server_go/internal/config"
)

const shutdownTimeout = 5 * time.Second

type App struct {
	config  config.Config
	logger  *log.Logger
	handler http.Handler
}

type healthResponse struct {
	Status      string `json:"status"`
	Environment string `json:"environment"`
	Port        int    `json:"port"`
	Runtime     string `json:"runtime"`
	WebSocket   string `json:"webSocket"`
	Gameplay    string `json:"gameplay"`
}

func New(cfg config.Config, logger *log.Logger) *App {
	if logger == nil {
		logger = log.Default()
	}

	app := &App{
		config: cfg,
		logger: logger,
	}
	app.handler = app.routes()
	return app
}

func (a *App) Handler() http.Handler {
	return a.handler
}

func (a *App) Run(ctx context.Context) error {
	a.logger.Printf("starting scaffold server on %s (%s)", a.config.ListenAddr(), a.config.Environment)

	listener, err := net.Listen("tcp", a.config.ListenAddr())
	if err != nil {
		return err
	}

	server := &http.Server{
		Handler:           a.handler,
		ReadHeaderTimeout: 5 * time.Second,
	}

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
		shutdownCtx, cancel := context.WithTimeout(context.Background(), shutdownTimeout)
		defer cancel()
		if err := server.Shutdown(shutdownCtx); err != nil && !errors.Is(err, http.ErrServerClosed) {
			return err
		}
		if err := <-serveErrCh; err != nil {
			return err
		}
	case err := <-serveErrCh:
		if err != nil {
			return err
		}
	}

	a.logger.Printf("stopped scaffold server on %s", a.config.ListenAddr())
	return nil
}

func (a *App) routes() http.Handler {
	mux := http.NewServeMux()
	mux.HandleFunc("/healthz", a.handleHealthz)
	return mux
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
		Runtime:     "scaffold",
		WebSocket:   "stub",
		Gameplay:    "stub",
	})
}
