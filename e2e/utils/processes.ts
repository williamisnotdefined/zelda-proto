import { ChildProcess, spawn } from 'node:child_process';
import { setTimeout as delay } from 'node:timers/promises';

export interface ManagedProcess {
  child: ChildProcess;
  kill: () => Promise<void>;
}

interface SpawnOptions {
  cmd: string;
  args: string[];
  cwd: string;
  env?: NodeJS.ProcessEnv;
  label: string;
  onLog?: (line: string) => void;
  collectStderr?: boolean;
}

export function spawnManaged({
  cmd,
  args,
  cwd,
  env,
  label,
  onLog,
  collectStderr = true,
}: SpawnOptions): ManagedProcess {
  const child = spawn(cmd, args, {
    cwd,
    env: { ...process.env, ...env },
    stdio: ['ignore', 'pipe', 'pipe'],
  });

  const handleData = (chunk: Buffer | string) => {
    const text = chunk.toString();
    for (const raw of text.split(/\r?\n/)) {
      if (!raw) continue;
      // eslint-disable-next-line no-console
      console.log(`[${label}] ${raw}`);
      onLog?.(raw);
    }
  };
  child.stdout?.on('data', handleData);
  if (collectStderr) child.stderr?.on('data', handleData);

  const kill = async () => {
    if (child.exitCode !== null || child.signalCode !== null) return;
    child.kill('SIGTERM');
    for (let i = 0; i < 30; i += 1) {
      if (child.exitCode !== null) return;
      await delay(100);
    }
    child.kill('SIGKILL');
  };

  return { child, kill };
}

export async function waitForHttp(url: string, timeoutMs: number): Promise<void> {
  const deadline = Date.now() + timeoutMs;
  let lastErr: unknown;
  while (Date.now() < deadline) {
    try {
      const res = await fetch(url);
      if (res.ok) return;
      lastErr = new Error(`HTTP ${res.status}`);
    } catch (err) {
      lastErr = err;
    }
    await delay(250);
  }
  throw new Error(`Timeout waiting for ${url}: ${String(lastErr)}`);
}
