// Package session manages resumable WebSocket sessions: token issuance,
// disconnect TTL, and protection against concurrent token reuse.
package session

import (
	"errors"
	"sync"
	"time"
)

// DefaultResumeTTL matches the legacy server default for how long a
// disconnected player may resume their session.
const DefaultResumeTTL = 20 * time.Second

// RejectReason explains why a resume attempt failed. Mirrors the wire-shape
// of the resume_rejected server message.
type RejectReason string

// Canonical rejection reasons.
const (
	RejectInvalidSession RejectReason = "invalid_session"
	RejectSessionInUse   RejectReason = "session_in_use"
)

// ErrUnknownPlayer is returned when an operation references a player that
// does not have a session.
var ErrUnknownPlayer = errors.New("session: unknown player")

// Clock returns the current time. Defaults to time.Now when nil is supplied.
type Clock func() time.Time

// TokenGenerator returns a fresh, unique session token.
type TokenGenerator interface {
	NewSessionToken() (string, error)
}

// ExpiryHandler is invoked when an unused session reaches the resume TTL.
type ExpiryHandler func(playerID string)

// Record is the immutable view of a session returned to callers.
type Record struct {
	Token    string
	PlayerID string
	Nickname string
}

// ResumeResult is the outcome of a TryResume attempt.
type ResumeResult struct {
	OK     bool
	Reason RejectReason
	Record Record
}

type sessionEntry struct {
	token          string
	playerID       string
	nickname       string
	connected      bool
	disconnectedAt time.Time
}

// Options customise a Manager.
type Options struct {
	ResumeTTL     time.Duration
	Clock         Clock
	OnExpired     ExpiryHandler
	TokenGenerator TokenGenerator
}

// Manager coordinates session lifecycles for active and resumable connections.
type Manager struct {
	resumeTTL time.Duration
	clock     Clock
	onExpire  ExpiryHandler
	generator TokenGenerator

	mu               sync.Mutex
	byToken          map[string]*sessionEntry
	tokenByPlayerID  map[string]string
}

// NewManager builds a Manager. A nil generator panics on first CreateSession.
func NewManager(opts Options) *Manager {
	ttl := opts.ResumeTTL
	if ttl <= 0 {
		ttl = DefaultResumeTTL
	}
	clock := opts.Clock
	if clock == nil {
		clock = time.Now
	}
	return &Manager{
		resumeTTL:       ttl,
		clock:           clock,
		onExpire:        opts.OnExpired,
		generator:       opts.TokenGenerator,
		byToken:         make(map[string]*sessionEntry),
		tokenByPlayerID: make(map[string]string),
	}
}

// CreateSession registers a session for playerID. If a session already exists
// for the player, the nickname is updated and the existing token is returned.
func (m *Manager) CreateSession(playerID, nickname string) (Record, error) {
	m.mu.Lock()
	defer m.mu.Unlock()

	m.purgeExpiredLocked()

	if existingToken, ok := m.tokenByPlayerID[playerID]; ok {
		entry := m.byToken[existingToken]
		entry.nickname = nickname
		entry.connected = true
		entry.disconnectedAt = time.Time{}
		return Record{Token: entry.token, PlayerID: entry.playerID, Nickname: entry.nickname}, nil
	}

	if m.generator == nil {
		return Record{}, errors.New("session: token generator not configured")
	}
	token, err := m.generator.NewSessionToken()
	if err != nil {
		return Record{}, err
	}

	entry := &sessionEntry{
		token:     token,
		playerID:  playerID,
		nickname:  nickname,
		connected: true,
	}
	m.byToken[token] = entry
	m.tokenByPlayerID[playerID] = token
	return Record{Token: token, PlayerID: playerID, Nickname: nickname}, nil
}

// MarkConnected re-attaches a session for an active connection. Returns
// ErrUnknownPlayer when the player has no session.
func (m *Manager) MarkConnected(playerID string) (Record, error) {
	m.mu.Lock()
	defer m.mu.Unlock()

	m.purgeExpiredLocked()

	entry, ok := m.lookupByPlayerLocked(playerID)
	if !ok {
		return Record{}, ErrUnknownPlayer
	}
	entry.connected = true
	entry.disconnectedAt = time.Time{}
	return Record{Token: entry.token, PlayerID: entry.playerID, Nickname: entry.nickname}, nil
}

// MarkDisconnected starts the resume window for the session.
func (m *Manager) MarkDisconnected(playerID string) (Record, error) {
	m.mu.Lock()
	defer m.mu.Unlock()

	m.purgeExpiredLocked()

	entry, ok := m.lookupByPlayerLocked(playerID)
	if !ok {
		return Record{}, ErrUnknownPlayer
	}
	entry.connected = false
	entry.disconnectedAt = m.clock()
	return Record{Token: entry.token, PlayerID: entry.playerID, Nickname: entry.nickname}, nil
}

// TryResume validates the token and re-attaches the session.
func (m *Manager) TryResume(token string) ResumeResult {
	m.mu.Lock()
	defer m.mu.Unlock()

	m.purgeExpiredLocked()

	entry, ok := m.byToken[token]
	if !ok {
		return ResumeResult{Reason: RejectInvalidSession}
	}
	if entry.connected {
		return ResumeResult{Reason: RejectSessionInUse}
	}
	entry.connected = true
	entry.disconnectedAt = time.Time{}
	return ResumeResult{
		OK: true,
		Record: Record{
			Token:    entry.token,
			PlayerID: entry.playerID,
			Nickname: entry.nickname,
		},
	}
}

// InvalidatePlayer removes the player's session immediately.
func (m *Manager) InvalidatePlayer(playerID string) {
	m.mu.Lock()
	defer m.mu.Unlock()

	entry, ok := m.lookupByPlayerLocked(playerID)
	if !ok {
		return
	}
	m.deleteLocked(entry)
}

// Tick advances time and purges any sessions whose resume TTL elapsed. Should
// be invoked from the simulation loop.
func (m *Manager) Tick() {
	m.mu.Lock()
	defer m.mu.Unlock()

	m.purgeExpiredLocked()
}

// Shutdown clears every session without firing expiry callbacks.
func (m *Manager) Shutdown() {
	m.mu.Lock()
	defer m.mu.Unlock()

	m.byToken = make(map[string]*sessionEntry)
	m.tokenByPlayerID = make(map[string]string)
}

// Token returns the current token for playerID, if any.
func (m *Manager) Token(playerID string) (string, bool) {
	m.mu.Lock()
	defer m.mu.Unlock()

	token, ok := m.tokenByPlayerID[playerID]
	return token, ok
}

func (m *Manager) lookupByPlayerLocked(playerID string) (*sessionEntry, bool) {
	token, ok := m.tokenByPlayerID[playerID]
	if !ok {
		return nil, false
	}
	entry, ok := m.byToken[token]
	return entry, ok
}

func (m *Manager) purgeExpiredLocked() {
	now := m.clock()
	for token, entry := range m.byToken {
		if entry.connected || entry.disconnectedAt.IsZero() {
			continue
		}
		if now.Sub(entry.disconnectedAt) <= m.resumeTTL {
			continue
		}
		delete(m.byToken, token)
		delete(m.tokenByPlayerID, entry.playerID)
		if m.onExpire != nil {
			m.onExpire(entry.playerID)
		}
	}
}

func (m *Manager) deleteLocked(entry *sessionEntry) {
	delete(m.byToken, entry.token)
	delete(m.tokenByPlayerID, entry.playerID)
}
