package protocol

import (
	"github.com/williamisnotdefined/zelda-proto/server_go/internal/codec"
)

// PlayerSnapshot mirrors the wire layout of a player on a snapshot. Keep
// fields ordered to match the legacy Node serializer (msgpackr ordered map).
type PlayerSnapshot struct {
	ID            string
	Nickname      string
	X             float64
	Y             float64
	HP            int
	MaxHP         int
	State         string
	Direction     string
	MonsterKills  int
	PlayerKills   int
	Toasty        bool
}

// EnemySnapshot mirrors enemy fields on the wire.
type EnemySnapshot struct {
	ID    string
	Kind  string
	X     float64
	Y     float64
	HP    int
	MaxHP int
	State string
}

// BossSnapshot mirrors boss fields on the wire.
type BossSnapshot struct {
	ID    string
	Kind  string
	X     float64
	Y     float64
	HP    int
	MaxHP int
	State string
	Phase int
}

// DropSnapshot mirrors drops.
type DropSnapshot struct {
	ID   string
	Kind string
	X    float64
	Y    float64
}

// PortalSnapshot mirrors portals.
type PortalSnapshot struct {
	ID   string
	Kind string
	X    float64
	Y    float64
}

// HazardSnapshot mirrors hazards.
type HazardSnapshot struct {
	ID    string
	Kind  string
	X     float64
	Y     float64
	TTLMs int64
}

// LeaderboardEntry is a single ranked entry on the wire.
type LeaderboardEntry struct {
	PlayerID     string
	Nickname     string
	MonsterKills int
	PlayerKills  int
	Deaths       int
}

// BuildWelcome constructs the welcome envelope. Mirrors the legacy TS shape:
// id, sessionToken, resumed, mapWidth, mapHeight.
func BuildWelcome(playerID, sessionToken string, resumed bool, mapWidth, mapHeight int) codec.Object {
	return codec.Object{
		{Key: "protocolVersion", Value: ProtocolVersion},
		{Key: "type", Value: ServerMessageTypeWelcome},
		{Key: "id", Value: playerID},
		{Key: "sessionToken", Value: sessionToken},
		{Key: "resumed", Value: resumed},
		{Key: "mapWidth", Value: mapWidth},
		{Key: "mapHeight", Value: mapHeight},
	}
}

// BuildResumeRejected constructs the resume_rejected envelope.
func BuildResumeRejected(reason ResumeRejectedReason) codec.Object {
	return codec.Object{
		{Key: "protocolVersion", Value: ProtocolVersion},
		{Key: "type", Value: ServerMessageTypeResumeRejected},
		{Key: "reason", Value: string(reason)},
	}
}

// BuildSnapshot constructs the full-snapshot envelope. The TS client expects
// every collection to be present (never undefined).
func BuildSnapshot(instance InstanceID,
	players, enemies, bosses, drops, portals, hazards,
	iceZones, aoeIndicators, waveIndicators []codec.Object) codec.Object {
	return codec.Object{
		{Key: "protocolVersion", Value: ProtocolVersion},
		{Key: "type", Value: ServerMessageTypeSnapshot},
		{Key: "instanceId", Value: string(instance)},
		{Key: "players", Value: toAny(players)},
		{Key: "enemies", Value: toAny(enemies)},
		{Key: "bosses", Value: toAny(bosses)},
		{Key: "iceZones", Value: toAny(iceZones)},
		{Key: "aoeIndicators", Value: toAny(aoeIndicators)},
		{Key: "waveIndicators", Value: toAny(waveIndicators)},
		{Key: "drops", Value: toAny(drops)},
		{Key: "portals", Value: toAny(portals)},
		{Key: "hazards", Value: toAny(hazards)},
	}
}

// SnapshotDeltaInput aggregates every collection a delta envelope requires.
type SnapshotDeltaInput struct {
	Tick     uint64
	Full     bool
	Instance InstanceID

	Players          []codec.Object
	RemovedPlayerIDs []string

	Enemies          []codec.Object
	EnemyTransforms  []codec.Object
	EnemyStates      []codec.Object
	RemovedEnemyIDs  []string

	Bosses           []codec.Object
	RemovedBossIDs   []string

	Drops            []codec.Object
	RemovedDropIDs   []string

	Portals          []codec.Object
	RemovedPortalIDs []string

	Hazards          []codec.Object
	RemovedHazardIDs []string

	IceZones       []codec.Object
	AoeIndicators  []codec.Object
	WaveIndicators []codec.Object
}

// BuildSnapshotDelta constructs a delta envelope matching the TS client.
func BuildSnapshotDelta(in SnapshotDeltaInput) codec.Object {
	return codec.Object{
		{Key: "protocolVersion", Value: ProtocolVersion},
		{Key: "type", Value: ServerMessageTypeSnapshotDelta},
		{Key: "tick", Value: int64(in.Tick)},
		{Key: "full", Value: in.Full},
		{Key: "instanceId", Value: string(in.Instance)},
		{Key: "players", Value: toAny(in.Players)},
		{Key: "removedPlayerIds", Value: toAnyStrings(in.RemovedPlayerIDs)},
		{Key: "enemies", Value: toAny(in.Enemies)},
		{Key: "enemyTransforms", Value: toAny(in.EnemyTransforms)},
		{Key: "enemyStates", Value: toAny(in.EnemyStates)},
		{Key: "bosses", Value: toAny(in.Bosses)},
		{Key: "drops", Value: toAny(in.Drops)},
		{Key: "portals", Value: toAny(in.Portals)},
		{Key: "hazards", Value: toAny(in.Hazards)},
		{Key: "removedEnemyIds", Value: toAnyStrings(in.RemovedEnemyIDs)},
		{Key: "removedBossIds", Value: toAnyStrings(in.RemovedBossIDs)},
		{Key: "removedDropIds", Value: toAnyStrings(in.RemovedDropIDs)},
		{Key: "removedPortalIds", Value: toAnyStrings(in.RemovedPortalIDs)},
		{Key: "removedHazardIds", Value: toAnyStrings(in.RemovedHazardIDs)},
		{Key: "iceZones", Value: toAny(in.IceZones)},
		{Key: "aoeIndicators", Value: toAny(in.AoeIndicators)},
		{Key: "waveIndicators", Value: toAny(in.WaveIndicators)},
	}
}

// BuildChatBroadcast constructs a server-side chat broadcast.
func BuildChatBroadcast(playerID, nickname, text string, ts int64) codec.Object {
	return codec.Object{
		{Key: "protocolVersion", Value: ProtocolVersion},
		{Key: "type", Value: ServerMessageTypeChat},
		{Key: "id", Value: playerID},
		{Key: "nickname", Value: nickname},
		{Key: "text", Value: text},
		{Key: "timestamp", Value: ts},
	}
}

// BuildLeaderboard constructs a leaderboard envelope. The TS client reads
// `players`, with each entry exposing id/nickname/playerKills/monsterKills/deaths.
func BuildLeaderboard(entries []LeaderboardEntry) codec.Object {
	out := make([]any, 0, len(entries))
	for _, e := range entries {
		out = append(out, codec.Object{
			{Key: "id", Value: e.PlayerID},
			{Key: "nickname", Value: e.Nickname},
			{Key: "playerKills", Value: e.PlayerKills},
			{Key: "monsterKills", Value: e.MonsterKills},
			{Key: "deaths", Value: e.Deaths},
		})
	}
	return codec.Object{
		{Key: "protocolVersion", Value: ProtocolVersion},
		{Key: "type", Value: ServerMessageTypeLeaderboard},
		{Key: "players", Value: out},
	}
}

// BuildError constructs a generic error envelope.
func BuildError(code ServerErrorCode, message string) codec.Object {
	return codec.Object{
		{Key: "protocolVersion", Value: ProtocolVersion},
		{Key: "type", Value: ServerMessageTypeError},
		{Key: "code", Value: string(code)},
		{Key: "message", Value: message},
	}
}

func toAny(in []codec.Object) []any {
	out := make([]any, len(in))
	for i, v := range in {
		out[i] = v
	}
	return out
}

func toAnyStrings(in []string) []any {
	out := make([]any, len(in))
	for i, v := range in {
		out[i] = v
	}
	return out
}
