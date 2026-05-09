package protocol

import (
	"github.com/williamisnotdefined/zelda-proto/server/internal/codec"
)

// PlayerSnapshot mirrors the wire layout of a player on a snapshot. Keep
// fields ordered to match the MessagePack object order expected by the client.
type PlayerSnapshot struct {
	ID           string
	Nickname     string
	X            float64
	Y            float64
	HP           int
	MaxHP        int
	State        string
	Direction    string
	MonsterKills int
	PlayerKills  int
	Toasty       bool
}

// EnemySnapshot mirrors enemy fields on the wire.
type EnemySnapshot struct {
	ID    string
	Kind  string
	Elite bool
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

// BuildWelcome constructs the welcome envelope: id, sessionToken, resumed,
// mapWidth, mapHeight.
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

// BuildSnapshot constructs the full-snapshot envelope. The client expects every
// collection to be present (never undefined).
func BuildSnapshot(instance InstanceID,
	players, enemies, bosses, drops, portals, hazards,
	iceZones, aoeIndicators, waveIndicators []codec.Object) codec.Object {
	return codec.Object{
		{Key: "protocolVersion", Value: ProtocolVersion},
		{Key: "type", Value: ServerMessageTypeSnapshot},
		{Key: "instanceId", Value: string(instance)},
		{Key: "players", Value: objectsOrEmpty(players)},
		{Key: "enemies", Value: objectsOrEmpty(enemies)},
		{Key: "bosses", Value: objectsOrEmpty(bosses)},
		{Key: "iceZones", Value: objectsOrEmpty(iceZones)},
		{Key: "aoeIndicators", Value: objectsOrEmpty(aoeIndicators)},
		{Key: "waveIndicators", Value: objectsOrEmpty(waveIndicators)},
		{Key: "drops", Value: objectsOrEmpty(drops)},
		{Key: "portals", Value: objectsOrEmpty(portals)},
		{Key: "hazards", Value: objectsOrEmpty(hazards)},
	}
}

// SnapshotDeltaInput aggregates every collection a delta envelope requires.
type SnapshotDeltaInput struct {
	Tick     uint64
	Full     bool
	Instance InstanceID

	Players          []codec.Object
	RemovedPlayerIDs []string

	Enemies         []codec.Object
	EnemyTransforms []codec.Object
	EnemyStates     []codec.Object
	RemovedEnemyIDs []string

	Bosses         []codec.Object
	RemovedBossIDs []string

	Drops          []codec.Object
	RemovedDropIDs []string

	Portals          []codec.Object
	RemovedPortalIDs []string

	Hazards          []codec.Object
	RemovedHazardIDs []string

	IceZones       []codec.Object
	AoeIndicators  []codec.Object
	WaveIndicators []codec.Object
}

// BuildSnapshotDelta constructs a delta envelope matching the client schema.
func BuildSnapshotDelta(in SnapshotDeltaInput) codec.Object {
	return codec.Object{
		{Key: "protocolVersion", Value: ProtocolVersion},
		{Key: "type", Value: ServerMessageTypeSnapshotDelta},
		{Key: "tick", Value: int64(in.Tick)},
		{Key: "full", Value: in.Full},
		{Key: "instanceId", Value: string(in.Instance)},
		{Key: "players", Value: objectsOrEmpty(in.Players)},
		{Key: "removedPlayerIds", Value: stringsOrEmpty(in.RemovedPlayerIDs)},
		{Key: "enemies", Value: objectsOrEmpty(in.Enemies)},
		{Key: "enemyTransforms", Value: objectsOrEmpty(in.EnemyTransforms)},
		{Key: "enemyStates", Value: objectsOrEmpty(in.EnemyStates)},
		{Key: "bosses", Value: objectsOrEmpty(in.Bosses)},
		{Key: "drops", Value: objectsOrEmpty(in.Drops)},
		{Key: "portals", Value: objectsOrEmpty(in.Portals)},
		{Key: "hazards", Value: objectsOrEmpty(in.Hazards)},
		{Key: "removedEnemyIds", Value: stringsOrEmpty(in.RemovedEnemyIDs)},
		{Key: "removedBossIds", Value: stringsOrEmpty(in.RemovedBossIDs)},
		{Key: "removedDropIds", Value: stringsOrEmpty(in.RemovedDropIDs)},
		{Key: "removedPortalIds", Value: stringsOrEmpty(in.RemovedPortalIDs)},
		{Key: "removedHazardIds", Value: stringsOrEmpty(in.RemovedHazardIDs)},
		{Key: "iceZones", Value: objectsOrEmpty(in.IceZones)},
		{Key: "aoeIndicators", Value: objectsOrEmpty(in.AoeIndicators)},
		{Key: "waveIndicators", Value: objectsOrEmpty(in.WaveIndicators)},
	}
}

// BuildLeaderboard constructs a leaderboard envelope. The client reads
// `players`, with each entry exposing id/nickname/playerKills/monsterKills/deaths.
func BuildLeaderboard(entries []LeaderboardEntry) codec.Object {
	out := make([]codec.Object, 0, len(entries))
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
		{Key: "players", Value: objectsOrEmpty(out)},
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

var emptyObjects = []codec.Object{}
var emptyStrings = []string{}

func objectsOrEmpty(in []codec.Object) []codec.Object {
	if in == nil {
		return emptyObjects
	}
	return in
}

func stringsOrEmpty(in []string) []string {
	if in == nil {
		return emptyStrings
	}
	return in
}
