// Package wsapi adapts between the transport layer (raw msgpack frames) and
// the application layer (commands and snapshots). It owns the per-connection
// session lifecycle and converts domain snapshots into protocol envelopes.
package wsapi

import (
	"errors"
	"sync"
	"time"

	appinst "github.com/williamisnotdefined/zelda-proto/server/internal/application/instance"
	appsess "github.com/williamisnotdefined/zelda-proto/server/internal/application/session"
	appsnap "github.com/williamisnotdefined/zelda-proto/server/internal/application/snapshot"
	appworld "github.com/williamisnotdefined/zelda-proto/server/internal/application/world"
	"github.com/williamisnotdefined/zelda-proto/server/internal/codec"
	bossdom "github.com/williamisnotdefined/zelda-proto/server/internal/domain/boss"
	"github.com/williamisnotdefined/zelda-proto/server/internal/domain/drop"
	"github.com/williamisnotdefined/zelda-proto/server/internal/domain/enemy"
	"github.com/williamisnotdefined/zelda-proto/server/internal/domain/hazard"
	"github.com/williamisnotdefined/zelda-proto/server/internal/domain/physics"
	"github.com/williamisnotdefined/zelda-proto/server/internal/domain/player"
	"github.com/williamisnotdefined/zelda-proto/server/internal/domain/portal"
	domworld "github.com/williamisnotdefined/zelda-proto/server/internal/domain/world"
	"github.com/williamisnotdefined/zelda-proto/server/internal/protocol"
)

// Conn is the abstraction the dispatcher uses to send messages back to the
// client. Implemented by the transport layer.
type Conn interface {
	Send(payload []byte) error
	ConnectionID() string
}

// ErrNotJoined indicates an action requires a prior join.
var ErrNotJoined = errors.New("wsapi: not joined")

// forceFullSnapshotEveryTicks periodically resyncs clients with a full snapshot
// to guard against any silent delta divergence.
const forceFullSnapshotEveryTicks uint64 = uint64(domworld.NetTickRate) * 5

// PlayerIDFactory mints unique player ids on join.
type PlayerIDFactory interface {
	NewPlayerID() string
}

// Dispatcher routes ClientMessage instances into application calls and
// produces ServerMessage envelopes for the connection.
type Dispatcher struct {
	mu sync.Mutex

	manager   *appinst.Manager
	sessions  *appsess.Manager
	playerIDs PlayerIDFactory
	builder   *appsnap.Builder
	now       func() time.Time

	connections  map[string]*connState
	snapshotTick uint64
	forceFullFor map[string]bool
	lastInstance map[string]domworld.InstanceID
}

type connState struct {
	conn         Conn
	playerID     string
	sessionToken string
	joined       bool
}

// NewDispatcher constructs a dispatcher.
func NewDispatcher(manager *appinst.Manager, sessions *appsess.Manager, playerIDs PlayerIDFactory, now func() time.Time) *Dispatcher {
	if now == nil {
		now = time.Now
	}
	return &Dispatcher{
		manager:      manager,
		sessions:     sessions,
		playerIDs:    playerIDs,
		builder:      appsnap.NewBuilder(),
		now:          now,
		connections:  make(map[string]*connState),
		forceFullFor: make(map[string]bool),
		lastInstance: make(map[string]domworld.InstanceID),
	}
}

// Register attaches a transport connection.
func (d *Dispatcher) Register(conn Conn) {
	d.mu.Lock()
	defer d.mu.Unlock()
	d.connections[conn.ConnectionID()] = &connState{conn: conn}
}

// Disconnect releases the connection but keeps the session alive for resume.
func (d *Dispatcher) Disconnect(connID string) {
	d.mu.Lock()
	state, ok := d.connections[connID]
	if !ok {
		d.mu.Unlock()
		return
	}
	delete(d.connections, connID)
	d.mu.Unlock()

	if state.playerID != "" {
		d.builder.Forget(state.playerID)
		d.manager.SuspendPlayer(state.playerID)
		_, _ = d.sessions.MarkDisconnected(state.playerID)
	}
	d.mu.Lock()
	delete(d.forceFullFor, state.playerID)
	delete(d.lastInstance, state.playerID)
	d.mu.Unlock()
}

// HasJoined reports whether connID has already completed join/resume.
func (d *Dispatcher) HasJoined(connID string) bool {
	d.mu.Lock()
	defer d.mu.Unlock()
	state, ok := d.connections[connID]
	return ok && state.joined
}

// HandleSessionExpired removes the disconnected player whose resume window ran
// out and clears dispatcher-side snapshot bookkeeping.
func (d *Dispatcher) HandleSessionExpired(playerID string) {
	if playerID == "" {
		return
	}
	d.manager.RemovePlayer(playerID)
	d.builder.Forget(playerID)
	d.mu.Lock()
	delete(d.forceFullFor, playerID)
	delete(d.lastInstance, playerID)
	d.mu.Unlock()
}

// HandleJoin processes a join message.
func (d *Dispatcher) HandleJoin(connID string, msg protocol.JoinMessage) error {
	d.mu.Lock()
	state, ok := d.connections[connID]
	if !ok {
		d.mu.Unlock()
		return errors.New("wsapi: unknown connection")
	}
	if state.joined {
		d.mu.Unlock()
		return errors.New("wsapi: already joined")
	}
	d.mu.Unlock()

	playerID := d.playerIDs.NewPlayerID()
	rec, err := d.sessions.CreateSession(playerID, msg.Nickname)
	if err != nil {
		return err
	}
	_, _ = d.manager.AddPlayer(playerID, msg.Nickname)

	d.mu.Lock()
	state.joined = true
	state.playerID = playerID
	state.sessionToken = rec.Token
	d.mu.Unlock()

	welcome := protocol.BuildWelcome(playerID, rec.Token, false, 0, 0)
	return d.send(state.conn, welcome)
}

// HandleResume processes a resume_session message.
func (d *Dispatcher) HandleResume(connID string, msg protocol.ResumeSessionMessage) error {
	d.mu.Lock()
	state, ok := d.connections[connID]
	if !ok {
		d.mu.Unlock()
		return errors.New("wsapi: unknown connection")
	}
	if state.joined {
		d.mu.Unlock()
		return errors.New("wsapi: already joined")
	}
	d.mu.Unlock()

	res := d.sessions.TryResume(msg.SessionToken)
	if !res.OK {
		return d.send(state.conn, protocol.BuildResumeRejected(protocol.ResumeRejectedReason(res.Reason)))
	}
	loc, ok := d.manager.LocationOf(res.Record.PlayerID)
	if !ok {
		d.sessions.InvalidatePlayer(res.Record.PlayerID)
		return d.send(state.conn, protocol.BuildResumeRejected(protocol.ResumeRejectedReasonInvalidSession))
	}
	pl := d.manager.World(loc).Players()[res.Record.PlayerID]
	if pl == nil {
		d.sessions.InvalidatePlayer(res.Record.PlayerID)
		return d.send(state.conn, protocol.BuildResumeRejected(protocol.ResumeRejectedReasonInvalidSession))
	}

	d.mu.Lock()
	state.joined = true
	state.playerID = res.Record.PlayerID
	state.sessionToken = res.Record.Token
	d.mu.Unlock()

	welcome := protocol.BuildWelcome(res.Record.PlayerID, res.Record.Token, true, 0, 0)
	return d.send(state.conn, welcome)
}

// HandleInput forwards an input frame.
func (d *Dispatcher) HandleInput(connID string, msg protocol.InputMessage) error {
	state, ok := d.lookup(connID)
	if !ok || !state.joined {
		return ErrNotJoined
	}
	d.manager.HandleInput(state.playerID, player.Input{
		Seq:      msg.Seq,
		Up:       msg.Up,
		Down:     msg.Down,
		Left:     msg.Left,
		Right:    msg.Right,
		Attack:   msg.Attack,
		Wave:     msg.Wave,
		Numb:     msg.Numb,
		Dash:     msg.Dash,
		Fireball: msg.Fireball,
		Grenade:  msg.Grenade,
		Landmine: msg.Landmine,
	})
	return nil
}

// HandleChat forwards a chat broadcast to every connected player in the same
// authoritative instance as the sender.
func (d *Dispatcher) HandleChat(connID string, msg protocol.ChatMessage) error {
	state, ok := d.lookup(connID)
	if !ok || !state.joined {
		return ErrNotJoined
	}
	loc, _ := d.manager.LocationOf(state.playerID)
	pl := d.manager.World(loc).Players()[state.playerID]
	if pl == nil {
		return ErrNotJoined
	}
	envelope := protocol.BuildChatBroadcast(state.playerID, pl.Nickname, msg.Text, d.now().UnixMilli())
	d.broadcastToInstance(loc, envelope)
	return nil
}

// Sim drives a simulation tick (loop.Tickable).
func (d *Dispatcher) Sim(dt time.Duration) {
	d.manager.Tick(dt)
	d.sessions.Tick()
}

// Broadcast pushes a per-player snapshot to every joined connection. It uses
// snapshot_delta envelopes (full=true on first send / after Forget,
// incremental afterwards).
func (d *Dispatcher) Broadcast() {
	d.mu.Lock()
	conns := make([]*connState, 0, len(d.connections))
	for _, s := range d.connections {
		if s.joined {
			conns = append(conns, s)
		}
	}
	d.snapshotTick++
	tick := d.snapshotTick
	periodicFull := forceFullSnapshotEveryTicks > 0 && tick%forceFullSnapshotEveryTicks == 0
	d.mu.Unlock()

	for _, state := range conns {
		loc, ok := d.manager.LocationOf(state.playerID)
		if !ok {
			continue
		}
		w := d.manager.World(loc)
		view := w.Snapshot()
		pl := w.Players()[state.playerID]
		if pl == nil {
			continue
		}

		d.mu.Lock()
		prevInstance, hadPrev := d.lastInstance[state.playerID]
		instanceChanged := hadPrev && prevInstance != loc
		forceClient := d.forceFullFor[state.playerID]
		if instanceChanged || forceClient {
			d.builder.Forget(state.playerID)
			delete(d.forceFullFor, state.playerID)
		}
		d.mu.Unlock()

		if periodicFull {
			d.builder.Forget(state.playerID)
		}

		snap := d.builder.Build(view, pl, loc)
		delta := d.builder.Diff(state.playerID, snap)
		delta.Tick = tick
		envelope := buildSnapshotDeltaEnvelope(delta)
		if err := d.send(state.conn, envelope); err == nil {
			d.mu.Lock()
			d.lastInstance[state.playerID] = loc
			d.mu.Unlock()
		}
	}
}

// HandleSnapshotResync marks the player so the next Broadcast emits a full
// snapshot.
func (d *Dispatcher) HandleSnapshotResync(connID string, _ protocol.SnapshotResyncMessage) error {
	state, ok := d.lookup(connID)
	if !ok || !state.joined {
		return ErrNotJoined
	}
	d.mu.Lock()
	d.forceFullFor[state.playerID] = true
	d.mu.Unlock()
	return nil
}

// PublishLeaderboard broadcasts a per-instance leaderboard message to each
// connection.
func (d *Dispatcher) PublishLeaderboard() {
	d.mu.Lock()
	conns := make([]*connState, 0, len(d.connections))
	for _, s := range d.connections {
		if s.joined {
			conns = append(conns, s)
		}
	}
	d.mu.Unlock()

	// Cache per-instance leaderboards so we don't recompute per connection.
	boards := make(map[string]codec.Object)
	for _, state := range conns {
		loc, ok := d.manager.LocationOf(state.playerID)
		if !ok {
			continue
		}
		key := string(loc)
		envelope, ok := boards[key]
		if !ok {
			w := d.manager.World(loc)
			players := []*player.Player{}
			for _, p := range w.Players() {
				players = append(players, p)
			}
			entries := appsnap.Leaderboard(players, appsnap.LeaderboardTopN)
			wire := make([]protocol.LeaderboardEntry, 0, len(entries))
			for _, e := range entries {
				wire = append(wire, protocol.LeaderboardEntry{
					PlayerID: e.PlayerID, Nickname: e.Nickname,
					MonsterKills: e.MonsterKills, PlayerKills: e.PlayerKills,
					Deaths: e.Deaths,
				})
			}
			envelope = protocol.BuildLeaderboard(wire)
			boards[key] = envelope
		}
		_ = d.send(state.conn, envelope)
	}
}

func (d *Dispatcher) lookup(connID string) (*connState, bool) {
	d.mu.Lock()
	defer d.mu.Unlock()
	state, ok := d.connections[connID]
	return state, ok
}

func (d *Dispatcher) broadcast(envelope codec.Object) {
	d.mu.Lock()
	conns := make([]*connState, 0, len(d.connections))
	for _, s := range d.connections {
		if s.joined {
			conns = append(conns, s)
		}
	}
	d.mu.Unlock()
	for _, c := range conns {
		_ = d.send(c.conn, envelope)
	}
}

func (d *Dispatcher) broadcastToInstance(instance domworld.InstanceID, envelope codec.Object) {
	d.mu.Lock()
	conns := make([]*connState, 0, len(d.connections))
	for _, s := range d.connections {
		if s.joined {
			conns = append(conns, s)
		}
	}
	d.mu.Unlock()
	for _, c := range conns {
		loc, ok := d.manager.LocationOf(c.playerID)
		if !ok || loc != instance {
			continue
		}
		_ = d.send(c.conn, envelope)
	}
}

func (d *Dispatcher) send(conn Conn, envelope codec.Object) error {
	data, err := codec.Marshal(envelope)
	if err != nil {
		return err
	}
	return conn.Send(data)
}

func playerObj(p player.Snapshot) codec.Object {
	statusEffects := codec.Object{}
	for kind, st := range p.StatusEffects {
		statusEffects = append(statusEffects, codec.Field{
			Key: string(kind),
			Value: codec.Object{
				{Key: "ticksRemaining", Value: st.TicksRemaining},
			},
		})
	}
	return codec.Object{
		{Key: "id", Value: p.ID},
		{Key: "nickname", Value: p.Nickname},
		{Key: "x", Value: physics.QuantizePosition(p.X)},
		{Key: "y", Value: physics.QuantizePosition(p.Y)},
		{Key: "hp", Value: p.HP},
		{Key: "maxHp", Value: p.MaxHP},
		{Key: "state", Value: string(p.State)},
		{Key: "direction", Value: string(p.Direction)},
		{Key: "playerKills", Value: p.PlayerKills},
		{Key: "monsterKills", Value: p.MonsterKills},
		{Key: "deaths", Value: p.Deaths},
		{Key: "toastyCount", Value: p.ToastyCount},
		{Key: "lastProcessedInputSeq", Value: p.LastProcessedInputSeq},
		{Key: "statusEffects", Value: statusEffects},
		{Key: "equippedWeapon", Value: string(p.EquippedWeapon)},
	}
}

func enemyObj(e enemy.Snapshot) codec.Object {
	obj := codec.Object{
		{Key: "id", Value: e.ID}, {Key: "kind", Value: string(e.Kind)},
		{Key: "x", Value: physics.QuantizePosition(e.X)},
		{Key: "y", Value: physics.QuantizePosition(e.Y)},
		{Key: "hp", Value: e.HP}, {Key: "maxHp", Value: e.MaxHP},
		{Key: "state", Value: string(e.State)},
	}
	if e.Variant != "" {
		obj = append(obj, codec.Field{Key: "variant", Value: string(e.Variant)})
	}
	return obj
}

func enemyTransformObj(t appsnap.EnemyTransform) codec.Object {
	return codec.Object{
		{Key: "id", Value: t.ID},
		{Key: "x", Value: physics.QuantizePosition(t.X)},
		{Key: "y", Value: physics.QuantizePosition(t.Y)},
	}
}

func enemyStateObj(s appsnap.EnemyState) codec.Object {
	return codec.Object{
		{Key: "id", Value: s.ID},
		{Key: "hp", Value: s.HP},
		{Key: "maxHp", Value: s.MaxHP},
		{Key: "state", Value: string(s.State)},
	}
}

func bossObj(b appworld.BossSnapshot) codec.Object {
	obj := codec.Object{
		{Key: "id", Value: b.ID}, {Key: "kind", Value: string(b.Kind)},
		{Key: "x", Value: b.X}, {Key: "y", Value: b.Y},
		{Key: "hp", Value: b.HP}, {Key: "maxHp", Value: b.MaxHP},
		{Key: "state", Value: string(b.State)}, {Key: "phase", Value: b.Phase},
	}
	if b.HasTarget {
		obj = append(obj,
			codec.Field{Key: "targetX", Value: b.TargetX},
			codec.Field{Key: "targetY", Value: b.TargetY},
		)
	}
	if b.HasSpeech {
		obj = append(obj,
			codec.Field{Key: "speechText", Value: b.SpeechText},
			codec.Field{Key: "speechColor", Value: b.SpeechColor},
		)
	}
	return obj
}

func dropObj(d drop.Snapshot) codec.Object {
	return codec.Object{
		{Key: "id", Value: d.ID}, {Key: "kind", Value: string(d.Kind)},
		{Key: "x", Value: d.X}, {Key: "y", Value: d.Y},
	}
}

func portalObj(pt portal.Snapshot) codec.Object {
	return codec.Object{
		{Key: "id", Value: pt.ID}, {Key: "kind", Value: string(pt.Kind)},
		{Key: "x", Value: pt.X}, {Key: "y", Value: pt.Y},
	}
}

func hazardObj(h hazard.Snapshot) codec.Object {
	obj := codec.Object{
		{Key: "id", Value: h.ID}, {Key: "kind", Value: string(h.Kind)},
		{Key: "x", Value: h.X}, {Key: "y", Value: h.Y},
		{Key: "ttlMs", Value: h.TTLMs},
	}
	if h.Tint != 0 {
		obj = append(obj, codec.Field{Key: "tint", Value: int64(h.Tint)})
	}
	if h.Direction != "" {
		obj = append(obj, codec.Field{Key: "direction", Value: string(h.Direction)})
	}
	return obj
}

func iceZoneObj(z bossdom.IceZone) codec.Object {
	return codec.Object{
		{Key: "x", Value: z.X}, {Key: "y", Value: z.Y},
		{Key: "width", Value: z.Width}, {Key: "height", Value: z.Height},
	}
}

func aoeIndicatorObj(a bossdom.AOEIndicator) codec.Object {
	return codec.Object{
		{Key: "ownerId", Value: a.OwnerID},
		{Key: "x", Value: a.X}, {Key: "y", Value: a.Y},
		{Key: "radius", Value: a.Radius},
		{Key: "timer", Value: int64(a.Timer.Milliseconds())},
		{Key: "hit", Value: a.Hit},
	}
}

func waveIndicatorObj(w bossdom.WaveIndicator) codec.Object {
	return codec.Object{
		{Key: "ownerId", Value: w.OwnerID},
		{Key: "x", Value: w.X}, {Key: "y", Value: w.Y},
		{Key: "radius", Value: w.Radius},
		{Key: "state", Value: string(w.State)},
		{Key: "kind", Value: string(w.Kind)},
	}
}

func mapObjects[T any](items []T, fn func(T) codec.Object) []codec.Object {
	out := make([]codec.Object, 0, len(items))
	for _, it := range items {
		out = append(out, fn(it))
	}
	return out
}

func buildSnapshotDeltaEnvelope(delta appsnap.Delta) codec.Object {
	players := make([]codec.Object, 0, len(delta.PlayersUpsert)+1)
	players = append(players, playerObj(delta.Self))
	for _, p := range delta.PlayersUpsert {
		players = append(players, playerObj(p))
	}
	in := protocol.SnapshotDeltaInput{
		Tick:             delta.Tick,
		Full:             delta.Full,
		Instance:         protocol.InstanceID(delta.Instance),
		Players:          players,
		RemovedPlayerIDs: delta.PlayersRemove,
		Enemies:          mapObjects(delta.EnemiesUpsert, enemyObj),
		EnemyTransforms:  mapObjects(delta.EnemyTransforms, enemyTransformObj),
		EnemyStates:      mapObjects(delta.EnemyStates, enemyStateObj),
		RemovedEnemyIDs:  delta.EnemiesRemove,
		Bosses:           mapObjects(delta.BossesUpsert, bossObj),
		RemovedBossIDs:   delta.BossesRemove,
		Drops:            mapObjects(delta.DropsUpsert, dropObj),
		RemovedDropIDs:   delta.DropsRemove,
		Portals:          mapObjects(delta.PortalsUpsert, portalObj),
		RemovedPortalIDs: delta.PortalsRemove,
		Hazards:          mapObjects(delta.HazardsUpsert, hazardObj),
		RemovedHazardIDs: delta.HazardsRemove,
		IceZones:         mapObjects(delta.IceZones, iceZoneObj),
		AoeIndicators:    mapObjects(delta.AOEIndicators, aoeIndicatorObj),
		WaveIndicators:   mapObjects(delta.WaveIndicators, waveIndicatorObj),
	}
	return protocol.BuildSnapshotDelta(in)
}

// buildSnapshotEnvelope constructs the full-snapshot envelope; used by tests
// and as a fallback. Production traffic flows through
// buildSnapshotDeltaEnvelope.
func buildSnapshotEnvelope(snap appsnap.Snapshot) codec.Object {
	players := make([]codec.Object, 0, len(snap.Players)+1)
	players = append(players, playerObj(snap.Self))
	for _, p := range snap.Players {
		players = append(players, playerObj(p))
	}
	return protocol.BuildSnapshot(
		protocol.InstanceID(snap.Instance),
		players,
		mapObjects(snap.Enemies, enemyObj),
		mapObjects(snap.Bosses, bossObj),
		mapObjects(snap.Drops, dropObj),
		mapObjects(snap.Portals, portalObj),
		mapObjects(snap.Hazards, hazardObj),
		mapObjects(snap.IceZones, iceZoneObj),
		mapObjects(snap.AOEIndicators, aoeIndicatorObj),
		mapObjects(snap.WaveIndicators, waveIndicatorObj),
	)
}
