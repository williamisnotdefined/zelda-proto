package protocol

import "regexp"

const (
	ProtocolVersion int64 = 11

	MinNicknameLength     = 2
	MaxNicknameLength     = 16
	MinSessionTokenLength = 8
	MaxSessionTokenLength = 128

	maxJSSafeInteger = int64(9007199254740991)
)

type ClientMessageType string

const (
	ClientMessageTypeInput          ClientMessageType = "input"
	ClientMessageTypeJoin           ClientMessageType = "join"
	ClientMessageTypeResumeSession  ClientMessageType = "resume_session"
	ClientMessageTypeSnapshotResync ClientMessageType = "snapshot_resync"
)

type InstanceID string

const (
	InstanceIDPhase1 InstanceID = "phase1"
	InstanceIDPhase2 InstanceID = "phase2"
	InstanceIDPhase3 InstanceID = "phase3"
	InstanceIDPhase4 InstanceID = "phase4"
)

type SnapshotResyncReason string

const (
	SnapshotResyncReasonMissingBase      SnapshotResyncReason = "missing_base"
	SnapshotResyncReasonTickGap          SnapshotResyncReason = "tick_gap"
	SnapshotResyncReasonInstanceMismatch SnapshotResyncReason = "instance_mismatch"
	SnapshotResyncReasonManual           SnapshotResyncReason = "manual"
)

type NicknameValidationReason string

const (
	NicknameValidationReasonTooShort          NicknameValidationReason = "too_short"
	NicknameValidationReasonTooLong           NicknameValidationReason = "too_long"
	NicknameValidationReasonInvalidCharacters NicknameValidationReason = "invalid_characters"
)

type SessionTokenValidationReason string

const (
	SessionTokenValidationReasonTooShort          SessionTokenValidationReason = "too_short"
	SessionTokenValidationReasonTooLong           SessionTokenValidationReason = "too_long"
	SessionTokenValidationReasonInvalidCharacters SessionTokenValidationReason = "invalid_characters"
)

type ClientMessageParseFailureReason string

const (
	ClientMessageParseFailureInvalidMessage   ClientMessageParseFailureReason = "invalid_message"
	ClientMessageParseFailureProtocolMismatch ClientMessageParseFailureReason = "protocol_mismatch"
)

type ValidationFailureReason string

const (
	ValidationFailureReasonInvalidMessage   ValidationFailureReason = "invalid_message"
	ValidationFailureReasonProtocolMismatch ValidationFailureReason = "protocol_mismatch"
	ValidationFailureReasonJoinRequired     ValidationFailureReason = "join_required"
	ValidationFailureReasonAlreadyJoined    ValidationFailureReason = "already_joined"
)

var (
	nicknamePattern     = regexp.MustCompile(`^[A-Za-z0-9 ]+$`)
	sessionTokenPattern = regexp.MustCompile(`^[A-Za-z0-9_-]+$`)

	validInstanceIDs = map[InstanceID]struct{}{
		InstanceIDPhase1: {},
		InstanceIDPhase2: {},
		InstanceIDPhase3: {},
		InstanceIDPhase4: {},
	}

	validSnapshotResyncReasons = map[SnapshotResyncReason]struct{}{
		SnapshotResyncReasonMissingBase:      {},
		SnapshotResyncReasonTickGap:          {},
		SnapshotResyncReasonInstanceMismatch: {},
		SnapshotResyncReasonManual:           {},
	}
)

func IsValidInstanceID(value InstanceID) bool {
	_, ok := validInstanceIDs[value]
	return ok
}

func IsValidSnapshotResyncReason(value SnapshotResyncReason) bool {
	_, ok := validSnapshotResyncReasons[value]
	return ok
}
