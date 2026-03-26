package codec

import (
	"bytes"
	"encoding/binary"
	"errors"
	"fmt"
	"math"
	"reflect"
	"sort"
	"strings"
)

var errUnsupportedType = errors.New("codec: unsupported value type")

func Marshal(value any) ([]byte, error) {
	buffer := &bytes.Buffer{}
	if err := encodeValue(buffer, reflect.ValueOf(value)); err != nil {
		return nil, err
	}
	return buffer.Bytes(), nil
}

func Decode(data []byte) (any, error) {
	decoder := decoder{data: data}
	value, err := decoder.decodeValue()
	if err != nil {
		return nil, err
	}
	if decoder.offset != len(decoder.data) {
		return nil, fmt.Errorf("codec: trailing %d bytes", len(decoder.data)-decoder.offset)
	}
	return value, nil
}

func encodeValue(buffer *bytes.Buffer, value reflect.Value) error {
	if !value.IsValid() {
		buffer.WriteByte(0xc0)
		return nil
	}

	if value.CanInterface() {
		switch typed := value.Interface().(type) {
		case Object:
			return encodeObject(buffer, typed)
		case Field:
			return fmt.Errorf("codec: cannot encode standalone field %q", typed.Key)
		}
	}

	switch value.Kind() {
	case reflect.Interface, reflect.Pointer:
		if value.IsNil() {
			buffer.WriteByte(0xc0)
			return nil
		}
		return encodeValue(buffer, value.Elem())
	case reflect.Bool:
		if value.Bool() {
			buffer.WriteByte(0xc3)
		} else {
			buffer.WriteByte(0xc2)
		}
		return nil
	case reflect.String:
		return encodeString(buffer, value.String())
	case reflect.Int, reflect.Int8, reflect.Int16, reflect.Int32, reflect.Int64:
		return encodeInt(buffer, value.Int())
	case reflect.Uint, reflect.Uint8, reflect.Uint16, reflect.Uint32, reflect.Uint64, reflect.Uintptr:
		return encodeUint(buffer, value.Uint())
	case reflect.Float32, reflect.Float64:
		buffer.WriteByte(0xcb)
		return binary.Write(buffer, binary.BigEndian, value.Convert(reflect.TypeOf(float64(0))).Float())
	case reflect.Slice:
		if value.IsNil() {
			buffer.WriteByte(0xc0)
			return nil
		}
		if value.Type().Elem().Kind() == reflect.Uint8 {
			return encodeBytes(buffer, value.Bytes())
		}
		return encodeArray(buffer, value)
	case reflect.Array:
		return encodeArray(buffer, value)
	case reflect.Map:
		return encodeMap(buffer, value)
	case reflect.Struct:
		return encodeStruct(buffer, value)
	default:
		return fmt.Errorf("%w: %s", errUnsupportedType, value.Type())
	}
}

func encodeObject(buffer *bytes.Buffer, object Object) error {
	if err := encodeMapHeader(buffer, len(object)); err != nil {
		return err
	}

	for _, field := range object {
		if err := encodeString(buffer, field.Key); err != nil {
			return err
		}
		if err := encodeValue(buffer, reflect.ValueOf(field.Value)); err != nil {
			return err
		}
	}

	return nil
}

func encodeStruct(buffer *bytes.Buffer, value reflect.Value) error {
	type encodedField struct {
		name  string
		value reflect.Value
	}

	fields := make([]encodedField, 0, value.NumField())
	valueType := value.Type()
	for index := 0; index < value.NumField(); index += 1 {
		field := valueType.Field(index)
		if field.PkgPath != "" {
			continue
		}

		name, omitEmpty, skip := parseTag(field.Tag.Get("msgpack"), field.Name)
		if skip {
			continue
		}

		fieldReflectValue := value.Field(index)
		if omitEmpty && isEmptyValue(fieldReflectValue) {
			continue
		}

		fields = append(fields, encodedField{name: name, value: fieldReflectValue})
	}

	if err := encodeMapHeader(buffer, len(fields)); err != nil {
		return err
	}

	for _, field := range fields {
		if err := encodeString(buffer, field.name); err != nil {
			return err
		}
		if err := encodeValue(buffer, field.value); err != nil {
			return err
		}
	}

	return nil
}

func encodeMap(buffer *bytes.Buffer, value reflect.Value) error {
	if value.IsNil() {
		buffer.WriteByte(0xc0)
		return nil
	}

	keys := value.MapKeys()
	sortedKeys := make([]string, 0, len(keys))
	entries := make(map[string]reflect.Value, len(keys))
	for _, key := range keys {
		if key.Kind() != reflect.String {
			return fmt.Errorf("%w: map key %s", errUnsupportedType, key.Type())
		}
		stringKey := key.String()
		sortedKeys = append(sortedKeys, stringKey)
		entries[stringKey] = value.MapIndex(key)
	}
	sort.Strings(sortedKeys)

	if err := encodeMapHeader(buffer, len(sortedKeys)); err != nil {
		return err
	}

	for _, key := range sortedKeys {
		if err := encodeString(buffer, key); err != nil {
			return err
		}
		if err := encodeValue(buffer, entries[key]); err != nil {
			return err
		}
	}

	return nil
}

func encodeArray(buffer *bytes.Buffer, value reflect.Value) error {
	length := value.Len()
	if length <= 15 {
		buffer.WriteByte(0x90 | byte(length))
	} else if length <= math.MaxUint16 {
		buffer.WriteByte(0xdc)
		if err := binary.Write(buffer, binary.BigEndian, uint16(length)); err != nil {
			return err
		}
	} else {
		buffer.WriteByte(0xdd)
		if err := binary.Write(buffer, binary.BigEndian, uint32(length)); err != nil {
			return err
		}
	}

	for index := 0; index < length; index += 1 {
		if err := encodeValue(buffer, value.Index(index)); err != nil {
			return err
		}
	}

	return nil
}

func encodeBytes(buffer *bytes.Buffer, value []byte) error {
	length := len(value)
	if length <= math.MaxUint8 {
		buffer.WriteByte(0xc4)
		buffer.WriteByte(byte(length))
	} else if length <= math.MaxUint16 {
		buffer.WriteByte(0xc5)
		if err := binary.Write(buffer, binary.BigEndian, uint16(length)); err != nil {
			return err
		}
	} else {
		buffer.WriteByte(0xc6)
		if err := binary.Write(buffer, binary.BigEndian, uint32(length)); err != nil {
			return err
		}
	}
	_, err := buffer.Write(value)
	return err
}

func encodeMapHeader(buffer *bytes.Buffer, length int) error {
	if length <= math.MaxUint16 {
		buffer.WriteByte(0xde)
		return binary.Write(buffer, binary.BigEndian, uint16(length))
	}

	buffer.WriteByte(0xdf)
	return binary.Write(buffer, binary.BigEndian, uint32(length))
}

func encodeString(buffer *bytes.Buffer, value string) error {
	length := len(value)
	if length <= 31 {
		buffer.WriteByte(0xa0 | byte(length))
	} else if length <= math.MaxUint8 {
		buffer.WriteByte(0xd9)
		buffer.WriteByte(byte(length))
	} else if length <= math.MaxUint16 {
		buffer.WriteByte(0xda)
		if err := binary.Write(buffer, binary.BigEndian, uint16(length)); err != nil {
			return err
		}
	} else {
		buffer.WriteByte(0xdb)
		if err := binary.Write(buffer, binary.BigEndian, uint32(length)); err != nil {
			return err
		}
	}

	_, err := buffer.WriteString(value)
	return err
}

func encodeInt(buffer *bytes.Buffer, value int64) error {
	if value >= 0 {
		return encodeUint(buffer, uint64(value))
	}

	switch {
	case value >= -32:
		buffer.WriteByte(byte(int8(value)))
	case value >= math.MinInt8:
		buffer.WriteByte(0xd0)
		buffer.WriteByte(byte(int8(value)))
	case value >= math.MinInt16:
		buffer.WriteByte(0xd1)
		return binary.Write(buffer, binary.BigEndian, int16(value))
	case value >= math.MinInt32:
		buffer.WriteByte(0xd2)
		return binary.Write(buffer, binary.BigEndian, int32(value))
	default:
		buffer.WriteByte(0xd3)
		return binary.Write(buffer, binary.BigEndian, value)
	}

	return nil
}

func encodeUint(buffer *bytes.Buffer, value uint64) error {
	switch {
	case value <= 0x7f:
		buffer.WriteByte(byte(value))
	case value <= math.MaxUint8:
		buffer.WriteByte(0xcc)
		buffer.WriteByte(byte(value))
	case value <= math.MaxUint16:
		buffer.WriteByte(0xcd)
		return binary.Write(buffer, binary.BigEndian, uint16(value))
	case value <= math.MaxUint32:
		buffer.WriteByte(0xce)
		return binary.Write(buffer, binary.BigEndian, uint32(value))
	default:
		buffer.WriteByte(0xcf)
		return binary.Write(buffer, binary.BigEndian, value)
	}

	return nil
}

func parseTag(tag string, fieldName string) (name string, omitEmpty bool, skip bool) {
	if tag == "-" {
		return "", false, true
	}
	if tag == "" {
		return fieldName, false, false
	}

	parts := strings.Split(tag, ",")
	name = parts[0]
	if name == "" {
		name = fieldName
	}
	for _, part := range parts[1:] {
		if part == "omitempty" {
			omitEmpty = true
		}
	}
	return name, omitEmpty, false
}

func isEmptyValue(value reflect.Value) bool {
	switch value.Kind() {
	case reflect.Array, reflect.Map, reflect.Slice, reflect.String:
		return value.Len() == 0
	case reflect.Bool:
		return !value.Bool()
	case reflect.Int, reflect.Int8, reflect.Int16, reflect.Int32, reflect.Int64:
		return value.Int() == 0
	case reflect.Uint, reflect.Uint8, reflect.Uint16, reflect.Uint32, reflect.Uint64, reflect.Uintptr:
		return value.Uint() == 0
	case reflect.Float32, reflect.Float64:
		return value.Float() == 0
	case reflect.Interface, reflect.Pointer:
		return value.IsNil()
	case reflect.Struct:
		return value.IsZero()
	default:
		return false
	}
}

type decoder struct {
	data   []byte
	offset int
}

func (d *decoder) decodeValue() (any, error) {
	prefix, err := d.readByte()
	if err != nil {
		return nil, err
	}

	switch {
	case prefix <= 0x7f:
		return int64(prefix), nil
	case prefix >= 0xe0:
		return int64(int8(prefix)), nil
	case prefix >= 0xa0 && prefix <= 0xbf:
		return d.readString(int(prefix & 0x1f))
	case prefix >= 0x90 && prefix <= 0x9f:
		return d.readArray(int(prefix & 0x0f))
	case prefix >= 0x80 && prefix <= 0x8f:
		return d.readObject(int(prefix & 0x0f))
	}

	switch prefix {
	case 0xc0:
		return nil, nil
	case 0xc2:
		return false, nil
	case 0xc3:
		return true, nil
	case 0xc4:
		length, err := d.readUint8()
		if err != nil {
			return nil, err
		}
		return d.readBytes(int(length))
	case 0xc5:
		length, err := d.readUint16()
		if err != nil {
			return nil, err
		}
		return d.readBytes(int(length))
	case 0xc6:
		length, err := d.readUint32()
		if err != nil {
			return nil, err
		}
		return d.readBytes(int(length))
	case 0xca:
		value, err := d.readFloat32()
		if err != nil {
			return nil, err
		}
		return float64(value), nil
	case 0xcb:
		return d.readFloat64()
	case 0xcc:
		value, err := d.readUint8()
		return int64(value), err
	case 0xcd:
		value, err := d.readUint16()
		return int64(value), err
	case 0xce:
		value, err := d.readUint32()
		return int64(value), err
	case 0xcf:
		value, err := d.readUint64()
		if err != nil {
			return nil, err
		}
		if value <= math.MaxInt64 {
			return int64(value), nil
		}
		return value, nil
	case 0xd0:
		value, err := d.readInt8()
		return int64(value), err
	case 0xd1:
		value, err := d.readInt16()
		return int64(value), err
	case 0xd2:
		value, err := d.readInt32()
		return int64(value), err
	case 0xd3:
		value, err := d.readInt64()
		return value, err
	case 0xd9:
		length, err := d.readUint8()
		if err != nil {
			return nil, err
		}
		return d.readString(int(length))
	case 0xda:
		length, err := d.readUint16()
		if err != nil {
			return nil, err
		}
		return d.readString(int(length))
	case 0xdb:
		length, err := d.readUint32()
		if err != nil {
			return nil, err
		}
		return d.readString(int(length))
	case 0xdc:
		length, err := d.readUint16()
		if err != nil {
			return nil, err
		}
		return d.readArray(int(length))
	case 0xdd:
		length, err := d.readUint32()
		if err != nil {
			return nil, err
		}
		return d.readArray(int(length))
	case 0xde:
		length, err := d.readUint16()
		if err != nil {
			return nil, err
		}
		return d.readObject(int(length))
	case 0xdf:
		length, err := d.readUint32()
		if err != nil {
			return nil, err
		}
		return d.readObject(int(length))
	default:
		return nil, fmt.Errorf("codec: unsupported msgpack prefix 0x%x", prefix)
	}
}

func (d *decoder) readObject(length int) (Object, error) {
	object := make(Object, 0, length)
	for index := 0; index < length; index += 1 {
		keyValue, err := d.decodeValue()
		if err != nil {
			return nil, err
		}

		key, ok := keyValue.(string)
		if !ok {
			return nil, fmt.Errorf("codec: expected string map key, got %T", keyValue)
		}

		value, err := d.decodeValue()
		if err != nil {
			return nil, err
		}

		object = append(object, Field{Key: key, Value: value})
	}
	return object, nil
}

func (d *decoder) readArray(length int) ([]any, error) {
	values := make([]any, 0, length)
	for index := 0; index < length; index += 1 {
		value, err := d.decodeValue()
		if err != nil {
			return nil, err
		}
		values = append(values, value)
	}
	return values, nil
}

func (d *decoder) readString(length int) (string, error) {
	bytes, err := d.readBytes(length)
	if err != nil {
		return "", err
	}
	return string(bytes), nil
}

func (d *decoder) readBytes(length int) ([]byte, error) {
	if d.offset+length > len(d.data) {
		return nil, ioErrUnexpectedEOF(length, len(d.data)-d.offset)
	}
	bytes := d.data[d.offset : d.offset+length]
	d.offset += length
	return append([]byte(nil), bytes...), nil
}

func (d *decoder) readByte() (byte, error) {
	if d.offset >= len(d.data) {
		return 0, ioErrUnexpectedEOF(1, 0)
	}
	value := d.data[d.offset]
	d.offset += 1
	return value, nil
}

func (d *decoder) readUint8() (uint8, error) {
	value, err := d.readByte()
	return uint8(value), err
}

func (d *decoder) readUint16() (uint16, error) {
	bytes, err := d.readBytes(2)
	if err != nil {
		return 0, err
	}
	return binary.BigEndian.Uint16(bytes), nil
}

func (d *decoder) readUint32() (uint32, error) {
	bytes, err := d.readBytes(4)
	if err != nil {
		return 0, err
	}
	return binary.BigEndian.Uint32(bytes), nil
}

func (d *decoder) readUint64() (uint64, error) {
	bytes, err := d.readBytes(8)
	if err != nil {
		return 0, err
	}
	return binary.BigEndian.Uint64(bytes), nil
}

func (d *decoder) readInt8() (int8, error) {
	value, err := d.readByte()
	return int8(value), err
}

func (d *decoder) readInt16() (int16, error) {
	bytes, err := d.readBytes(2)
	if err != nil {
		return 0, err
	}
	return int16(binary.BigEndian.Uint16(bytes)), nil
}

func (d *decoder) readInt32() (int32, error) {
	bytes, err := d.readBytes(4)
	if err != nil {
		return 0, err
	}
	return int32(binary.BigEndian.Uint32(bytes)), nil
}

func (d *decoder) readInt64() (int64, error) {
	bytes, err := d.readBytes(8)
	if err != nil {
		return 0, err
	}
	return int64(binary.BigEndian.Uint64(bytes)), nil
}

func (d *decoder) readFloat32() (float32, error) {
	bytes, err := d.readBytes(4)
	if err != nil {
		return 0, err
	}
	return math.Float32frombits(binary.BigEndian.Uint32(bytes)), nil
}

func (d *decoder) readFloat64() (float64, error) {
	bytes, err := d.readBytes(8)
	if err != nil {
		return 0, err
	}
	return math.Float64frombits(binary.BigEndian.Uint64(bytes)), nil
}

func ioErrUnexpectedEOF(want int, have int) error {
	return fmt.Errorf("codec: unexpected EOF reading %d bytes with %d available", want, have)
}
