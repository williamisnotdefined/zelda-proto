package id

import (
	"bytes"
	"errors"
	"io"
	"strings"
	"testing"
)

func TestNewSessionTokenLength(t *testing.T) {
	t.Parallel()

	token, err := NewGenerator(nil).NewSessionToken()
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}

	if len(token) != DefaultTokenLength {
		t.Fatalf("expected length %d, got %d", DefaultTokenLength, len(token))
	}

	for _, char := range token {
		if !strings.ContainsRune(Alphabet, char) {
			t.Fatalf("token contains invalid character %q", char)
		}
	}
}

func TestNewTokenInvalidLength(t *testing.T) {
	t.Parallel()

	_, err := NewGenerator(nil).NewToken(0)
	if !errors.Is(err, ErrInvalidLength) {
		t.Fatalf("expected ErrInvalidLength, got %v", err)
	}

	_, err = NewGenerator(nil).NewToken(-3)
	if !errors.Is(err, ErrInvalidLength) {
		t.Fatalf("expected ErrInvalidLength, got %v", err)
	}
}

func TestNewTokenUsesAlphabetDeterministically(t *testing.T) {
	t.Parallel()

	source := bytes.NewReader([]byte{0, 1, 2, 63, 64})
	token, err := NewGenerator(source).NewToken(5)
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}

	mask := byte(len(Alphabet) - 1)
	expected := []byte{
		Alphabet[0&mask],
		Alphabet[1&mask],
		Alphabet[2&mask],
		Alphabet[63&mask],
		Alphabet[64&mask],
	}

	if token != string(expected) {
		t.Fatalf("expected %q, got %q", string(expected), token)
	}
}

type errReader struct{}

func (errReader) Read(_ []byte) (int, error) {
	return 0, io.ErrUnexpectedEOF
}

func TestNewTokenPropagatesReaderError(t *testing.T) {
	t.Parallel()

	_, err := NewGenerator(errReader{}).NewToken(5)
	if !errors.Is(err, io.ErrUnexpectedEOF) {
		t.Fatalf("expected io.ErrUnexpectedEOF, got %v", err)
	}
}

func TestNewTokenUniqueness(t *testing.T) {
	t.Parallel()

	generator := NewGenerator(nil)
	seen := make(map[string]struct{}, 1024)
	for index := 0; index < 1024; index += 1 {
		token, err := generator.NewSessionToken()
		if err != nil {
			t.Fatalf("unexpected error: %v", err)
		}
		if _, exists := seen[token]; exists {
			t.Fatalf("duplicate token generated: %q", token)
		}
		seen[token] = struct{}{}
	}
}
