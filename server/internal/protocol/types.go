package protocol

type ClientMessage interface {
	MessageType() ClientMessageType
}

type ClientInputState struct {
	Up        bool
	Down      bool
	Left      bool
	Right     bool
	Wave      bool
	Numb      bool
	Pull      bool
	Venom     bool
	Confusion bool
	Dash      bool
	Grenade   bool
	Molotov   bool
	Landmine  bool
	Shuriken  bool
}

type JoinMessage struct {
	ProtocolVersion int64             `json:"protocolVersion" msgpack:"protocolVersion"`
	Type            ClientMessageType `json:"type" msgpack:"type"`
	Nickname        string            `json:"nickname" msgpack:"nickname"`
}

func (JoinMessage) MessageType() ClientMessageType {
	return ClientMessageTypeJoin
}

type ResumeSessionMessage struct {
	ProtocolVersion int64             `json:"protocolVersion" msgpack:"protocolVersion"`
	Type            ClientMessageType `json:"type" msgpack:"type"`
	SessionToken    string            `json:"sessionToken" msgpack:"sessionToken"`
}

func (ResumeSessionMessage) MessageType() ClientMessageType {
	return ClientMessageTypeResumeSession
}

type InputMessage struct {
	ProtocolVersion int64             `json:"protocolVersion" msgpack:"protocolVersion"`
	Type            ClientMessageType `json:"type" msgpack:"type"`
	Seq             int64             `json:"seq" msgpack:"seq"`
	Up              bool              `json:"up" msgpack:"up"`
	Down            bool              `json:"down" msgpack:"down"`
	Left            bool              `json:"left" msgpack:"left"`
	Right           bool              `json:"right" msgpack:"right"`
	Wave            bool              `json:"wave" msgpack:"wave"`
	Numb            bool              `json:"numb" msgpack:"numb"`
	Pull            bool              `json:"pull" msgpack:"pull"`
	Venom           bool              `json:"venom" msgpack:"venom"`
	Confusion       bool              `json:"confusion" msgpack:"confusion"`
	Dash            bool              `json:"dash" msgpack:"dash"`
	Grenade         bool              `json:"grenade" msgpack:"grenade"`
	Molotov         bool              `json:"molotov" msgpack:"molotov"`
	Landmine        bool              `json:"landmine" msgpack:"landmine"`
	Shuriken        bool              `json:"shuriken" msgpack:"shuriken"`
}

func (InputMessage) MessageType() ClientMessageType {
	return ClientMessageTypeInput
}

type SnapshotResyncMessage struct {
	ProtocolVersion int64                `json:"protocolVersion" msgpack:"protocolVersion"`
	Type            ClientMessageType    `json:"type" msgpack:"type"`
	Reason          SnapshotResyncReason `json:"reason" msgpack:"reason"`
	LastTick        int64                `json:"lastTick" msgpack:"lastTick"`
	InstanceID      *InstanceID          `json:"instanceId" msgpack:"instanceId"`
}

func (SnapshotResyncMessage) MessageType() ClientMessageType {
	return ClientMessageTypeSnapshotResync
}

type StringParseResult[Reason ~string] struct {
	OK     bool
	Value  string
	Reason Reason
}

type ClientMessageParseResult struct {
	OK     bool
	Value  ClientMessage
	Reason ClientMessageParseFailureReason
}

type ValidationResult struct {
	OK      bool
	Message ClientMessage
	Reason  ValidationFailureReason
}

type SnapshotResyncOptions struct {
	LastTick   *int64
	InstanceID *InstanceID
}

func Pointer[T any](value T) *T {
	return &value
}
