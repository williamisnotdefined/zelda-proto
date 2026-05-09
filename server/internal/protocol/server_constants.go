package protocol

// Server-side message types (string discriminators sent in the `type` field of
// every outbound message). They are kept as constants so the dispatcher can
// reference them without magic strings.
const (
	ServerMessageTypeWelcome         = "welcome"
	ServerMessageTypeSnapshot        = "snapshot"
	ServerMessageTypeSnapshotDelta   = "snapshot_delta"
	ServerMessageTypeLeaderboard     = "leaderboard"
	ServerMessageTypeResumeRejected  = "resume_rejected"
	ServerMessageTypeError           = "error"
)

// ResumeRejectedReason enumerates why a resume_session can fail.
type ResumeRejectedReason string

const (
	ResumeRejectedReasonInvalidSession ResumeRejectedReason = "invalid_session"
	ResumeRejectedReasonSessionInUse   ResumeRejectedReason = "session_in_use"
	ResumeRejectedReasonExpired        ResumeRejectedReason = "expired"
	ResumeRejectedReasonProtocolMismatch ResumeRejectedReason = "protocol_mismatch"
)

// ServerErrorCode enumerates server-pushed error codes.
type ServerErrorCode string

const (
	ServerErrorCodeRateLimited     ServerErrorCode = "rate_limited"
	ServerErrorCodePayloadTooLarge ServerErrorCode = "payload_too_large"
	ServerErrorCodeProtocolMismatch ServerErrorCode = "protocol_mismatch"
	ServerErrorCodeJoinRequired    ServerErrorCode = "join_required"
)
