package protocol_test

import (
	"reflect"
	"strings"
	"testing"

	"github.com/williamisnotdefined/zelda-proto/server_go/internal/protocol"
)

func TestParseNickname(t *testing.T) {
	t.Run("trims and accepts canonical nicknames", func(t *testing.T) {
		result := protocol.ParseNickname("  Link  ")
		expected := protocol.StringParseResult[protocol.NicknameValidationReason]{
			OK:    true,
			Value: "Link",
		}
		if result != expected {
			t.Fatalf("expected %#v, got %#v", expected, result)
		}
	})

	t.Run("rejects short long and invalid nicknames", func(t *testing.T) {
		if result := protocol.ParseNickname(" a "); result != (protocol.StringParseResult[protocol.NicknameValidationReason]{Reason: protocol.NicknameValidationReasonTooShort}) {
			t.Fatalf("unexpected result: %#v", result)
		}

		tooLong := "A" + strings.Repeat("b", protocol.MaxNicknameLength)
		if result := protocol.ParseNickname(tooLong); result != (protocol.StringParseResult[protocol.NicknameValidationReason]{Reason: protocol.NicknameValidationReasonTooLong}) {
			t.Fatalf("unexpected result: %#v", result)
		}

		if result := protocol.ParseNickname("Link!"); result != (protocol.StringParseResult[protocol.NicknameValidationReason]{Reason: protocol.NicknameValidationReasonInvalidCharacters}) {
			t.Fatalf("unexpected result: %#v", result)
		}
	})
}

func TestParseChatText(t *testing.T) {
	t.Run("trims and accepts chat text", func(t *testing.T) {
		result := protocol.ParseChatText("  hello world  ")
		expected := protocol.StringParseResult[protocol.ChatTextValidationReason]{
			OK:    true,
			Value: "hello world",
		}
		if result != expected {
			t.Fatalf("expected %#v, got %#v", expected, result)
		}
	})

	t.Run("rejects empty long and control-character chat text", func(t *testing.T) {
		if result := protocol.ParseChatText("   "); result != (protocol.StringParseResult[protocol.ChatTextValidationReason]{Reason: protocol.ChatTextValidationReasonEmpty}) {
			t.Fatalf("unexpected result: %#v", result)
		}

		tooLong := strings.Repeat("a", protocol.MaxChatLength+1)
		if result := protocol.ParseChatText(tooLong); result != (protocol.StringParseResult[protocol.ChatTextValidationReason]{Reason: protocol.ChatTextValidationReasonTooLong}) {
			t.Fatalf("unexpected result: %#v", result)
		}

		if result := protocol.ParseChatText("hello\nworld"); result != (protocol.StringParseResult[protocol.ChatTextValidationReason]{Reason: protocol.ChatTextValidationReasonInvalidCharacters}) {
			t.Fatalf("unexpected result: %#v", result)
		}
	})
}

func TestParseSessionToken(t *testing.T) {
	t.Run("trims and accepts canonical session tokens", func(t *testing.T) {
		result := protocol.ParseSessionToken("  token_123-abc  ")
		expected := protocol.StringParseResult[protocol.SessionTokenValidationReason]{
			OK:    true,
			Value: "token_123-abc",
		}
		if result != expected {
			t.Fatalf("expected %#v, got %#v", expected, result)
		}
	})

	t.Run("rejects short long and invalid session tokens", func(t *testing.T) {
		if result := protocol.ParseSessionToken(" short "); result != (protocol.StringParseResult[protocol.SessionTokenValidationReason]{Reason: protocol.SessionTokenValidationReasonTooShort}) {
			t.Fatalf("unexpected result: %#v", result)
		}

		tooLong := "a" + strings.Repeat("b", protocol.MaxSessionTokenLength)
		if result := protocol.ParseSessionToken(tooLong); result != (protocol.StringParseResult[protocol.SessionTokenValidationReason]{Reason: protocol.SessionTokenValidationReasonTooLong}) {
			t.Fatalf("unexpected result: %#v", result)
		}

		if result := protocol.ParseSessionToken("token_bad!*"); result != (protocol.StringParseResult[protocol.SessionTokenValidationReason]{Reason: protocol.SessionTokenValidationReasonInvalidCharacters}) {
			t.Fatalf("unexpected result: %#v", result)
		}
	})
}

func TestMessageBuilders(t *testing.T) {
	join := protocol.NewJoinMessage("Link")
	if !reflect.DeepEqual(join, protocol.JoinMessage{
		ProtocolVersion: protocol.ProtocolVersion,
		Type:            protocol.ClientMessageTypeJoin,
		Nickname:        "Link",
	}) {
		t.Fatalf("unexpected join message: %#v", join)
	}

	chat := protocol.NewChatMessage("hello")
	if !reflect.DeepEqual(chat, protocol.ChatMessage{
		ProtocolVersion: protocol.ProtocolVersion,
		Type:            protocol.ClientMessageTypeChat,
		Text:            "hello",
	}) {
		t.Fatalf("unexpected chat message: %#v", chat)
	}

	resume := protocol.NewResumeSessionMessage("resume_token_123")
	if !reflect.DeepEqual(resume, protocol.ResumeSessionMessage{
		ProtocolVersion: protocol.ProtocolVersion,
		Type:            protocol.ClientMessageTypeResumeSession,
		SessionToken:    "resume_token_123",
	}) {
		t.Fatalf("unexpected resume message: %#v", resume)
	}

	input := protocol.NewInputMessage(7, protocol.ClientInputState{
		Up:     true,
		Down:   false,
		Left:   false,
		Right:  true,
		Attack: false,
	})
	if !reflect.DeepEqual(input, protocol.InputMessage{
		ProtocolVersion: protocol.ProtocolVersion,
		Type:            protocol.ClientMessageTypeInput,
		Seq:             7,
		Up:              true,
		Down:            false,
		Left:            false,
		Right:           true,
		Attack:          false,
	}) {
		t.Fatalf("unexpected input message: %#v", input)
	}

	phase2 := protocol.InstanceIDPhase2
	lastTick := int64(42)
	resync := protocol.NewSnapshotResyncMessage(protocol.SnapshotResyncReasonTickGap, protocol.SnapshotResyncOptions{
		LastTick:   &lastTick,
		InstanceID: &phase2,
	})
	if !reflect.DeepEqual(resync, protocol.SnapshotResyncMessage{
		ProtocolVersion: protocol.ProtocolVersion,
		Type:            protocol.ClientMessageTypeSnapshotResync,
		Reason:          protocol.SnapshotResyncReasonTickGap,
		LastTick:        42,
		InstanceID:      &phase2,
	}) {
		t.Fatalf("unexpected snapshot resync message: %#v", resync)
	}
}

func TestParseClientMessage(t *testing.T) {
	t.Run("canonicalizes valid payloads", func(t *testing.T) {
		join := protocol.ParseClientMessage(map[string]any{
			"protocolVersion": int64(protocol.ProtocolVersion),
			"type":            "join",
			"nickname":        "  Zelda  ",
		})
		assertParseResult(t, join, protocol.NewJoinMessage("Zelda"), "")

		chat := protocol.ParseClientMessage(map[string]any{
			"protocolVersion": int64(protocol.ProtocolVersion),
			"type":            "chat",
			"text":            "  hi  ",
		})
		assertParseResult(t, chat, protocol.NewChatMessage("hi"), "")

		resume := protocol.ParseClientMessage(map[string]any{
			"protocolVersion": int64(protocol.ProtocolVersion),
			"type":            "resume_session",
			"sessionToken":    "resume_token_123",
		})
		assertParseResult(t, resume, protocol.NewResumeSessionMessage("resume_token_123"), "")

		phase3 := protocol.InstanceIDPhase3
		resync := protocol.ParseClientMessage(map[string]any{
			"protocolVersion": int64(protocol.ProtocolVersion),
			"type":            "snapshot_resync",
			"reason":          "instance_mismatch",
			"lastTick":        int64(17),
			"instanceId":      string(phase3),
		})
		expected := protocol.NewSnapshotResyncMessage(protocol.SnapshotResyncReasonInstanceMismatch, protocol.SnapshotResyncOptions{
			LastTick:   protocol.Pointer(int64(17)),
			InstanceID: &phase3,
		})
		assertParseResult(t, resync, expected, "")
	})

	t.Run("rejects invalid payloads and protocol mismatches", func(t *testing.T) {
		assertParseFailure(t, protocol.ParseClientMessage(nil), protocol.ClientMessageParseFailureInvalidMessage)
		assertParseFailure(t, protocol.ParseClientMessage(map[string]any{
			"protocolVersion": int64(protocol.ProtocolVersion + 1),
			"type":            "join",
			"nickname":        "Link",
		}), protocol.ClientMessageParseFailureProtocolMismatch)
		assertParseFailure(t, protocol.ParseClientMessage(map[string]any{
			"protocolVersion": int64(protocol.ProtocolVersion),
			"type":            "join",
			"nickname":        "Link!",
		}), protocol.ClientMessageParseFailureInvalidMessage)
		assertParseFailure(t, protocol.ParseClientMessage(map[string]any{
			"protocolVersion": int64(protocol.ProtocolVersion),
			"type":            "input",
			"seq":             int64(-1),
			"up":              false,
			"down":            false,
			"left":            false,
			"right":           false,
			"attack":          false,
		}), protocol.ClientMessageParseFailureInvalidMessage)
		assertParseFailure(t, protocol.ParseClientMessage(map[string]any{
			"protocolVersion": int64(protocol.ProtocolVersion),
			"type":            "resume_session",
			"sessionToken":    "bad token",
		}), protocol.ClientMessageParseFailureInvalidMessage)
		assertParseFailure(t, protocol.ParseClientMessage(map[string]any{
			"protocolVersion": int64(protocol.ProtocolVersion),
			"type":            "snapshot_resync",
			"reason":          "oops",
			"lastTick":        int64(0),
			"instanceId":      "phase1",
		}), protocol.ClientMessageParseFailureInvalidMessage)
	})
}

func TestValidateClientMessage(t *testing.T) {
	t.Run("canonicalizes valid join and chat payloads", func(t *testing.T) {
		join := protocol.ValidateClientMessage(map[string]any{
			"protocolVersion": int64(protocol.ProtocolVersion),
			"type":            "join",
			"nickname":        "  Zelda  ",
		}, false)
		assertValidationResult(t, join, protocol.NewJoinMessage("Zelda"), "")

		chat := protocol.ValidateClientMessage(map[string]any{
			"protocolVersion": int64(protocol.ProtocolVersion),
			"type":            "chat",
			"text":            "  hello  ",
		}, true)
		assertValidationResult(t, chat, protocol.NewChatMessage("hello"), "")
	})

	t.Run("rejects invalid payloads and protocol mismatches", func(t *testing.T) {
		assertValidationFailure(t, protocol.ValidateClientMessage(nil, false), protocol.ValidationFailureReasonInvalidMessage)
		assertValidationFailure(t, protocol.ValidateClientMessage(map[string]any{
			"protocolVersion": int64(protocol.ProtocolVersion + 1),
			"type":            "join",
			"nickname":        "Link",
		}, false), protocol.ValidationFailureReasonProtocolMismatch)
		assertValidationFailure(t, protocol.ValidateClientMessage(map[string]any{
			"protocolVersion": int64(protocol.ProtocolVersion),
			"type":            "join",
			"nickname":        "Link!",
		}, false), protocol.ValidationFailureReasonInvalidMessage)
	})

	t.Run("enforces session rules after payload validation", func(t *testing.T) {
		resume := protocol.ValidateClientMessage(map[string]any{
			"protocolVersion": int64(protocol.ProtocolVersion),
			"type":            "resume_session",
			"sessionToken":    "resume_token_123",
		}, false)
		assertValidationResult(t, resume, protocol.NewResumeSessionMessage("resume_token_123"), "")

		assertValidationFailure(t, protocol.ValidateClientMessage(map[string]any{
			"protocolVersion": int64(protocol.ProtocolVersion),
			"type":            "input",
			"seq":             int64(1),
			"up":              false,
			"down":            false,
			"left":            false,
			"right":           true,
			"attack":          false,
		}, false), protocol.ValidationFailureReasonJoinRequired)

		assertValidationFailure(t, protocol.ValidateClientMessage(map[string]any{
			"protocolVersion": int64(protocol.ProtocolVersion),
			"type":            "snapshot_resync",
			"reason":          "manual",
			"lastTick":        int64(12),
			"instanceId":      nil,
		}, false), protocol.ValidationFailureReasonJoinRequired)

		assertValidationFailure(t, protocol.ValidateClientMessage(map[string]any{
			"protocolVersion": int64(protocol.ProtocolVersion),
			"type":            "resume_session",
			"sessionToken":    "resume_token_123",
		}, true), protocol.ValidationFailureReasonAlreadyJoined)

		assertValidationFailure(t, protocol.ValidateClientMessage(map[string]any{
			"protocolVersion": int64(protocol.ProtocolVersion),
			"type":            "join",
			"nickname":        "Link",
		}, true), protocol.ValidationFailureReasonAlreadyJoined)

		resync := protocol.ValidateClientMessage(map[string]any{
			"protocolVersion": int64(protocol.ProtocolVersion),
			"type":            "snapshot_resync",
			"reason":          "tick_gap",
			"lastTick":        int64(21),
			"instanceId":      nil,
		}, true)
		expected := protocol.NewSnapshotResyncMessage(protocol.SnapshotResyncReasonTickGap, protocol.SnapshotResyncOptions{
			LastTick: protocol.Pointer(int64(21)),
		})
		assertValidationResult(t, resync, expected, "")
	})
}

func assertParseResult(t *testing.T, result protocol.ClientMessageParseResult, expected protocol.ClientMessage, expectedReason protocol.ClientMessageParseFailureReason) {
	t.Helper()
	if !result.OK {
		t.Fatalf("expected success, got failure %q", result.Reason)
	}
	if result.Reason != expectedReason {
		t.Fatalf("expected empty reason, got %q", result.Reason)
	}
	if !reflect.DeepEqual(result.Value, expected) {
		t.Fatalf("expected %#v, got %#v", expected, result.Value)
	}
}

func assertParseFailure(t *testing.T, result protocol.ClientMessageParseResult, expected protocol.ClientMessageParseFailureReason) {
	t.Helper()
	if result.OK {
		t.Fatalf("expected failure, got %#v", result.Value)
	}
	if result.Reason != expected {
		t.Fatalf("expected %q, got %q", expected, result.Reason)
	}
}

func assertValidationResult(t *testing.T, result protocol.ValidationResult, expected protocol.ClientMessage, expectedReason protocol.ValidationFailureReason) {
	t.Helper()
	if !result.OK {
		t.Fatalf("expected success, got failure %q", result.Reason)
	}
	if result.Reason != expectedReason {
		t.Fatalf("expected empty reason, got %q", result.Reason)
	}
	if !reflect.DeepEqual(result.Message, expected) {
		t.Fatalf("expected %#v, got %#v", expected, result.Message)
	}
}

func assertValidationFailure(t *testing.T, result protocol.ValidationResult, expected protocol.ValidationFailureReason) {
	t.Helper()
	if result.OK {
		t.Fatalf("expected failure, got %#v", result.Message)
	}
	if result.Reason != expected {
		t.Fatalf("expected %q, got %q", expected, result.Reason)
	}
}
