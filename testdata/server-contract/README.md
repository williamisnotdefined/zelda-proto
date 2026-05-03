## Server Contract Fixtures

These fixtures freeze the TypeScript-era wire contract that the Go runtime preserves.

- `protocol/messages.json` stores raw client payloads, their canonical parse result or expected failure, and the exact MessagePack payload as base64.
- `snapshot/messages.json` stores canonical snapshot inputs, expected server messages, and the exact MessagePack payload for each snapshot message as base64.
- The JSON payloads are the readable spec. The `msgpackBase64` and `*Base64` fields freeze the wire bytes for future Go tests.

Suggested reuse in Go:

- Read the JSON fixture.
- Decode the base64 field into raw bytes.
- Assert decode, validation, canonicalization, and re-encode behavior against the JSON payload.

All fixtures in this directory are ASCII-only on purpose.
