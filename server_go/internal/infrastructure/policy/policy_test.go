package policy

import (
	"net/http"
	"net/http/httptest"
	"testing"
	"time"

	"github.com/williamisnotdefined/zelda-proto/server_go/internal/config"
)

func makeRequest(t *testing.T, headers map[string]string, remoteAddr string) *http.Request {
	t.Helper()
	req := httptest.NewRequest(http.MethodGet, "/ws", nil)
	req.RemoteAddr = remoteAddr
	for key, value := range headers {
		req.Header.Set(key, value)
	}
	return req
}

func TestOriginValidatorAllowsRequestsWithoutOriginHeader(t *testing.T) {
	t.Parallel()

	validator := NewOriginValidator(config.Config{Environment: "production"})
	if !validator.Allow(makeRequest(t, nil, "10.0.0.1:1234")) {
		t.Fatal("expected request without origin to be allowed")
	}
}

func TestOriginValidatorRejectsMalformedOrigin(t *testing.T) {
	t.Parallel()

	validator := NewOriginValidator(config.Config{Environment: "production"})
	req := makeRequest(t, map[string]string{"Origin": "::not-a-url"}, "10.0.0.1:1234")
	if validator.Allow(req) {
		t.Fatal("expected malformed origin to be rejected")
	}
}

func TestOriginValidatorAllowsExplicitAllowlist(t *testing.T) {
	t.Parallel()

	validator := NewOriginValidator(config.Config{
		Environment:      "production",
		AllowedWSOrigins: []string{"https://example.com"},
	})

	req := makeRequest(t, map[string]string{"Origin": "https://example.com"}, "10.0.0.1:1234")
	if !validator.Allow(req) {
		t.Fatal("expected allowlisted origin to be permitted")
	}

	denied := makeRequest(t, map[string]string{"Origin": "https://other.com"}, "10.0.0.1:1234")
	if validator.Allow(denied) {
		t.Fatal("expected non-allowlisted origin to be rejected")
	}
}

func TestOriginValidatorAllowsLoopbackInDevelopment(t *testing.T) {
	t.Parallel()

	validator := NewOriginValidator(config.Config{Environment: "development"})
	req := makeRequest(t, map[string]string{"Origin": "http://localhost:5173"}, "127.0.0.1:1234")
	if !validator.Allow(req) {
		t.Fatal("expected loopback origin to be permitted in development")
	}
}

func TestOriginValidatorRejectsLoopbackInProduction(t *testing.T) {
	t.Parallel()

	validator := NewOriginValidator(config.Config{Environment: "production"})
	req := makeRequest(t, map[string]string{"Origin": "http://localhost:5173"}, "127.0.0.1:1234")
	if validator.Allow(req) {
		t.Fatal("expected loopback origin to be rejected in production")
	}
}

func TestOriginValidatorMatchesHostHeader(t *testing.T) {
	t.Parallel()

	validator := NewOriginValidator(config.Config{Environment: "production"})
	req := makeRequest(t, map[string]string{
		"Origin": "https://wilho.com.br",
		"Host":   "wilho.com.br",
	}, "10.0.0.1:1234")
	if !validator.Allow(req) {
		t.Fatal("expected matching host to be permitted")
	}
}

func TestIPExtractorRespectsRemoteAddressByDefault(t *testing.T) {
	t.Parallel()

	extractor := NewIPExtractor(config.Config{})
	req := makeRequest(t, map[string]string{"X-Forwarded-For": "1.2.3.4"}, "10.0.0.1:1234")
	if got := extractor.Extract(req); got != "10.0.0.1" {
		t.Fatalf("expected remote ip, got %q", got)
	}
}

func TestIPExtractorTrustsForwardedHeader(t *testing.T) {
	t.Parallel()

	extractor := NewIPExtractor(config.Config{TrustProxy: true})
	req := makeRequest(t, map[string]string{"X-Forwarded-For": "1.2.3.4, 10.0.0.5"}, "10.0.0.1:1234")
	if got := extractor.Extract(req); got != "1.2.3.4" {
		t.Fatalf("expected forwarded ip, got %q", got)
	}
}

func TestIPExtractorFallsBackToRemoteAddrWhenForwardedEmpty(t *testing.T) {
	t.Parallel()

	extractor := NewIPExtractor(config.Config{TrustProxy: true})
	req := makeRequest(t, nil, "10.0.0.1:1234")
	if got := extractor.Extract(req); got != "10.0.0.1" {
		t.Fatalf("expected remote ip, got %q", got)
	}
}

func TestIPExtractorReturnsUnknownWhenRemoteEmpty(t *testing.T) {
	t.Parallel()

	extractor := NewIPExtractor(config.Config{})
	req := httptest.NewRequest(http.MethodGet, "/ws", nil)
	req.RemoteAddr = ""
	if got := extractor.Extract(req); got != "unknown" {
		t.Fatalf("expected unknown, got %q", got)
	}
}

func TestIPExtractorReturnsRawAddrWhenSplitFails(t *testing.T) {
	t.Parallel()

	extractor := NewIPExtractor(config.Config{})
	req := httptest.NewRequest(http.MethodGet, "/ws", nil)
	req.RemoteAddr = "garbage-without-port"
	if got := extractor.Extract(req); got != "garbage-without-port" {
		t.Fatalf("expected raw addr, got %q", got)
	}
}

func TestFixedWindowLimiterAllowsBelowQuotaAndResets(t *testing.T) {
	t.Parallel()

	now := time.Date(2026, 1, 1, 0, 0, 0, 0, time.UTC)
	limiter := NewFixedWindowLimiter(time.Second, map[string]int{"input": 2}, func() time.Time { return now })

	if !limiter.Allow("input") {
		t.Fatal("expected first call to be allowed")
	}
	if !limiter.Allow("input") {
		t.Fatal("expected second call to be allowed")
	}
	if limiter.Allow("input") {
		t.Fatal("expected third call to be rate limited")
	}

	now = now.Add(2 * time.Second)
	if !limiter.Allow("input") {
		t.Fatal("expected new window to allow call")
	}
}

func TestFixedWindowLimiterAllowsUnknownCategories(t *testing.T) {
	t.Parallel()

	limiter := NewFixedWindowLimiter(time.Second, map[string]int{"input": 1}, nil)
	if !limiter.Allow("chat") {
		t.Fatal("expected unknown category to be allowed")
	}
}

func TestFixedWindowLimiterDefaultsToTimeNowClock(t *testing.T) {
	t.Parallel()

	limiter := NewFixedWindowLimiter(time.Hour, map[string]int{"input": 1}, nil)
	if !limiter.Allow("input") {
		t.Fatal("expected first allow to succeed under default clock")
	}
}

func TestIPConnectionTrackerLimits(t *testing.T) {
	t.Parallel()

	tracker := NewIPConnectionTracker(3, 2)
	if !tracker.Acquire("1.1.1.1") {
		t.Fatal("expected first acquire to succeed")
	}
	if !tracker.Acquire("1.1.1.1") {
		t.Fatal("expected second acquire from same ip to succeed")
	}
	if tracker.Acquire("1.1.1.1") {
		t.Fatal("expected third acquire from same ip to be rejected")
	}

	if !tracker.Acquire("2.2.2.2") {
		t.Fatal("expected acquire from another ip to succeed")
	}
	if tracker.Acquire("3.3.3.3") {
		t.Fatal("expected acquire to fail when global cap reached")
	}

	tracker.Release("1.1.1.1")
	if got := tracker.Count("1.1.1.1"); got != 1 {
		t.Fatalf("expected count 1, got %d", got)
	}
	if got := tracker.Total(); got != 2 {
		t.Fatalf("expected total 2, got %d", got)
	}

	tracker.Release("1.1.1.1")
	if got := tracker.Count("1.1.1.1"); got != 0 {
		t.Fatalf("expected count cleaned up, got %d", got)
	}
	tracker.Release("1.1.1.1")
	if got := tracker.Total(); got != 1 {
		t.Fatalf("expected total clamped at 1, got %d", got)
	}
}
