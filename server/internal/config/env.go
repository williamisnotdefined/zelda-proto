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

	defaultWSMaxConnections      = 200
	defaultWSMaxConnectionsPerIP = 12
	defaultWSInputRateLimit      = 65
	defaultWSSnapshotResyncLimit = 5
	defaultWSMaxRateViolations   = 15
	defaultWSMaxInvalidMessages  = 8
	defaultWSOutboxSize          = 64
	maxWSLimit                   = 100000
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
	TrustedProxyCIDRs        []string
	AllowedWSOrigins         []string
	WSMaxConnections         int
	WSMaxConnectionsPerIP    int
	WSInputRateLimit         int
	WSSnapshotResyncLimit    int
	WSMaxRateViolations      int
	WSMaxInvalidMessages     int
	WSOutboxSize             int
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
		Environment:       environment,
		Port:              defaultPort(environment),
		TrustProxy:        parseTruthyEnv("TRUST_PROXY"),
		TrustedProxyCIDRs: parseCIDRList(os.Getenv("TRUSTED_PROXY_CIDRS")),
		AllowedWSOrigins:  parseAllowedOrigins(os.Getenv("WS_ALLOWED_ORIGINS")),
		WSMaxConnections: parseBoundedInt(
			os.Getenv("WS_MAX_CONNECTIONS"), defaultWSMaxConnections, 1, maxWSLimit,
		),
		WSMaxConnectionsPerIP: parseBoundedInt(
			os.Getenv("WS_MAX_CONNECTIONS_PER_IP"), defaultWSMaxConnectionsPerIP, 1, maxWSLimit,
		),
		WSInputRateLimit: parseBoundedInt(
			os.Getenv("WS_INPUT_RATE_LIMIT"), defaultWSInputRateLimit, 1, maxWSLimit,
		),
		WSSnapshotResyncLimit: parseBoundedInt(
			os.Getenv("WS_SNAPSHOT_RESYNC_LIMIT"), defaultWSSnapshotResyncLimit, 1, maxWSLimit,
		),
		WSMaxRateViolations: parseBoundedInt(
			os.Getenv("WS_MAX_RATE_VIOLATIONS"), defaultWSMaxRateViolations, 1, maxWSLimit,
		),
		WSMaxInvalidMessages: parseBoundedInt(
			os.Getenv("WS_MAX_INVALID_MESSAGES"), defaultWSMaxInvalidMessages, 1, maxWSLimit,
		),
		WSOutboxSize: parseBoundedInt(
			os.Getenv("WS_OUTBOX_SIZE"), defaultWSOutboxSize, 1, maxWSLimit,
		),
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

func parseCIDRList(raw string) []string {
	if strings.TrimSpace(raw) == "" {
		return nil
	}
	values := make([]string, 0)
	seen := make(map[string]struct{})
	for _, part := range strings.Split(raw, ",") {
		value := strings.TrimSpace(part)
		if value == "" {
			continue
		}
		canonical := ""
		if ip := net.ParseIP(value); ip != nil {
			if ip.To4() != nil {
				canonical = ip.String() + "/32"
			} else {
				canonical = ip.String() + "/128"
			}
		} else if _, network, err := net.ParseCIDR(value); err == nil {
			canonical = network.String()
		}
		if canonical == "" {
			continue
		}
		if _, exists := seen[canonical]; exists {
			continue
		}
		seen[canonical] = struct{}{}
		values = append(values, canonical)
	}
	if len(values) == 0 {
		return nil
	}
	return values
}

func parseBoundedInt(raw string, fallback int, min int, max int) int {
	value, err := strconv.Atoi(strings.TrimSpace(raw))
	if err != nil || value < min || value > max {
		return fallback
	}
	return value
}
