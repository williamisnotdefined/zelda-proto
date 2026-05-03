package protocol_test

import (
	"encoding/base64"
	"encoding/json"
	"os"
	"path/filepath"
	"reflect"
	"runtime"
	"testing"

	"github.com/williamisnotdefined/zelda-proto/server/internal/codec"
	"github.com/williamisnotdefined/zelda-proto/server/internal/protocol"
)

type protocolFixtureCase struct {
	Name            string          `json:"name"`
	Raw             json.RawMessage `json:"raw"`
	Canonical       json.RawMessage `json:"canonical"`
	ExpectedFailure string          `json:"expectedFailure"`
	MsgpackBase64   string          `json:"msgpackBase64"`
}

type protocolFixture struct {
	ProtocolVersion int64                 `json:"protocolVersion"`
	Cases           []protocolFixtureCase `json:"cases"`
}

func TestProtocolContractFixtures(t *testing.T) {
	fixture := readProtocolFixture(t)
	if fixture.ProtocolVersion != protocol.ProtocolVersion {
		t.Fatalf("expected protocol version %d, got %d", protocol.ProtocolVersion, fixture.ProtocolVersion)
	}

	for _, testCase := range fixture.Cases {
		t.Run(testCase.Name, func(t *testing.T) {
			rawValue, err := codec.ParseJSON(testCase.Raw)
			if err != nil {
				t.Fatalf("ParseJSON(raw): %v", err)
			}

			encodedRaw, err := codec.Marshal(rawValue)
			if err != nil {
				t.Fatalf("Marshal(raw): %v", err)
			}
			if got, want := base64.StdEncoding.EncodeToString(encodedRaw), testCase.MsgpackBase64; got != want {
				t.Fatalf("expected raw base64 %s, got %s", want, got)
			}

			wireBytes, err := base64.StdEncoding.DecodeString(testCase.MsgpackBase64)
			if err != nil {
				t.Fatalf("DecodeString(msgpack): %v", err)
			}

			decodedRaw, err := codec.Decode(wireBytes)
			if err != nil {
				t.Fatalf("Decode(wire): %v", err)
			}
			if !reflect.DeepEqual(decodedRaw, rawValue) {
				t.Fatalf("expected decoded raw %#v, got %#v", rawValue, decodedRaw)
			}

			parsed := protocol.ParseClientMessage(rawValue)
			parsedFromWire := protocol.ParseClientMessage(decodedRaw)

			if testCase.ExpectedFailure != "" {
				expectedReason := protocol.ClientMessageParseFailureReason(testCase.ExpectedFailure)
				assertParseFailure(t, parsed, expectedReason)
				assertParseFailure(t, parsedFromWire, expectedReason)
				return
			}

			canonicalRaw, err := codec.ParseJSON(testCase.Canonical)
			if err != nil {
				t.Fatalf("ParseJSON(canonical): %v", err)
			}
			expected := protocol.ParseClientMessage(canonicalRaw)
			if !expected.OK {
				t.Fatalf("expected canonical parse success, got %q", expected.Reason)
			}

			assertParseResult(t, parsed, expected.Value, "")
			assertParseResult(t, parsedFromWire, expected.Value, "")
		})
	}
}

func readProtocolFixture(t *testing.T) protocolFixture {
	t.Helper()
	_, currentFile, _, ok := runtime.Caller(0)
	if !ok {
		t.Fatal("runtime.Caller failed")
	}

	filePath := filepath.Join(filepath.Dir(currentFile), "..", "..", "..", "testdata", "server-contract", "protocol", "messages.json")
	contents, err := os.ReadFile(filePath)
	if err != nil {
		t.Fatalf("ReadFile(%s): %v", filePath, err)
	}

	var fixture protocolFixture
	if err := json.Unmarshal(contents, &fixture); err != nil {
		t.Fatalf("Unmarshal fixture: %v", err)
	}

	return fixture
}
