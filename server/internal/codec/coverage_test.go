package codec

import (
	"encoding/json"
	"reflect"
	"testing"
)

func TestRoundtripScalarsAndCollections(t *testing.T) {
	t.Parallel()

	cases := []any{
		nil,
		true, false,
		int64(0), int64(1), int64(-1), int64(127), int64(-32), int64(128), int64(-129),
		int64(32767), int64(-32768), int64(32768), int64(-32769),
		int64(2147483647), int64(-2147483648), int64(2147483648), int64(-2147483649),
		uint64(255), uint64(65535), uint64(4294967295), uint64(1 << 40),
		float32(1.5), float64(3.14159),
		"", "hello", string(make([]byte, 40)), string(make([]byte, 300)),
		[]byte{1, 2, 3, 4},
		[]any{int64(1), "two", true},
		map[string]any{"a": int64(1), "b": "two"},
	}
	for _, value := range cases {
		encoded, err := Marshal(value)
		if err != nil {
			t.Fatalf("Marshal(%v): %v", value, err)
		}
		_, err = Decode(encoded)
		if err != nil {
			t.Fatalf("Decode after Marshal(%v): %v", value, err)
		}
	}
}

func TestObjectLookupAndLen(t *testing.T) {
	t.Parallel()

	o := Object{{Key: "a", Value: int64(1)}, {Key: "b", Value: "x"}}
	if v, ok := o.Lookup("a"); !ok || v != int64(1) {
		t.Fatalf("lookup a: got %v ok=%v", v, ok)
	}
	if _, ok := o.Lookup("missing"); ok {
		t.Fatalf("missing should not be found")
	}
	if o.Len() != 2 {
		t.Fatalf("len: %d", o.Len())
	}
	m := o.ToMap()
	if m["a"] != int64(1) || m["b"] != "x" {
		t.Fatalf("ToMap: %v", m)
	}
}

func TestObjectUnmarshalJSON(t *testing.T) {
	t.Parallel()

	var o Object
	if err := json.Unmarshal([]byte(`{"a":1,"b":"x","c":true,"d":null,"e":[1,2],"f":{"k":"v"}}`), &o); err != nil {
		t.Fatalf("UnmarshalJSON: %v", err)
	}
	if o.Len() != 6 {
		t.Fatalf("len: %d", o.Len())
	}
	got := o.ToMap()
	if got["a"] != int64(1) {
		t.Fatalf("a: %v", got["a"])
	}
}

func TestParseJSONReturnsObject(t *testing.T) {
	t.Parallel()

	v, err := ParseJSON([]byte(`{"a":1.5,"b":[true,null]}`))
	if err != nil {
		t.Fatalf("ParseJSON: %v", err)
	}
	o, ok := v.(Object)
	if !ok {
		t.Fatalf("expected Object, got %T", v)
	}
	if a, _ := o.Lookup("a"); !reflect.DeepEqual(a, 1.5) {
		t.Fatalf("a: %v", a)
	}
}

func TestEncodeStructWithTags(t *testing.T) {
	t.Parallel()

	type sample struct {
		Name   string  `msgpack:"name"`
		Count  int64   `msgpack:"count"`
		Skip   string  `msgpack:"-"`
		Empty  string  `msgpack:"empty,omitempty"`
		Nested *sample `msgpack:"nested,omitempty"`
	}
	s := sample{Name: "x", Count: 7}
	encoded, err := Marshal(s)
	if err != nil {
		t.Fatalf("Marshal struct: %v", err)
	}
	decoded, err := Decode(encoded)
	if err != nil {
		t.Fatalf("Decode struct: %v", err)
	}
	o, ok := decoded.(Object)
	if !ok {
		t.Fatalf("expected Object, got %T", decoded)
	}
	if v, _ := o.Lookup("name"); v != "x" {
		t.Fatalf("name: %v", v)
	}
}

func TestDecodeRejectsDeclaredCollectionLengthsBeyondPayload(t *testing.T) {
	t.Parallel()

	cases := [][]byte{
		{0xdd, 0xff, 0xff, 0xff, 0xff}, // array32 length without payload
		{0xdf, 0xff, 0xff, 0xff, 0xff}, // map32 length without payload
		{0xdc, 0x00, 0x02, 0xc0},       // array16 says 2 items, only 1 byte remains
		{0xde, 0x00, 0x01, 0xa0},       // map16 says 1 pair, only key remains
	}
	for _, data := range cases {
		if _, err := Decode(data); err == nil {
			t.Fatalf("expected Decode(%x) to fail", data)
		}
	}
}
