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

## Architecture

- **Server** (Node.js + ws): Authoritative game server with 60-tick game loop
- **Client** (Vite + React + Phaser 3): Rendering, input, and HUD
- Communication via JSON over WebSocket

## Next Steps

- [ ] Distance weapon (e.g. bow)
- [ ] client assets cleanup, delete unused assets
- [ ] Add "toasty" when hp < 10% for the third time without dying
- [ ] Add music and mute button top right of the screen.
- [] In top of HUD we can see gelehk name and hp bar, but we should not see the player name and hp bar. Each gelehk should have its own hp bar.
- [ ] HP bar should be on the top left, not on the bottom left.
- [ ] Slime now is Blob, rename it all places we use "slime" to "blob".


