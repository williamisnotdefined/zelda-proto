# Legends of Gelehk

2D top-down MMO RPG inspired by The Legend of Zelda: A Link to the Past.

## Setup

```bash
npm install
```

## Development

```bash
# Run both client and server
npm run dev

# Or separately
npm run dev:server   # WebSocket server on :3001
npm run dev:client   # Vite dev server on :5173
```

## Architecture

- **Server** (Node.js + ws): Authoritative game server with 60-tick game loop
- **Client** (Vite + React + Phaser 3): Rendering, input, and HUD
- Communication via JSON over WebSocket

## Next Steps

- [ ] Linting and formatting
- [ ] Table of players online with kills and deaths in HUD
- [ ] Chat UI
- [ ] Modal requiring username on first connection
