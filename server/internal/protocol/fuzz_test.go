package protocol_test

import (
	"testing"

	"github.com/williamisnotdefined/zelda-proto/server/internal/codec"
	"github.com/williamisnotdefined/zelda-proto/server/internal/protocol"
)

func FuzzParseClientMessageFromMsgpack(f *testing.F) {
	seedMessages := []any{
		protocol.NewJoinMessage("Link"),
		protocol.NewResumeSessionMessage("abcdefghijklmnopqrstuvwxyzABCDEF123456"),
		protocol.NewInputMessage(1, protocol.ClientInputState{Right: true, Dash: true}),
		protocol.NewSnapshotResyncMessage(protocol.SnapshotResyncReasonTickGap, protocol.SnapshotResyncOptions{}),
	}
	for _, msg := range seedMessages {
		data, err := codec.Marshal(msg)
		if err != nil {
			f.Fatalf("Marshal(seed): %v", err)
		}
		f.Add(data)
	}
	f.Add([]byte{0xdf, 0xff, 0xff, 0xff, 0xff})

	f.Fuzz(func(t *testing.T, data []byte) {
		decoded, err := codec.Decode(data)
		if err != nil {
			return
		}
		parsed := protocol.ParseClientMessage(decoded)
		if !parsed.OK {
			return
		}
		encoded, err := codec.Marshal(parsed.Value)
		if err != nil {
			t.Fatalf("Marshal(parsed %T): %v", parsed.Value, err)
		}
		roundTrip, err := codec.Decode(encoded)
		if err != nil {
			t.Fatalf("Decode(Marshal(parsed)): %v", err)
		}
		reparsed := protocol.ParseClientMessage(roundTrip)
		if !reparsed.OK {
			t.Fatalf("expected parsed message to reparse, got %q", reparsed.Reason)
		}
		if reparsed.Value.MessageType() != parsed.Value.MessageType() {
			t.Fatalf("message type changed from %q to %q", parsed.Value.MessageType(), reparsed.Value.MessageType())
		}
	})
}
