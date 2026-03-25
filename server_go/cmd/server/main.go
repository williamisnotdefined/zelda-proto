package main

import (
	"context"
	"log"
	"os"
	"os/signal"
	"syscall"

	"github.com/williamisnotdefined/zelda-proto/server_go/internal/app"
	"github.com/williamisnotdefined/zelda-proto/server_go/internal/config"
)

func main() {
	cfg := config.LoadFromEnv()
	application := app.New(cfg, log.New(os.Stdout, "[server_go] ", log.LstdFlags))

	ctx, stop := signal.NotifyContext(context.Background(), os.Interrupt, syscall.SIGTERM)
	defer stop()

	if err := application.Run(ctx); err != nil {
		log.Fatal(err)
	}
}
