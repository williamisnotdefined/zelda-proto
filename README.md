# Legends of Gelehk

2D top-down MMO RPG inspired by The Legend of Zelda: A Link to the Past.

## Requirements

- Node.js 22+
- npm 10+
- Go 1.24+
- `cloudflared` (optional, only for `npm run live:start` / production tunnel)
- Playwright Chromium dependencies for `npm run test:e2e`

Install workspace dependencies:

```bash
npm install
```

If this is your first time running Playwright locally:

```bash
npx playwright install chromium
```

## Quick Start

Run client and server together:

```bash
npm run dev
```

Default local URLs:

- Client: `http://localhost:5174`
- Server health check: `http://localhost:3003/healthz`
- WebSocket endpoint: `ws://localhost:3003/ws`

## Project Layout

- `server/`: authoritative Go runtime, simulation, AI, networking, HTTP and WebSocket transport
- `client/src/game/`: Phaser runtime, gameplay scene, entity rendering
- `client/src/ui/`: React HUD and overlays
- `client/src/game-core/`: prediction, interpolation, snapshot handling
- `client/src/shared/`: protocol types, registry definitions, shared constants
- `e2e/`: Playwright smoke tests

## Scripts

The table below reflects the current `package.json` scripts.

| Script | What it does |
| --- | --- |
| `npm run dev` | Starts Go server on `:3003` and Vite client on `:5174` together |
| `npm run dev:server` | Starts the Go server in development mode on `:3003` |
| `npm run dev:client` | Starts the Vite dev server on `:5174`, proxying `/api` and `/ws` to `:3003` |
| `npm run build` | Builds the Go server binary and the production client bundle |
| `npm run build:server` | Builds `server/bin/server` |
| `npm run build:client` | Builds the Vite client into `client/dist` |
| `npm start` | Starts the production Go server on `:3001` and serves `client/dist` when available |
| `npm run start:server` | Same as `npm start`; sets production env vars used by the current deploy |
| `npm run test` | Runs Go tests and client Vitest suite |
| `npm run test:server` | Runs `go test ./...` inside `server/` |
| `npm run bench:server` | Runs focused Go benchmark baselines for world tick/snapshot and WebSocket broadcast |
| `npm run test:e2e` | Runs Playwright smoke tests against a locally started server and client |
| `npm run lint` | Runs ESLint on `client/src` |
| `npm run lint:fix` | Runs ESLint with `--fix` on `client/src` |
| `npm run format` | Runs Prettier write on `client/src/**/*.{ts,tsx}` |
| `npm run format:check` | Runs Prettier check on `client/src/**/*.{ts,tsx}` |
| `npm run live:start` | Builds the app, starts the production server, and runs `cloudflared tunnel run wilho` |

## Development

Run the server only:

```bash
npm run dev:server
```

Run the client only:

```bash
npm run dev:client
```

Useful development example:

```bash
DEV_START_PHASE=2 DEV_STRESS_ENEMIES_PER_CHUNK=40 npm run dev:server
```

## Testing And Quality

Run the full local verification suite:

```bash
npm run lint
npm run test
npm run build
npm run test:e2e
```

What currently passes in this repository:

- `npm run lint`
- `npm run test:server`
- `npm run test`
- `npm run build:server`
- `npm run build:client`
- `npm run dev:server`
- `npm run dev:client`
- `npm run dev`
- `npm start`
- `npm run test:e2e`
- `npm run live:start`

## Environment Variables

### Runtime

- `NODE_ENV=production`: enables production mode defaults
- `PORT=<port>`: overrides the default port (`3003` in development, `3001` in production)
- `TRUST_PROXY=1`: enables proxy-aware client IP extraction
- `TRUSTED_PROXY_CIDRS=127.0.0.1/32,10.0.0.0/24`: CIDR/IP allowlist for proxies whose `X-Forwarded-For` header is trusted
- `WS_ALLOWED_ORIGINS=https://example.com,https://app.example.com`: explicit WebSocket origin allowlist
- `WS_MAX_CONNECTIONS=<n>`: process-wide WebSocket connection cap, default `200`
- `WS_MAX_CONNECTIONS_PER_IP=<n>`: per-IP WebSocket connection cap, default `12`
- `WS_INPUT_RATE_LIMIT=<n>`: accepted input messages per second before rate violations, default `65`
- `WS_SNAPSHOT_RESYNC_LIMIT=<n>`: accepted `snapshot_resync` messages per second before rate violations, default `5`
- `WS_MAX_RATE_VIOLATIONS=<n>`: rate-limit strikes before closing a WebSocket, default `15`
- `WS_MAX_INVALID_MESSAGES=<n>`: invalid frames/messages before closing a WebSocket, default `8`
- `WS_OUTBOX_SIZE=<n>`: buffered outbound messages per WebSocket before slow-consumer close, default `64`
- `CLIENT_DIST_DIR=/absolute/path/to/dist`: optional override for the static client bundle path in production

### Development Only

- `DEV_START_PHASE=<phase>`: chooses the player spawn phase. Accepted forms: `phase1`, `phase2`, `phase3`, `phase4`, or `1`, `2`, `3`, `4`
- `DEV_STRESS_ENEMIES_PER_CHUNK=<1-400>`: overrides chunk enemy density across all phases for stress testing
- `DEBUG_GAME_METRICS=1`: enables `GET /api/debug/metrics` with process-local runtime counters and Go `pprof` under `/debug/pprof/`

### Debug Metrics

When `DEBUG_GAME_METRICS=1` is set, the server exposes:

- `GET /api/debug/metrics`: JSON counters for active/total connections, slow consumers, sim ticks, broadcasts, leaderboard publishes, snapshot full/delta counts and payload bytes
- `GET /debug/pprof/`: Go pprof index for CPU, heap, goroutine, block, mutex and trace profiles

### Performance Baselines

Run focused server benchmarks locally:

```bash
npm run bench:server
```

Run targeted server fuzz checks locally:

```bash
go -C server test ./internal/codec -run '^$' -fuzz FuzzDecodeRoundTrip -fuzztime=10s
go -C server test ./internal/protocol -run '^$' -fuzz FuzzParseClientMessageFromMsgpack -fuzztime=10s
```

The benchmark target covers:

- `BenchmarkWorldTickStress`
- `BenchmarkWorldSnapshotStress`
- `BenchmarkBroadcastStress`
- `BenchmarkBroadcastDeltaSteadyState`
- `BenchmarkBroadcastDeltaWithMovement`
- `BenchmarkWebSocketBroadcastStress`

## Production

Build both server and client:

```bash
npm run build
```

Start the production server locally:

```bash
npm start
```

Production defaults:

- Port: `3001`
- Health check: `http://localhost:3001/healthz`
- WebSocket endpoint: `ws://localhost:3001/ws`

`npm start` serves the built frontend only when `client/dist` exists. Run `npm run build` first.

## Cloudflare Tunnel

This project currently expects a Cloudflare tunnel named `wilho`.

Start the full production boot path plus tunnel:

```bash
npm run live:start
```

Start only the tunnel:

```bash
cloudflared tunnel run wilho
```

Example tunnel config is included in `cloudflared-config.example.yml`.

Current production route target:

- `wilho.com.br` -> `http://localhost:3001`

Notes:

- Cloudflare Tunnel forwards both HTTP and WebSocket traffic
- `TRUST_PROXY=1` is already part of `npm run start:server`
- If you change the public hostname, also update `WS_ALLOWED_ORIGINS`

## Troubleshooting

If the client is stuck on connecting:

1. Check the server health endpoint:

```bash
curl http://localhost:3003/healthz
```

2. Check the production health endpoint if using `npm start`:

```bash
curl http://localhost:3001/healthz
```

3. Confirm the dev client is running:

```bash
curl http://localhost:5174/
```

4. Inspect the WebSocket request in the browser network tab for `/ws`.

5. If using the tunnel, confirm the local tunnel exists:

```bash
cloudflared tunnel info wilho
```

## Architecture

- Server: authoritative Go simulation at 60 Hz
- Network snapshots: 20 Hz
- Leaderboard publish cadence: 1 Hz
- Client: Vite + React + Phaser 3
- Transport: MessagePack over WebSocket
- World model: four phase instances with per-phase enemy and boss registries

## Combat Reference

### Player And Hazard Attacks

| Source | Attack | Damage | Cooldown | Notes |
| --- | --- | --- | --- | --- |
| Player | Grenade (`A`) | `10` | `2s` | Damage is applied on detonation only |
| Player | Molotov (`D`) | `5` + burn | `1s` | Detonation damages players, monsters, and bosses; monsters and bosses burn for `5` ticks of `5` damage with `10%` lifesteal |
| Player | Landmine (`S`) | `10` | `2s` | Stationary explosive, detonates on proximity or expiry |
| Player | Wave (`Q`) | `3` | `5s` | Expanding wave with life steal (`120%` of dealt damage) |
| Player | Numb (`W`) | `3` | `5s` | Wave variant with freeze effect and life steal |
| Player | Pull (`E`) | `3` | `5s` | Pulls targets to the caster, then holds overlap briefly |
| Player | Venom (`R`) | `3` | `5s` | Green wave that marks hostiles for `10s`, causing `2x` player damage and `120%` lifesteal from those targets |
| Player | Dash | `0` direct | `1s` | Mobility skill; dash itself does not hit directly |
| Player dash trail | Blue flame | `8` + blue burning | n/a | Spawned along the dash path |
| Hazard | Fire field | `8` + burning | n/a | Applies `3` burning ticks of `8` each |
| Hazard | Purple field | `8` + purple burning | n/a | Applies `3` purple-burning ticks of `8` each |
| Hazard | Blue flame | `8` + blue burning | n/a | Applies `3` blue-burning ticks of `8` each |

### Enemy And Boss Attacks

| Source | Attack | Damage | Cooldown | Notes |
| --- | --- | --- | --- | --- |
| Blob | Contact | `5` | `1s` | Body collision damage |
| Skeleton | Contact | `10` | `1s` | Body collision damage |
| Knight | Contact | `14` | `1s` | Body collision damage |
| Knight | Blade wave | `12` | ability rotation | Ranged moving sword-wave projectile |
| Pacman Ghost | Contact | `20` | `1s` | Body collision damage |
| Gelehk | Contact | `10` | `1s` per target | Body collision damage |
| Gelehk | Charge | `20` | `2.5s` in phase 2 | Charge attack during phase 2 |
| Gelehk | Wave | `15` | `2.45s` in phase 3 | Expanding boss wave |
| Gelehk | Purple field summon | `8` + purple burning | `3s` in phase 1 | Triggered through telegraphed AOE landing |
| Dragon Lord | Contact | `5` | `1s` per target | Body collision damage |
| Dragon Lord | Fire line | `8` + burning | `2.5s` | Spawns fire-field hazards |
| Silverback Wainer | Contact | `15` | `1s` per target | Phase 3 dragon-family boss |
| Silverback Wainer | Fire line | `8` + burning | `2.5s` | Uses normal fire field |
| Slim Maioli | Contact | `15` | `1s` per target | Phase 3 dragon-family boss |
| Slim Maioli | Purple field line | `8` + purple burning | `2.5s` | Uses purple field hazards |
| Frankly Stein | Contact | `15` | `1s` per target | Phase 3 dragon-family boss |
| Frankly Stein | Blue flame line | `8` + blue burning | `2.5s` | Uses blue flame hazards |
| Vanessa the Ruthless | Contact | `12` | `1s` per target | Body collision damage |
| Vanessa the Ruthless | Horizontal fire lines | `8` + burning per fire-field tile | `2.3s` | Spawns left and right fire lines |
| Vanessa the Ruthless | Vertical fire lines | `8` + burning per fire-field tile | `2.3s` | Spawns up and down fire lines |
| Vanessa the Ruthless | Diagonal fire lines | `8` + burning per fire-field tile | `2.3s` | Spawns four diagonal fire lines |
| Vanessa the Ruthless | Fire burst at target | `8` + burning per fire-field tile | `2.3s` | Spawns a circular burst centered on the target |

## Monster Reference

| Monster | Type | HP | Damage | Notes |
| --- | --- | --- | --- | --- |
| Blob | Enemy | `30` | `5` contact | Phase 1 enemy |
| Blob (Elite) | Enemy | `90` | `15` contact | Phase 1 elite enemy, 2x size |
| Skeleton | Enemy | `45` | `10` contact | Phase 2 enemy and Phase 3 mixed enemy |
| Skeleton (Elite) | Enemy | `135` | `30` contact | Phase 2/3 elite enemy, 2x size |
| Knight | Enemy | `70` | `14` contact, `12` blade wave | Phase 3 mixed enemy; can shield, sprint, roll, and cast ranged sword waves |
| Knight (Elite) | Enemy | `210` | `42` contact, `18` blade wave | Phase 3 elite enemy, 2x collision size, faster ability cadence |
| Pacman Ghost | Enemy | `80` | `20` contact | Phase 4 enemy |
| Pacman Ghost (Elite) | Enemy | `240` | `60` contact | Phase 4 elite enemy, 2x size |
| Gelehk | Boss | `130` | `10` contact, `20` charge, `15` wave | Three-phase phase 1 boss |
| Dragon Lord | Boss | `175` | `5` contact, fire-field hazards | Phase 2 boss |
| Silverback Wainer | Boss | `175` | `15` contact, fire-field hazards | Phase 3 entry boss |
| Slim Maioli | Boss | `175` | `15` contact, purple-field hazards | Phase 3 entry boss |
| Frankly Stein | Boss | `175` | `15` contact, blue-flame hazards | Phase 3 entry boss |
| Vanessa the Ruthless | Boss | `225` | `12` contact, `8` + burning per fire-field tile | Cycles through horizontal, vertical, diagonal, and target-centered burst fire patterns |

## Phase Monster Density

| Phase | Primary monster | Density |
| --- | --- | --- |
| Phase 1 | Blob | `10` monsters per chunk |
| Phase 2 | Skeleton | `14` monsters per chunk |
| Phase 3 | Knight + Skeleton | `18` monsters per chunk |
| Phase 4 | Pacman Ghost | `24` monsters per chunk |

## Notes About Current Behavior

- The basic `Space` attack and the old pistol/fireball path were removed from the live input schema
- Current player hotkeys are `Q/W/E/R` for wave skills and `A/S/D` for grenade, landmine, and molotov
- Safezone protection blocks hostile contact damage and PvP hazard damage while the player is protected inside the spawn zone
