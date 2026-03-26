package codec

import (
	"bytes"
	"encoding/json"
	"fmt"
	"io"
	"strconv"
	"strings"
)

type Field struct {
	Key   string
	Value any
}

type Object []Field

func (o Object) Lookup(key string) (any, bool) {
	for index := len(o) - 1; index >= 0; index -= 1 {
		if o[index].Key == key {
			return o[index].Value, true
		}
	}

	return nil, false
}

func (o Object) Len() int {
	return len(o)
}

func (o Object) ToMap() map[string]any {
	out := make(map[string]any, len(o))
	for _, field := range o {
		out[field.Key] = field.Value
	}
	return out
}

func (o *Object) UnmarshalJSON(data []byte) error {
	value, err := ParseJSON(data)
	if err != nil {
		return err
	}

	objectValue, ok := value.(Object)
	if !ok {
		return fmt.Errorf("codec: expected json object, got %T", value)
	}

	*o = objectValue
	return nil
}

func ParseJSON(data []byte) (any, error) {
	decoder := json.NewDecoder(bytes.NewReader(data))
	decoder.UseNumber()

	value, err := decodeJSONValue(decoder)
	if err != nil {
		return nil, err
	}

	if _, err := decoder.Token(); err != io.EOF {
		if err == nil {
			return nil, fmt.Errorf("codec: unexpected trailing json token")
		}
		return nil, err
	}

	return value, nil
}

func decodeJSONValue(decoder *json.Decoder) (any, error) {
	token, err := decoder.Token()
	if err != nil {
		return nil, err
	}

	switch typed := token.(type) {
	case json.Delim:
		switch typed {
		case '{':
			fields := make(Object, 0)
			for decoder.More() {
				keyToken, err := decoder.Token()
				if err != nil {
					return nil, err
				}

				key, ok := keyToken.(string)
				if !ok {
					return nil, fmt.Errorf("codec: expected object key string, got %T", keyToken)
				}

				value, err := decodeJSONValue(decoder)
				if err != nil {
					return nil, err
				}

				fields = append(fields, Field{Key: key, Value: value})
			}

			endToken, err := decoder.Token()
			if err != nil {
				return nil, err
			}
			if endToken != json.Delim('}') {
				return nil, fmt.Errorf("codec: expected object end, got %v", endToken)
			}

			return fields, nil
		case '[':
			values := make([]any, 0)
			for decoder.More() {
				value, err := decodeJSONValue(decoder)
				if err != nil {
					return nil, err
				}
				values = append(values, value)
			}

			endToken, err := decoder.Token()
			if err != nil {
				return nil, err
			}
			if endToken != json.Delim(']') {
				return nil, fmt.Errorf("codec: expected array end, got %v", endToken)
			}

			return values, nil
		default:
			return nil, fmt.Errorf("codec: unexpected json delimiter %q", typed)
		}
	case json.Number:
		return parseJSONNumber(typed)
	case string, bool, nil:
		return typed, nil
	default:
		return nil, fmt.Errorf("codec: unsupported json token %T", token)
	}
}

func parseJSONNumber(value json.Number) (any, error) {
	raw := value.String()
	if !strings.ContainsAny(raw, ".eE") {
		parsedInt, err := strconv.ParseInt(raw, 10, 64)
		if err == nil {
			return parsedInt, nil
		}
	}

	parsedFloat, err := value.Float64()
	if err != nil {
		return nil, err
	}

	return parsedFloat, nil
}
