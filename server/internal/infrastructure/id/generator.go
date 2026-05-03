// Package id generates URL-safe identifiers compatible with the nanoid alphabet
// used by the runtime session tokens.
package id

import (
	"crypto/rand"
	"errors"
	"io"
)

// Alphabet is the URL-safe nanoid alphabet (A-Za-z0-9_-) used when persisting
// session tokens.
const Alphabet = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789_-"

// DefaultTokenLength matches the nanoid default of 21 characters used for
// session tokens.
const DefaultTokenLength = 21

// ErrInvalidLength is returned when a non-positive length is requested.
var ErrInvalidLength = errors.New("id: length must be positive")

// Generator produces identifiers using the given random source.
type Generator struct {
	source io.Reader
}

// NewGenerator returns a Generator backed by source. When source is nil the
// crypto/rand.Reader is used.
func NewGenerator(source io.Reader) *Generator {
	if source == nil {
		source = rand.Reader
	}
	return &Generator{source: source}
}

// NewToken returns a freshly generated token of length characters.
func (g *Generator) NewToken(length int) (string, error) {
	if length <= 0 {
		return "", ErrInvalidLength
	}

	buffer := make([]byte, length)
	if _, err := io.ReadFull(g.source, buffer); err != nil {
		return "", err
	}

	mask := byte(len(Alphabet) - 1)
	for index := range buffer {
		buffer[index] = Alphabet[buffer[index]&mask]
	}

	return string(buffer), nil
}

// NewSessionToken returns a token of DefaultTokenLength characters.
func (g *Generator) NewSessionToken() (string, error) {
	return g.NewToken(DefaultTokenLength)
}
