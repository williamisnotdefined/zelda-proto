package protocol

type ClientMessage interface {
	MessageType() ClientMessageType
}

type ClientInputState struct {
	Up       bool
	Down     bool
	Left     bool
	Right    bool
	Attack   bool
	Wave     bool
	Numb     bool
	Dash     bool
	Fireball bool
	Grenade  bool
	Landmine bool
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

type ChatMessage struct {
	ProtocolVersion int64             `json:"protocolVersion" msgpack:"protocolVersion"`
	Type            ClientMessageType `json:"type" msgpack:"type"`
	Text            string            `json:"text" msgpack:"text"`
}

func (ChatMessage) MessageType() ClientMessageType {
	return ClientMessageTypeChat
}

type InputMessage struct {
	ProtocolVersion int64             `json:"protocolVersion" msgpack:"protocolVersion"`
	Type            ClientMessageType `json:"type" msgpack:"type"`
	Seq             int64             `json:"seq" msgpack:"seq"`
	Up              bool              `json:"up" msgpack:"up"`
	Down            bool              `json:"down" msgpack:"down"`
	Left            bool              `json:"left" msgpack:"left"`
	Right           bool              `json:"right" msgpack:"right"`
	Attack          bool              `json:"attack" msgpack:"attack"`
	Wave            bool              `json:"wave" msgpack:"wave"`
	Numb            bool              `json:"numb" msgpack:"numb"`
	Dash            bool              `json:"dash" msgpack:"dash"`
	Fireball        bool              `json:"fireball" msgpack:"fireball"`
	Grenade         bool              `json:"grenade" msgpack:"grenade"`
	Landmine        bool              `json:"landmine" msgpack:"landmine"`
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
