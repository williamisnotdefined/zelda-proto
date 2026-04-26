// Package policy enforces request-level access controls: origin allowlists,
// trusted-proxy IP extraction, and token-bucket rate limits.
package policy

import (
	"net"
	"net/http"
	"net/url"
	"strings"

	"github.com/williamisnotdefined/zelda-proto/server_go/internal/config"
)

// OriginValidator decides whether a WebSocket upgrade request is permitted
// based on its Origin header.
type OriginValidator struct {
	allowed       map[string]struct{}
	allowLoopback bool
}

// NewOriginValidator builds an OriginValidator from the runtime config.
// When the explicit allowlist is empty, requests whose Origin host matches the
// request Host are accepted, plus loopback origins in non-production mode.
func NewOriginValidator(cfg config.Config) *OriginValidator {
	allowed := make(map[string]struct{}, len(cfg.AllowedWSOrigins))
	for _, origin := range cfg.AllowedWSOrigins {
		allowed[origin] = struct{}{}
	}

	return &OriginValidator{
		allowed:       allowed,
		allowLoopback: cfg.IsDevelopment(),
	}
}

// Allow reports whether the upgrade request is permitted.
func (v *OriginValidator) Allow(req *http.Request) bool {
	origin := firstHeaderValue(req.Header, "Origin")
	if origin == "" {
		return true
	}

	parsed, err := url.Parse(origin)
	if err != nil || parsed.Scheme == "" || parsed.Host == "" {
		return false
	}

	canonicalOrigin := parsed.Scheme + "://" + parsed.Host
	if len(v.allowed) > 0 {
		_, ok := v.allowed[canonicalOrigin]
		return ok
	}

	if requestHost := hostnameOf(firstHeaderValue(req.Header, "Host")); requestHost != "" {
		if requestHost == parsed.Hostname() {
			return true
		}
	}

	return v.allowLoopback && isLoopbackHostname(parsed.Hostname())
}

// IPExtractor obtains the originating client IP address, optionally honoring
// the X-Forwarded-For header when the server runs behind a trusted proxy.
type IPExtractor struct {
	trustProxy bool
}

// NewIPExtractor returns an extractor configured from the runtime config.
func NewIPExtractor(cfg config.Config) *IPExtractor {
	return &IPExtractor{trustProxy: cfg.TrustProxy}
}

// Extract returns the client IP for the request. When the extractor trusts
// proxies and X-Forwarded-For is present, the leftmost address is returned;
// otherwise the remote socket address is used.
func (e *IPExtractor) Extract(req *http.Request) string {
	if e.trustProxy {
		if forwarded := firstHeaderValue(req.Header, "X-Forwarded-For"); forwarded != "" {
			head := forwarded
			if comma := strings.Index(forwarded, ","); comma >= 0 {
				head = forwarded[:comma]
			}
			if ip := strings.TrimSpace(head); ip != "" {
				return ip
			}
		}
	}

	if req.RemoteAddr == "" {
		return "unknown"
	}

	host, _, err := net.SplitHostPort(req.RemoteAddr)
	if err != nil {
		return req.RemoteAddr
	}
	return host
}

func firstHeaderValue(header http.Header, key string) string {
	for _, value := range header.Values(key) {
		trimmed := strings.TrimSpace(value)
		if trimmed != "" {
			return trimmed
		}
	}
	return ""
}

func hostnameOf(host string) string {
	if host == "" {
		return ""
	}
	parsed, err := url.Parse("http://" + host)
	if err != nil {
		return ""
	}
	return parsed.Hostname()
}

func isLoopbackHostname(hostname string) bool {
	switch hostname {
	case "localhost", "127.0.0.1", "::1", "[::1]":
		return true
	}
	return false
}
