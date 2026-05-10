// Package wsapi adapts between the transport layer (raw msgpack frames) and
// the application layer (commands and snapshots). It owns the per-connection
// session lifecycle and converts domain snapshots into protocol envelopes.
package wsapi

import (
	"errors"
	"sync"
	"sync/atomic"
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
	"github.com/williamisnotdefined/zelda-proto/server/internal/observability"
	"github.com/williamisnotdefined/zelda-proto/server/internal/protocol"
)

// Conn is the abstraction the dispatcher uses to send messages back to the
// client. Implemented by the transport layer.
type Conn interface {
	Send(payload []byte) error
	ConnectionID() string
}

type slowConsumerCloser interface {
	CloseSlowConsumer()
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
	metrics   *observability.RuntimeMetrics

	connections  map[string]*connState
	snapshotTick uint64
	forceFullFor map[string]bool
	lastInstance map[string]domworld.InstanceID
}

// SetMetrics attaches optional process-local runtime counters.
func (d *Dispatcher) SetMetrics(metrics *observability.RuntimeMetrics) {
	d.mu.Lock()
	defer d.mu.Unlock()
	d.metrics = metrics
}

type connState struct {
	conn              Conn
	playerID          string
	sessionToken      string
	joined            bool
	fullSnapshotHint  atomic.Int64
	deltaSnapshotHint atomic.Int64
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
		Seq:         msg.Seq,
		Up:          msg.Up,
		Down:        msg.Down,
		Left:        msg.Left,
		Right:       msg.Right,
		Wave:        msg.Wave,
		Numb:        msg.Numb,
		Pull:        msg.Pull,
		Venom:       msg.Venom,
		Confusion:   msg.Confusion,
		Dash:        msg.Dash,
		Grenade:     msg.Grenade,
		Molotov:     msg.Molotov,
		Landmine:    msg.Landmine,
		Shuriken:    msg.Shuriken,
		SpikedBalls: msg.SpikedBalls,
	})
	return nil
}

// Sim drives a simulation tick (loop.Tickable).
func (d *Dispatcher) Sim(dt time.Duration) {
	start := time.Now()
	d.manager.Tick(dt)
	d.sessions.Tick()
	d.metricsSnapshot().SimTick(time.Since(start))
}

// Broadcast pushes a per-player snapshot to every joined connection. It uses
// snapshot_delta envelopes (full=true on first send / after Forget,
// incremental afterwards).
func (d *Dispatcher) Broadcast() {
	start := time.Now()
	defer func() { d.metricsSnapshot().Broadcast(time.Since(start)) }()

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

	views := make(map[domworld.InstanceID]appworld.SnapshotView)
	wires := make(map[domworld.InstanceID]*wireCache)
	for _, state := range conns {
		loc, ok := d.manager.LocationOf(state.playerID)
		if !ok {
			continue
		}
		view, ok := views[loc]
		if !ok {
			w := d.manager.World(loc)
			view = w.Snapshot()
			views[loc] = view
			wires[loc] = newWireCache(view)
		}
		self, ok := findPlayerSnapshot(view.Players, state.playerID)
		if !ok {
			continue
		}

		d.mu.Lock()
		prevInstance, hadPrev := d.lastInstance[state.playerID]
		instanceChanged := hadPrev && prevInstance != loc
		forceClient := d.forceFullFor[state.playerID]
		if instanceChanged || forceClient {
			delete(d.forceFullFor, state.playerID)
		}
		d.mu.Unlock()
		if instanceChanged || forceClient {
			d.builder.Forget(state.playerID)
		}

		if periodicFull {
			d.builder.Forget(state.playerID)
		}

		snap := d.builder.Build(view, self, loc)
		pending := d.builder.Preview(state.playerID, snap)
		pending.Delta.Tick = tick
		envelope := buildSnapshotDeltaEnvelope(pending.Delta, wires[loc])
		if err := d.sendSnapshot(state, envelope, pending.Delta.Full); err == nil {
			d.builder.Commit(pending)
			d.metricsSnapshot().SnapshotDelta(pending.Delta.Full)
			d.mu.Lock()
			d.lastInstance[state.playerID] = loc
			d.mu.Unlock()
		} else {
			d.handleSendFailure(state)
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
	start := time.Now()
	defer func() { d.metricsSnapshot().Leaderboard(time.Since(start)) }()

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
			entries := appsnap.LeaderboardFromSnapshots(w.PlayerSnapshots(), appsnap.LeaderboardTopN)
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
		if err := d.send(state.conn, envelope); err != nil {
			d.handleSendFailure(state)
		}
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
		if err := d.send(c.conn, envelope); err != nil {
			d.handleSendFailure(c)
		}
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
		if err := d.send(c.conn, envelope); err != nil {
			d.handleSendFailure(c)
		}
	}
}

func (d *Dispatcher) handleSendFailure(state *connState) {
	if state == nil || state.playerID == "" {
		return
	}
	d.metricsSnapshot().SlowConsumer()
	d.builder.Forget(state.playerID)
	d.mu.Lock()
	d.forceFullFor[state.playerID] = true
	d.mu.Unlock()
	if closer, ok := state.conn.(slowConsumerCloser); ok {
		closer.CloseSlowConsumer()
	}
}

func (d *Dispatcher) send(conn Conn, envelope codec.Object) error {
	data, err := codec.Marshal(envelope)
	if err != nil {
		return err
	}
	d.metricsSnapshot().Payload(len(data))
	return conn.Send(data)
}

func (d *Dispatcher) sendSnapshot(state *connState, envelope codec.Object, full bool) error {
	if state == nil {
		return errors.New("wsapi: missing connection state")
	}
	hint := int(state.deltaSnapshotHint.Load())
	if full {
		hint = int(state.fullSnapshotHint.Load())
	}
	data, err := codec.MarshalWithCapacity(envelope, hint)
	if err != nil {
		return err
	}
	if full {
		state.fullSnapshotHint.Store(int64(len(data)))
	} else {
		state.deltaSnapshotHint.Store(int64(len(data)))
	}
	d.metricsSnapshot().Payload(len(data))
	return state.conn.Send(data)
}

func (d *Dispatcher) metricsSnapshot() *observability.RuntimeMetrics {
	d.mu.Lock()
	defer d.mu.Unlock()
	return d.metrics
}

func findPlayerSnapshot(players []player.Snapshot, playerID string) (player.Snapshot, bool) {
	for _, p := range players {
		if p.ID == playerID {
			return p, true
		}
	}
	return player.Snapshot{}, false
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
		{Key: "shurikenActive", Value: p.ShurikenActive},
		{Key: "spikedBallsActive", Value: p.SpikedBallsActive},
	}
}

func burningStatusEffectsObj(ticksRemaining int) codec.Object {
	if ticksRemaining <= 0 {
		return codec.Object{}
	}
	return codec.Object{
		{Key: "burning", Value: codec.Object{
			{Key: "ticksRemaining", Value: ticksRemaining},
		}},
	}
}

func enemyObj(e enemy.Snapshot) codec.Object {
	obj := codec.Object{
		{Key: "id", Value: e.ID}, {Key: "kind", Value: string(e.Kind)},
		{Key: "x", Value: physics.QuantizePosition(e.X)},
		{Key: "y", Value: physics.QuantizePosition(e.Y)},
		{Key: "hp", Value: e.HP}, {Key: "maxHp", Value: e.MaxHP},
		{Key: "state", Value: string(e.State)},
		{Key: "statusEffects", Value: burningStatusEffectsObj(e.BurningTicksRemaining)},
	}
	if e.Elite {
		obj = append(obj, codec.Field{Key: "elite", Value: true})
	}
	if e.Variant != "" {
		obj = append(obj, codec.Field{Key: "variant", Value: string(e.Variant)})
	}
	if e.VenomMarked {
		obj = append(obj, codec.Field{Key: "venomMarked", Value: true})
	}
	if e.Confused {
		obj = append(obj, codec.Field{Key: "confused", Value: true})
	}
	if e.Facing != "" {
		obj = append(obj, codec.Field{Key: "facing", Value: string(e.Facing)})
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
	obj := codec.Object{
		{Key: "id", Value: s.ID},
		{Key: "hp", Value: s.HP},
		{Key: "maxHp", Value: s.MaxHP},
		{Key: "state", Value: string(s.State)},
		{Key: "confused", Value: s.Confused},
		{Key: "statusEffects", Value: burningStatusEffectsObj(s.BurningTicksRemaining)},
	}
	if s.Facing != "" {
		obj = append(obj, codec.Field{Key: "facing", Value: string(s.Facing)})
	}
	return obj
}

func bossObj(b appworld.BossSnapshot) codec.Object {
	obj := codec.Object{
		{Key: "id", Value: b.ID}, {Key: "kind", Value: string(b.Kind)},
		{Key: "x", Value: b.X}, {Key: "y", Value: b.Y},
		{Key: "hp", Value: b.HP}, {Key: "maxHp", Value: b.MaxHP},
		{Key: "state", Value: string(b.State)}, {Key: "phase", Value: b.Phase},
		{Key: "statusEffects", Value: burningStatusEffectsObj(b.BurningTicksRemaining)},
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
	if b.VenomMarked {
		obj = append(obj, codec.Field{Key: "venomMarked", Value: true})
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

type wireCache struct {
	players         map[string]codec.Object
	enemies         map[string]codec.Object
	enemyTransforms map[string]codec.Object
	enemyStates     map[string]codec.Object
	bosses          map[string]codec.Object
	drops           map[string]codec.Object
	portals         map[string]codec.Object
	hazards         map[string]codec.Object
}

func newWireCache(view appworld.SnapshotView) *wireCache {
	return &wireCache{
		players: make(map[string]codec.Object, len(view.Players)),
		enemies: make(map[string]codec.Object, len(view.Enemies)),
		bosses:  make(map[string]codec.Object, len(view.Bosses)),
		drops:   make(map[string]codec.Object, len(view.Drops)),
		portals: make(map[string]codec.Object, len(view.Portals)),
		hazards: make(map[string]codec.Object, len(view.Hazards)),
	}
}

func (c *wireCache) player(p player.Snapshot) codec.Object {
	if c == nil {
		return playerObj(p)
	}
	if c.players == nil {
		c.players = make(map[string]codec.Object)
	}
	if obj, ok := c.players[p.ID]; ok {
		return obj
	}
	obj := playerObj(p)
	c.players[p.ID] = obj
	return obj
}

func (c *wireCache) enemy(e enemy.Snapshot) codec.Object {
	if c == nil {
		return enemyObj(e)
	}
	if c.enemies == nil {
		c.enemies = make(map[string]codec.Object)
	}
	if obj, ok := c.enemies[e.ID]; ok {
		return obj
	}
	obj := enemyObj(e)
	c.enemies[e.ID] = obj
	return obj
}

func (c *wireCache) enemyTransform(t appsnap.EnemyTransform) codec.Object {
	if c == nil {
		return enemyTransformObj(t)
	}
	if c.enemyTransforms == nil {
		c.enemyTransforms = make(map[string]codec.Object)
	}
	if obj, ok := c.enemyTransforms[t.ID]; ok {
		return obj
	}
	obj := enemyTransformObj(t)
	c.enemyTransforms[t.ID] = obj
	return obj
}

func (c *wireCache) enemyState(s appsnap.EnemyState) codec.Object {
	if c == nil {
		return enemyStateObj(s)
	}
	if c.enemyStates == nil {
		c.enemyStates = make(map[string]codec.Object)
	}
	if obj, ok := c.enemyStates[s.ID]; ok {
		return obj
	}
	obj := enemyStateObj(s)
	c.enemyStates[s.ID] = obj
	return obj
}

func (c *wireCache) boss(b appworld.BossSnapshot) codec.Object {
	if c == nil {
		return bossObj(b)
	}
	if c.bosses == nil {
		c.bosses = make(map[string]codec.Object)
	}
	if obj, ok := c.bosses[b.ID]; ok {
		return obj
	}
	obj := bossObj(b)
	c.bosses[b.ID] = obj
	return obj
}

func (c *wireCache) drop(d drop.Snapshot) codec.Object {
	if c == nil {
		return dropObj(d)
	}
	if c.drops == nil {
		c.drops = make(map[string]codec.Object)
	}
	if obj, ok := c.drops[d.ID]; ok {
		return obj
	}
	obj := dropObj(d)
	c.drops[d.ID] = obj
	return obj
}

func (c *wireCache) portal(p portal.Snapshot) codec.Object {
	if c == nil {
		return portalObj(p)
	}
	if c.portals == nil {
		c.portals = make(map[string]codec.Object)
	}
	if obj, ok := c.portals[p.ID]; ok {
		return obj
	}
	obj := portalObj(p)
	c.portals[p.ID] = obj
	return obj
}

func (c *wireCache) hazard(h hazard.Snapshot) codec.Object {
	if c == nil {
		return hazardObj(h)
	}
	if c.hazards == nil {
		c.hazards = make(map[string]codec.Object)
	}
	if obj, ok := c.hazards[h.ID]; ok {
		return obj
	}
	obj := hazardObj(h)
	c.hazards[h.ID] = obj
	return obj
}

func buildSnapshotDeltaEnvelope(delta appsnap.Delta, cache *wireCache) codec.Object {
	players := make([]codec.Object, 0, len(delta.PlayersUpsert)+1)
	players = append(players, cache.player(delta.Self))
	for _, p := range delta.PlayersUpsert {
		players = append(players, cache.player(p))
	}
	in := protocol.SnapshotDeltaInput{
		Tick:             delta.Tick,
		Full:             delta.Full,
		Instance:         protocol.InstanceID(delta.Instance),
		Players:          players,
		RemovedPlayerIDs: delta.PlayersRemove,
		Enemies:          mapObjects(delta.EnemiesUpsert, cache.enemy),
		EnemyTransforms:  mapObjects(delta.EnemyTransforms, cache.enemyTransform),
		EnemyStates:      mapObjects(delta.EnemyStates, cache.enemyState),
		RemovedEnemyIDs:  delta.EnemiesRemove,
		Bosses:           mapObjects(delta.BossesUpsert, cache.boss),
		RemovedBossIDs:   delta.BossesRemove,
		Drops:            mapObjects(delta.DropsUpsert, cache.drop),
		RemovedDropIDs:   delta.DropsRemove,
		Portals:          mapObjects(delta.PortalsUpsert, cache.portal),
		RemovedPortalIDs: delta.PortalsRemove,
		Hazards:          mapObjects(delta.HazardsUpsert, cache.hazard),
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
