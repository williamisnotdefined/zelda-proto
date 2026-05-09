package protocol

import (
	"math"
	"strings"
	"unicode/utf16"
)

type recordLookup interface {
	Lookup(key string) (any, bool)
}

type mapRecord map[string]any

func (m mapRecord) Lookup(key string) (any, bool) {
	value, ok := m[key]
	return value, ok
}

func NormalizeNickname(value string) string {
	return strings.TrimSpace(value)
}

func ParseNickname(value string) StringParseResult[NicknameValidationReason] {
	normalized := NormalizeNickname(value)

	if len(normalized) < MinNicknameLength {
		return StringParseResult[NicknameValidationReason]{
			Reason: NicknameValidationReasonTooShort,
		}
	}

	if len(normalized) > MaxNicknameLength {
		return StringParseResult[NicknameValidationReason]{
			Reason: NicknameValidationReasonTooLong,
		}
	}

	if !nicknamePattern.MatchString(normalized) {
		return StringParseResult[NicknameValidationReason]{
			Reason: NicknameValidationReasonInvalidCharacters,
		}
	}

	return StringParseResult[NicknameValidationReason]{
		OK:    true,
		Value: normalized,
	}
}

func NormalizeSessionToken(value string) string {
	return strings.TrimSpace(value)
}

func ParseSessionToken(value string) StringParseResult[SessionTokenValidationReason] {
	normalized := NormalizeSessionToken(value)

	if len(normalized) < MinSessionTokenLength {
		return StringParseResult[SessionTokenValidationReason]{
			Reason: SessionTokenValidationReasonTooShort,
		}
	}

	if len(normalized) > MaxSessionTokenLength {
		return StringParseResult[SessionTokenValidationReason]{
			Reason: SessionTokenValidationReasonTooLong,
		}
	}

	if !sessionTokenPattern.MatchString(normalized) {
		return StringParseResult[SessionTokenValidationReason]{
			Reason: SessionTokenValidationReasonInvalidCharacters,
		}
	}

	return StringParseResult[SessionTokenValidationReason]{
		OK:    true,
		Value: normalized,
	}
}

func ParseClientMessage(raw any) ClientMessageParseResult {
	record, ok := asRecord(raw)
	if !ok {
		return ClientMessageParseResult{
			Reason: ClientMessageParseFailureInvalidMessage,
		}
	}

	protocolVersion, ok := getSafeInteger(record, "protocolVersion")
	if !ok || protocolVersion != ProtocolVersion {
		return ClientMessageParseResult{
			Reason: ClientMessageParseFailureProtocolMismatch,
		}
	}

	typeValue, ok := getString(record, "type")
	if !ok {
		return ClientMessageParseResult{
			Reason: ClientMessageParseFailureInvalidMessage,
		}
	}

	switch ClientMessageType(typeValue) {
	case ClientMessageTypeJoin:
		nicknameValue, ok := getString(record, "nickname")
		if !ok {
			return ClientMessageParseResult{Reason: ClientMessageParseFailureInvalidMessage}
		}

		nickname := ParseNickname(nicknameValue)
		if !nickname.OK {
			return ClientMessageParseResult{Reason: ClientMessageParseFailureInvalidMessage}
		}

		return ClientMessageParseResult{OK: true, Value: NewJoinMessage(nickname.Value)}
	case ClientMessageTypeResumeSession:
		sessionTokenValue, ok := getString(record, "sessionToken")
		if !ok {
			return ClientMessageParseResult{Reason: ClientMessageParseFailureInvalidMessage}
		}

		sessionToken := ParseSessionToken(sessionTokenValue)
		if !sessionToken.OK {
			return ClientMessageParseResult{Reason: ClientMessageParseFailureInvalidMessage}
		}

		return ClientMessageParseResult{OK: true, Value: NewResumeSessionMessage(sessionToken.Value)}
	case ClientMessageTypeInput:
		seq, ok := getSafeInteger(record, "seq")
		if !ok || seq < 0 {
			return ClientMessageParseResult{Reason: ClientMessageParseFailureInvalidMessage}
		}

		up, okUp := getBool(record, "up")
		down, okDown := getBool(record, "down")
		left, okLeft := getBool(record, "left")
		right, okRight := getBool(record, "right")
		wave, okWave := getBool(record, "wave")
		numb, okNumb := getBool(record, "numb")
		pull, okPull := getBool(record, "pull")
		venom, okVenom := getBool(record, "venom")
		dash, okDash := getBool(record, "dash")
		grenade, okGrenade := getBool(record, "grenade")
		molotov, okMolotov := getBool(record, "molotov")
		landmine, okLandmine := getBool(record, "landmine")
		shuriken, okShuriken := getBool(record, "shuriken")
		if !okUp || !okDown || !okLeft || !okRight || !okWave || !okNumb || !okPull || !okVenom || !okDash || !okGrenade || !okMolotov || !okLandmine || !okShuriken {
			return ClientMessageParseResult{Reason: ClientMessageParseFailureInvalidMessage}
		}

		return ClientMessageParseResult{
			OK: true,
			Value: NewInputMessage(seq, ClientInputState{
				Up:       up,
				Down:     down,
				Left:     left,
				Right:    right,
				Wave:     wave,
				Numb:     numb,
				Pull:     pull,
				Venom:    venom,
				Dash:     dash,
				Grenade:  grenade,
				Molotov:  molotov,
				Landmine: landmine,
				Shuriken: shuriken,
			}),
		}
	case ClientMessageTypeSnapshotResync:
		reasonValue, ok := getString(record, "reason")
		if !ok {
			return ClientMessageParseResult{Reason: ClientMessageParseFailureInvalidMessage}
		}

		reason := SnapshotResyncReason(reasonValue)
		if !IsValidSnapshotResyncReason(reason) {
			return ClientMessageParseResult{Reason: ClientMessageParseFailureInvalidMessage}
		}

		lastTick, ok := getSafeInteger(record, "lastTick")
		if !ok || lastTick < -1 {
			return ClientMessageParseResult{Reason: ClientMessageParseFailureInvalidMessage}
		}

		instanceID, ok := getNullableInstanceID(record, "instanceId")
		if !ok {
			return ClientMessageParseResult{Reason: ClientMessageParseFailureInvalidMessage}
		}

		return ClientMessageParseResult{
			OK: true,
			Value: NewSnapshotResyncMessage(reason, SnapshotResyncOptions{
				LastTick:   Pointer(lastTick),
				InstanceID: instanceID,
			}),
		}
	default:
		return ClientMessageParseResult{Reason: ClientMessageParseFailureInvalidMessage}
	}
}

func asRecord(raw any) (recordLookup, bool) {
	if raw == nil {
		return nil, false
	}

	if record, ok := raw.(recordLookup); ok {
		return record, true
	}

	mapValue, ok := raw.(map[string]any)
	if !ok {
		return nil, false
	}

	return mapRecord(mapValue), true
}

func getString(record recordLookup, key string) (string, bool) {
	value, ok := record.Lookup(key)
	if !ok {
		return "", false
	}

	stringValue, ok := value.(string)
	return stringValue, ok
}

func getBool(record recordLookup, key string) (bool, bool) {
	value, ok := record.Lookup(key)
	if !ok {
		return false, false
	}

	boolValue, ok := value.(bool)
	return boolValue, ok
}

func getSafeInteger(record recordLookup, key string) (int64, bool) {
	value, ok := record.Lookup(key)
	if !ok {
		return 0, false
	}

	return toSafeInteger(value)
}

func getNullableInstanceID(record recordLookup, key string) (*InstanceID, bool) {
	value, ok := record.Lookup(key)
	if !ok {
		return nil, false
	}

	if value == nil {
		return nil, true
	}

	stringValue, ok := value.(string)
	if !ok {
		return nil, false
	}

	instanceID := InstanceID(stringValue)
	if !IsValidInstanceID(instanceID) {
		return nil, false
	}

	return Pointer(instanceID), true
}

func hasControlCharacters(value string) bool {
	for index := 0; index < len(value); index += 1 {
		char := value[index]
		if char <= 31 || char == 127 {
			return true
		}
	}

	return false
}

func utf16Length(value string) int {
	return len(utf16.Encode([]rune(value)))
}

func toSafeInteger(value any) (int64, bool) {
	switch typed := value.(type) {
	case int:
		return toSafeInteger(int64(typed))
	case int8:
		return int64(typed), true
	case int16:
		return int64(typed), true
	case int32:
		return int64(typed), true
	case int64:
		if typed < -maxJSSafeInteger || typed > maxJSSafeInteger {
			return 0, false
		}
		return typed, true
	case uint:
		return toSafeInteger(uint64(typed))
	case uint8:
		return int64(typed), true
	case uint16:
		return int64(typed), true
	case uint32:
		return int64(typed), true
	case uint64:
		if typed > uint64(maxJSSafeInteger) || typed > math.MaxInt64 {
			return 0, false
		}
		return int64(typed), true
	case float32:
		return toSafeInteger(float64(typed))
	case float64:
		if math.IsNaN(typed) || math.IsInf(typed, 0) {
			return 0, false
		}
		if math.Trunc(typed) != typed {
			return 0, false
		}
		if typed < float64(-maxJSSafeInteger) || typed > float64(maxJSSafeInteger) {
			return 0, false
		}
		return int64(typed), true
	default:
		return 0, false
	}
}
