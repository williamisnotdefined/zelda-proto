package codec_test

import (
	"testing"

	"github.com/williamisnotdefined/zelda-proto/server/internal/codec"
)

func FuzzDecodeRoundTrip(f *testing.F) {
	seeds := [][]byte{
		{},
		{0xc0},
		{0xc2},
		{0xc3},
		{0x91, 0x01},
		{0xde, 0x00, 0x01, 0xa1, 'a', 0x01},
		{0xdd, 0xff, 0xff, 0xff, 0xff},
		{0xdf, 0xff, 0xff, 0xff, 0xff},
	}
	for _, seed := range seeds {
		f.Add(seed)
	}

	f.Fuzz(func(t *testing.T, data []byte) {
		decoded, err := codec.Decode(data)
		if err != nil {
			return
		}
		encoded, err := codec.Marshal(decoded)
		if err != nil {
			t.Fatalf("Marshal(decoded %T): %v", decoded, err)
		}
		if _, err := codec.Decode(encoded); err != nil {
			t.Fatalf("Decode(Marshal(decoded)): %v", err)
		}
	})
}
