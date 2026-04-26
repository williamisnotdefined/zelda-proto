import { resolve } from 'node:path';
import { spawnManaged, waitForHttp, ManagedProcess } from './utils/processes';

const REPO_ROOT = resolve(__dirname, '..');
const SERVER_PORT = 3002;
const CLIENT_PORT = 5173;

interface GlobalState {
  server: ManagedProcess;
  client: ManagedProcess;
}

let state: GlobalState | undefined;

export default async function globalSetup(): Promise<() => Promise<void>> {
  // Use the Go server (this is what we're validating).
  const server = spawnManaged({
    cmd: 'go',
    args: ['run', './cmd/server'],
    cwd: resolve(REPO_ROOT, 'server_go'),
    env: { NODE_ENV: 'development', PORT: String(SERVER_PORT) },
    label: 'go-server',
  });

  await waitForHttp(`http://localhost:${SERVER_PORT}/healthz`, 60_000);

  const client = spawnManaged({
    cmd: 'npm',
    args: ['run', 'dev:client', '--silent'],
    cwd: REPO_ROOT,
    env: { BROWSER: 'none' },
    label: 'vite',
  });

  await waitForHttp(`http://localhost:${CLIENT_PORT}/`, 60_000);

  state = { server, client };

  return async () => {
    if (!state) return;
    await Promise.all([state.client.kill(), state.server.kill()]);
    state = undefined;
  };
}
