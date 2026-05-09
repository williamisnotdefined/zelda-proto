package protocol

func NewJoinMessage(nickname string) JoinMessage {
	return JoinMessage{
		ProtocolVersion: ProtocolVersion,
		Type:            ClientMessageTypeJoin,
		Nickname:        nickname,
	}
}

func NewResumeSessionMessage(sessionToken string) ResumeSessionMessage {
	return ResumeSessionMessage{
		ProtocolVersion: ProtocolVersion,
		Type:            ClientMessageTypeResumeSession,
		SessionToken:    sessionToken,
	}
}

func NewInputMessage(seq int64, input ClientInputState) InputMessage {
	return InputMessage{
		ProtocolVersion: ProtocolVersion,
		Type:            ClientMessageTypeInput,
		Seq:             seq,
		Up:              input.Up,
		Down:            input.Down,
		Left:            input.Left,
		Right:           input.Right,
		Attack:          input.Attack,
		Wave:            input.Wave,
		Numb:            input.Numb,
		Pull:            input.Pull,
		Venom:           input.Venom,
		Dash:            input.Dash,
		Fireball:        input.Fireball,
		Grenade:         input.Grenade,
		Landmine:        input.Landmine,
	}
}

func NewSnapshotResyncMessage(
	reason SnapshotResyncReason,
	options SnapshotResyncOptions,
) SnapshotResyncMessage {
	lastTick := int64(-1)
	if options.LastTick != nil {
		lastTick = *options.LastTick
	}

	return SnapshotResyncMessage{
		ProtocolVersion: ProtocolVersion,
		Type:            ClientMessageTypeSnapshotResync,
		Reason:          reason,
		LastTick:        lastTick,
		InstanceID:      options.InstanceID,
	}
}
