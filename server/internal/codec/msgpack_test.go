package codec_test

import (
	"encoding/hex"
	"reflect"
	"testing"

	"github.com/williamisnotdefined/zelda-proto/server/internal/codec"
	"github.com/williamisnotdefined/zelda-proto/server/internal/protocol"
)

func TestMarshalOrderedObjectMatchesMsgpackrShape(t *testing.T) {
	encoded, err := codec.Marshal(codec.Object{
		{Key: "a", Value: int64(1)},
		{Key: "b", Value: int64(2)},
		{Key: "c", Value: int64(3)},
	})
	if err != nil {
		t.Fatalf("Marshal: %v", err)
	}

	if got, want := hex.EncodeToString(encoded), "de0003a16101a16202a16303"; got != want {
		t.Fatalf("expected %s, got %s", want, got)
	}

	decoded, err := codec.Decode(encoded)
	if err != nil {
		t.Fatalf("Decode: %v", err)
	}

	expected := codec.Object{
		{Key: "a", Value: int64(1)},
		{Key: "b", Value: int64(2)},
		{Key: "c", Value: int64(3)},
	}
	if !reflect.DeepEqual(decoded, expected) {
		t.Fatalf("expected %#v, got %#v", expected, decoded)
	}
}

func TestMarshalStructUsesTaggedFieldOrder(t *testing.T) {
	encoded, err := codec.Marshal(protocol.NewJoinMessage("Link"))
	if err != nil {
		t.Fatalf("Marshal: %v", err)
	}

	decoded, err := codec.Decode(encoded)
	if err != nil {
		t.Fatalf("Decode: %v", err)
	}

	expected := codec.Object{
		{Key: "protocolVersion", Value: int64(protocol.ProtocolVersion)},
		{Key: "type", Value: "join"},
		{Key: "nickname", Value: "Link"},
	}
	if !reflect.DeepEqual(decoded, expected) {
		t.Fatalf("expected %#v, got %#v", expected, decoded)
	}
}
