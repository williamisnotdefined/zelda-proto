package config

import (
	"net"
	"os"
	"strconv"
	"strings"
)

const (
  defaultDevPort  = 3003
	defaultProdPort = 3001
	maxPort         = 65535

	defaultDevStressEnemiesPerChunk = 0
	minDevStressEnemiesPerChunk     = 1
	maxDevStressEnemiesPerChunk     = 400
)

var truthyValues = map[string]struct{}{
	"1":    {},
	"true": {},
	"yes":  {},
}

type Config struct {
	Environment              string
	Port                     int
	TrustProxy               bool
	AllowedWSOrigins         []string
	DebugGameMetrics         bool
	DevStartPhase            string
	DevStressEnemiesPerChunk int
}

func LoadFromEnv() Config {
	environment := strings.TrimSpace(os.Getenv("NODE_ENV"))
	if environment == "" {
		environment = "development"
	}

	config := Config{
		Environment:      environment,
		Port:             defaultPort(environment),
		TrustProxy:       parseTruthyEnv("TRUST_PROXY"),
		AllowedWSOrigins: parseAllowedOrigins(os.Getenv("WS_ALLOWED_ORIGINS")),
		DebugGameMetrics: strings.TrimSpace(os.Getenv("DEBUG_GAME_METRICS")) == "1",
	}

	if port := parsePort(os.Getenv("PORT")); port > 0 {
		config.Port = port
	}

	if config.IsDevelopment() {
		config.DevStartPhase = strings.ToLower(strings.TrimSpace(os.Getenv("DEV_START_PHASE")))
		config.DevStressEnemiesPerChunk = parseBoundedInt(
			os.Getenv("DEV_STRESS_ENEMIES_PER_CHUNK"),
			defaultDevStressEnemiesPerChunk,
			minDevStressEnemiesPerChunk,
			maxDevStressEnemiesPerChunk,
		)
	}

	return config
}

func (c Config) IsDevelopment() bool {
	return c.Environment != "production"
}

func (c Config) ListenAddr() string {
	return net.JoinHostPort("", strconv.Itoa(c.Port))
}

func defaultPort(environment string) int {
	if environment == "production" {
		return defaultProdPort
	}
	return defaultDevPort
}

func parseTruthyEnv(key string) bool {
	_, ok := truthyValues[strings.ToLower(strings.TrimSpace(os.Getenv(key)))]
	return ok
}

func parsePort(raw string) int {
	port, err := strconv.Atoi(strings.TrimSpace(raw))
	if err != nil || port < 1 || port > maxPort {
		return 0
	}
	return port
}

func parseAllowedOrigins(raw string) []string {
	if strings.TrimSpace(raw) == "" {
		return nil
	}

	origins := make([]string, 0)
	seen := make(map[string]struct{})
	for _, part := range strings.Split(raw, ",") {
		origin := strings.TrimSpace(part)
		if origin == "" {
			continue
		}
		if _, exists := seen[origin]; exists {
			continue
		}
		seen[origin] = struct{}{}
		origins = append(origins, origin)
	}

	if len(origins) == 0 {
		return nil
	}

	return origins
}

func parseBoundedInt(raw string, fallback int, min int, max int) int {
	value, err := strconv.Atoi(strings.TrimSpace(raw))
	if err != nil || value < min || value > max {
		return fallback
	}
	return value
}
