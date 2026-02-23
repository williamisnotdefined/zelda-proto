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

- [ ] Table of players online with kills and deaths in HUD
- [ ] Chat UI
- [ ] Modal requiring username on first connection
- [ ] Minimap


## Next Steps ChatGPT
⚡ O que pode melhorar (com impacto alto)
1. Interpolação / previsão no client

Hoje o jogador pode parecer “teleportar” ou congelar se a rede oscilar.
👉 Implemente lerp entre estados recebidos do servidor pra suavizar movimento.

2. Separar lógica de animação do estado

No Player e Slime você pode ter um state machine (Idle / Walk / Attack) ao invés de setar animação manualmente toda vez.
Isso deixa mais fácil implementar combos e habilidades depois.

3. Hitbox de ataque no servidor

Seu servidor já tem GameLoop e Physics — então em vez de o client dizer “toquei o slime”,
o client manda intenção de ataque, e o servidor cria hitbox temporária no tick e detecta colisão internamente. Isso evita cheats.

4. Sistema de entidades sincronizadas

Hoje você provavelmente manda snapshot completo de todos players/enemies sempre.
Melhor é enviar diffs ou apenas o que mudou (pos, state, hp). Isso melhora performance.

5. Organizar assets (sprites) com atlas/spritesheets

Carregar sprites via atlas no Phaser facilita animação e reduz chamadas de desenho.

📈 Recomendações de features imediatas

Aqui estão as tarefas que mais vão elevar a qualidade e servir como próximas milestones:

🔹 Chat UI

Um chat simples via WebSocket — ótimo pra engajar players.

🔹 Tabela de jogadores

K/D, vida, nível — útil pra feedback.

🔹 Username no login

Hoje players provavelmente têm nomes aleatórios — algo para identidade.

🔹 Slime spawn e respawn

Adicionar lógica de spawn automático no mundo.

🔹 Boss “Gelehk”

Integrar boss reforçado com fases e ataques únicos.

🧠 Avaliação geral

Seu projeto não é mais protótipo — já é uma base sólida para:

coop online real

combate sincronizado

inimigos AI

futuras features como loot, classes, dungeons

Isso coloca o jogo num patamar que muitas devs indie demoram meses pra alcançar.

📊 Sugestões de estrutura pra próxima evolução
🔧 Client

entities/ → separar VisualEntity (render) de NetworkEntity (estado)

network/ → abstrair WebSocket para enviar apenas inputs e receber updates

interpolator → função que suaviza posições baseadas em ticks

🧪 Server

world/WorldManager.ts → gerencia entidades

game/Physics.ts → colisões AABB

game/Combat.ts → resolve ataques

network/SnapshotManager.ts → diffs e compressão opcional

🏁 Próximos passos recomendados

Aqui estão as prioridades mais sensatas para o que vem depois:

➡️ 1. Interpolação/lerp no client
➡️ 2. Hitbox de ataque autoritativo no servidor
➡️ 3. UI de chat e leaderboard
➡️ 4. Sistema de respawn de inimigos
➡️ 5. Boss final (Gelehk) com fases e ataques especiais

Se quiser, posso te gerar:

✅ Diagrama de arquitetura do projeto
✅ Código base para interpolação + diff snapshots
✅ Sistema de hitbox de ataque pronto pra integrar
✅ Design de estados (State Machine) para Player, Slime e Boss

Basta dizer o que quer focar primeiro! 👊

## Separação client / server

O uso de workspaces (client, server) indica uma arquitetura monorepo com duas partes distintas:

client (frontend)

server (backend multiplayer)

Possíveis melhorias:

Isolar lógica reutilizável em pacotes internos — por exemplo uma pasta shared/ com tipos, mensagens e enums que tanto o client quanto o server consomem.

Evitar duplicação de código entre client e server (especialmente a definição de pacotes de dados enviados por WebSocket).