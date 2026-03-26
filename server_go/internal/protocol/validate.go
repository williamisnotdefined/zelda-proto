package protocol

func ValidateClientMessage(raw any, hasJoined bool) ValidationResult {
	parsed := ParseClientMessage(raw)
	if !parsed.OK {
		return ValidationResult{
			Reason: ValidationFailureReason(parsed.Reason),
		}
	}

	switch parsed.Value.MessageType() {
	case ClientMessageTypeJoin, ClientMessageTypeResumeSession:
		if hasJoined {
			return ValidationResult{Reason: ValidationFailureReasonAlreadyJoined}
		}
		return ValidationResult{OK: true, Message: parsed.Value}
	default:
		if !hasJoined {
			return ValidationResult{Reason: ValidationFailureReasonJoinRequired}
		}
		return ValidationResult{OK: true, Message: parsed.Value}
	}
}
