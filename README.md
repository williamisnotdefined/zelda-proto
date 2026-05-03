# Legends of Gelehk

2D top-down MMO RPG inspired by The Legend of Zelda: A Link to the Past.

## Setup

```bash
npm install
```

Required for the current server runtime:

- Go 1.24+

## Development

```bash
# Run both client and server
npm run dev

# Run each process separately
npm run dev:server   # Go server on :3003
npm run dev:client   # Vite dev server on :5174, proxying to :3003

DEV_STRESS_ENEMIES_PER_CHUNK=40 DEBUG_GAME_METRICS=1 npm run dev:server
```

Current source layout:

- `server/`: authoritative Go runtime
- `client/src/shared/`: protocol types, constants, definitions, and helpers
- `client/src/game-core/`: prediction, interpolation, input, and network helpers

## Server Runtime

```bash
npm run dev:server
npm run build:server
npm run test:server
```

Default development ports:

- Server: `3003`
- Client: `5174`

## Production Deployment

### Building

```bash
# Build both client and server with the Go backend
npm run build

# Start production server
npm start  # Server on port 3001 (serves client + WebSocket)

# Open Cloudflare tunnel after build/start
npm run live:start
```

### Cloudflare Tunnel Setup

This project uses Cloudflare Tunnel (cloudflared) to expose the production server to the internet.

**Important**: The production server runs on port **3001** (not 3003). Ensure your tunnel routes to the correct port.

#### Running the Tunnel

```bash
cloudflared tunnel run wilho
```

#### Tunnel Configuration

Create or update your `~/.cloudflared/config.yml`:

```yaml
tunnel: <your-tunnel-id>
credentials-file: /home/<user>/.cloudflared/<tunnel-id>.json

ingress:
  - hostname: wilho.com.br
    service: http://localhost:3001
  - service: http_status:404
```

**Key Points:**
- WebSocket connections automatically work through Cloudflare Tunnel
- No additional WebSocket configuration needed
- The tunnel forwards both HTTP and WebSocket traffic
- Ensure `service` points to `http://localhost:3001` (production port)

### Troubleshooting Connection Issues

If users get stuck on "Connecting..." in production:

1. **Check Browser Console** - Open DevTools → Console tab
   - Look for `[WebSocket]` log messages
   - Connection errors will show the specific failure reason

2. **Check Network Tab** - DevTools → Network → WS filter
   - Look for `/ws` WebSocket connection
   - Check if handshake is successful (Status 101)
   - Failed connections show status codes and reasons

3. **Verify Tunnel is Running**
   ```bash
   # Check cloudflared process
   ps aux | grep cloudflared
   
   # Check tunnel logs
   cloudflared tunnel info wilho
   ```

4. **Verify Server is Running**
   ```bash
    # Check server process
    ps aux | grep server/bin/server
   
   # Check server is listening on port 3001
   lsof -i :3001
   # Or
   ss -tlnp | grep 3001
   ```

5. **Test Local WebSocket Connection**
   ```bash
   # Using websocat (install: cargo install websocat)
   websocat ws://localhost:3001/ws
   
   # Or using wscat (install: npm i -g wscat)
   wscat -c ws://localhost:3001/ws
   ```

6. **Check Server Logs**
   - Server logs include detailed WebSocket connection info:
     - Client IP and origin
     - Connection attempts
     - Handshake details
     - Connection/disconnection events

7. **Common Issues**
   - **Wrong Port**: Tunnel must route to port 3001, not 3003
   - **Server Not Running**: Ensure `npm start` is active
   - **Firewall**: Check if localhost:3001 is accessible
   - **SSL/TLS**: Cloudflare handles SSL, server uses plain HTTP

### Environment Variables

- `NODE_ENV=production` - Enables production mode (port 3001, serves static files)
- `PORT=<custom_port>` - Override default port (optional)
- `DEV_START_PHASE=<phase>` - Development only. Chooses the phase where new players spawn. Accepted formats: phase id (`phase1`, `phase2`, ... ) or number (`1`, `2`, `3`, ...). If the phase does not exist yet, server falls back to `phase1`.

Example (dev):

```bash
DEV_START_PHASE=2 npm run dev:server
```

## Architecture

- **Server** (Go): Authoritative simulation at 60Hz with separate 20Hz network snapshots
- **Client** (Vite + React + Phaser 3): Rendering, interpolation, prediction/reconciliation, and HUD
- Communication via MessagePack over WebSocket with snapshot delta replication

## Next Steps
- [ ] Player se movimentando rapido double click da seta (cooldown de 5s)
- [ ] Monstros devem ter opacidade para indicar vida baixa ou devemos colocar isso na sprite?
- [ ] Distance weapon (e.g. bow)
- [ ] Select class Warrior Or Mage

## Sprite Sheet Generator

https://codeshack.io/images-sprite-sheet-generator/
https://www.tibiawiki.com.br/wiki/Outfitter?&o=39&an&q
