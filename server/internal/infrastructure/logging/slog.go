// Package logging configures the structured logger used across the server.
package logging

import (
	"io"
	"log/slog"
	"os"
)

// New returns a slog.Logger configured for the given environment.
// Production uses JSON output; development uses human-readable text.
// When out is nil, os.Stdout is used.
func New(environment string, out io.Writer) *slog.Logger {
	if out == nil {
		out = os.Stdout
	}

	opts := &slog.HandlerOptions{Level: slog.LevelInfo}

	if environment == "production" {
		return slog.New(slog.NewJSONHandler(out, opts))
	}

	return slog.New(slog.NewTextHandler(out, opts))
}
