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
npm run dev:server   # WebSocket server on :3002
npm run dev:client   # Vite dev server on :5173
```

## Production Deployment

### Building

```bash
# Build both client and server
npm run build

# Start production server
npm start  # Server on port 3001 (serves client + WebSocket)
```

### Cloudflare Tunnel Setup

This project uses Cloudflare Tunnel (cloudflared) to expose the production server to the internet.

**Important**: The production server runs on port **3001** (not 3002). Ensure your tunnel routes to the correct port.

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
   ps aux | grep node
   
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
   - **Wrong Port**: Tunnel must route to port 3001, not 3002
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

- **Server** (Node.js + ws): Authoritative simulation at 60Hz with separate 20Hz network snapshots
- **Client** (Vite + React + Phaser 3): Rendering, interpolation, prediction/reconciliation, and HUD
- Communication via MessagePack over WebSocket with snapshot delta replication

## Next Steps

- [ ] Pesquisar sobre baixa performance de gifs
- [ ] Ataque especial do Gelehk
- [ ] Dragon Lord deve tocar fire field na diagonal
- [ ] Dragon lord quando morre precisa deixar portal para a fase 3
- [ ] Fase 3
- [ ] Distance weapon (e.g. bow)
- [ ] client assets cleanup, delete unused assets


## Sprite Sheet Generator

https://codeshack.io/images-sprite-sheet-generator/
