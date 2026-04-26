import { test, expect, ConsoleMessage } from '@playwright/test';
import { Unpackr } from 'msgpackr';

const unpackr = new Unpackr({ useRecords: false });

interface CapturedError {
  source: 'console' | 'pageerror';
  text: string;
}

const IGNORED_PATTERNS: RegExp[] = [
  // Vite dev HMR/devtools noise that does not indicate gameplay errors.
  /Download the React DevTools/i,
  /\[vite\]/i,
  // Phaser sometimes logs "Phaser v3.90.0" via console.log; not an error.
];

function shouldIgnore(text: string): boolean {
  return IGNORED_PATTERNS.some((re) => re.test(text));
}

test.describe('Go server end-to-end smoke', () => {
  test('client connects, joins, receives snapshots without console errors', async ({ page }) => {
    const errors: CapturedError[] = [];

    page.on('console', (msg: ConsoleMessage) => {
      if (msg.type() !== 'error' && msg.type() !== 'warning') return;
      const text = msg.text();
      if (shouldIgnore(text)) return;
      // Treat warnings as informational, only fail on errors.
      if (msg.type() === 'error') errors.push({ source: 'console', text });
    });
    page.on('pageerror', (err) => {
      const text = `${err.name}: ${err.message}`;
      if (shouldIgnore(text)) return;
      errors.push({ source: 'pageerror', text });
    });

    // Hook the websocket BEFORE navigation so we capture the welcome and the
    // first snapshot frames the server pushes once the player joins.
    let enemiesSeen = 0;
    let bossesSeen = 0;
    let snapshotFrames = 0;
    let snapshotWithEnemies = 0;
    let totalFrames = 0;
    let wsCount = 0;
    const seenTypes = new Set<string>();
    const decodeErrors: string[] = [];
    const wsUrls: string[] = [];
    page.on('websocket', (ws) => {
      wsCount++;
      const url = ws.url();
      wsUrls.push(url);
      // Vite dev server uses ws://localhost:5173/?token=... for HMR; skip it.
      if (!url.endsWith('/ws') && !url.includes('/ws?')) return;
      ws.on('framereceived', ({ payload }) => {
        if (!payload) return;
        totalFrames++;
        let buf: Buffer;
        if (typeof payload === 'string') {
          // Playwright sends binary frames as base64 strings in Node.
          buf = Buffer.from(payload, 'base64');
        } else if (Buffer.isBuffer(payload)) {
          buf = payload;
        } else {
          buf = Buffer.from(payload as ArrayBuffer);
        }
        try {
          const msg: any = unpackr.unpack(buf);
          if (msg && typeof msg === 'object' && 'type' in msg) {
            seenTypes.add(String(msg.type));
          }
          if (msg?.type === 'snapshot' || msg?.type === 'snapshot_delta') {
            snapshotFrames++;
            const enemies = Array.isArray(msg.enemies) ? msg.enemies.length : 0;
            const bosses = Array.isArray(msg.bosses) ? msg.bosses.length : 0;
            enemiesSeen += enemies;
            bossesSeen += bosses;
            if (enemies > 0) snapshotWithEnemies++;
          }
        } catch (err) {
          if (decodeErrors.length < 3) {
            const head = buf
              .subarray(0, Math.min(16, buf.length))
              .toString('hex');
            decodeErrors.push(
              `${err instanceof Error ? err.message : String(err)} (typeof=${typeof payload}, len=${buf.length}, head=${head})`,
            );
          }
        }
      });
    });

    await page.goto('/', { waitUntil: 'domcontentloaded' });

    // The NicknameModal renders with placeholder="Nickname".
    const nicknameInput = page.getByPlaceholder('Nickname');
    await nicknameInput.waitFor({ state: 'visible', timeout: 30_000 });
    await nicknameInput.fill('e2eplayer');
    await page.getByRole('button', { name: 'Play' }).click();

    // After joining, the canvas (Phaser) should appear and the websocket should
    // exchange messages. Give the simulation ~10 seconds of ticks to flow.
    const canvas = page.locator('canvas').first();
    await canvas.waitFor({ state: 'visible', timeout: 30_000 });
    await page.waitForTimeout(10_000);

    if (errors.length > 0) {
      const dump = errors.map((e) => `[${e.source}] ${e.text}`).join('\n');
      throw new Error(`Captured ${errors.length} console/page error(s):\n${dump}`);
    }

    // Smoke check: ensure HUD or leaderboard mounted (no error boundary).
    const errorBoundary = page.getByText(/something went wrong|algo deu errado/i);
    await expect(errorBoundary).toHaveCount(0);

    // Gameplay check: at least one snapshot must report enemies in view, so
    // the regression that left the world empty cannot reappear silently.
    const diag = `ws=${wsCount} urls=[${wsUrls.join(' , ')}] totalFrames=${totalFrames} types=[${[...seenTypes].join(',')}] decodeErrors=[${decodeErrors.join(' | ')}]`;
    expect(snapshotFrames, `expected snapshot frames; ${diag}`).toBeGreaterThan(0);
    expect(
      snapshotWithEnemies,
      `expected ≥1 snapshot with enemies (saw ${snapshotFrames} frames, ${enemiesSeen} enemy slots, ${bossesSeen} boss slots); ${diag}`,
    ).toBeGreaterThan(0);
  });

  test('player moves, changes direction, attacks; enemies chase; player dies and respawns', async ({
    page,
  }) => {
    // Per-snapshot tracking we accumulate from the WebSocket frames.
    interface PlayerSnap {
      id: string;
      x: number;
      y: number;
      hp: number;
      state: string;
      direction: string;
      deaths: number;
      lastSeq: number;
    }
    const playersByTick: PlayerSnap[][] = [];
    const enemyPositions = new Map<string, { x: number; y: number }>();
    let enemyMovementCount = 0;
    let myId: string | undefined;
    let sentInputs = 0;
    const sentTypes = new Set<string>();
    const pageErrors: string[] = [];
    page.on('pageerror', (err) => pageErrors.push(`pageerror: ${err.message}`));
    page.on('console', (msg) => {
      if (msg.type() === 'error') pageErrors.push(`console.error: ${msg.text()}`);
    });

    page.on('websocket', (ws) => {
      const url = ws.url();
      if (!url.endsWith('/ws') && !url.includes('/ws?')) return;
      ws.on('framesent', ({ payload }) => {
        if (!payload) return;
        let buf: Buffer;
        if (typeof payload === 'string') buf = Buffer.from(payload, 'base64');
        else if (Buffer.isBuffer(payload)) buf = payload;
        else buf = Buffer.from(payload as ArrayBuffer);
        try {
          const msg: any = unpackr.unpack(buf);
          if (msg?.type === 'input') sentInputs++;
          if (msg?.type) sentTypes.add(String(msg.type));
        } catch {
          /* ignore */
        }
      });
      ws.on('framereceived', ({ payload }) => {
        if (!payload) return;
        let buf: Buffer;
        if (typeof payload === 'string') buf = Buffer.from(payload, 'base64');
        else if (Buffer.isBuffer(payload)) buf = payload;
        else buf = Buffer.from(payload as ArrayBuffer);
        let msg: any;
        try {
          msg = unpackr.unpack(buf);
        } catch {
          return;
        }
        if (msg?.type === 'welcome' && typeof msg.id === 'string') {
          myId = msg.id;
        }
        if (msg?.type === 'snapshot' || msg?.type === 'snapshot_delta') {
          if (Array.isArray(msg.players)) {
            playersByTick.push(
              msg.players.map((p: any) => ({
                id: String(p.id),
                x: Number(p.x),
                y: Number(p.y),
                hp: Number(p.hp),
                state: String(p.state),
                direction: String(p.direction),
                deaths: Number(p.deaths ?? 0),
                lastSeq: Number(p.lastProcessedInputSeq ?? -1),
              })),
            );
          }
          // Track enemy movement via either full enemies or deltas.
          if (Array.isArray(msg.enemies)) {
            for (const e of msg.enemies) {
              const prev = enemyPositions.get(e.id);
              if (prev && (prev.x !== e.x || prev.y !== e.y)) enemyMovementCount++;
              enemyPositions.set(e.id, { x: e.x, y: e.y });
            }
          }
          if (Array.isArray(msg.enemyTransforms)) {
            for (const t of msg.enemyTransforms) {
              const prev = enemyPositions.get(t.id);
              if (prev && (prev.x !== t.x || prev.y !== t.y)) enemyMovementCount++;
              enemyPositions.set(t.id, { x: t.x, y: t.y });
            }
          }
        }
      });
    });

    await page.goto('/', { waitUntil: 'domcontentloaded' });
    const nicknameInput = page.getByPlaceholder('Nickname');
    await nicknameInput.waitFor({ state: 'visible', timeout: 30_000 });
    await nicknameInput.fill('moveBot');
    await page.getByRole('button', { name: 'Play' }).click();
    const canvas = page.locator('canvas').first();
    await canvas.waitFor({ state: 'visible', timeout: 30_000 });
    // Phaser binds keyboard listeners to window; make body focusable and
    // focused so headless keyboard events bubble through unobstructed.
    await page.evaluate(() => {
      document.body.setAttribute('tabindex', '-1');
      document.body.focus();
    });
    // Wait until WorldScene has finished booting (status RUNNING = 5) so
    // LocalInputController is mounted and Phaser keyboard listeners exist.
    await page.waitForFunction(
      () => {
        const g: any = (window as any).__PHASER_GAME__;
        if (!g) return false;
        const ws = g.scene?.scenes?.find(
          (s: any) => s.scene?.settings?.key === 'WorldScene',
        );
        return ws?.scene?.settings?.status === 5;
      },
      undefined,
      { timeout: 30_000 },
    );
    await page.waitForTimeout(500);

    function selfFrames(): PlayerSnap[] {
      const out: PlayerSnap[] = [];
      for (const tick of playersByTick) {
        const me = tick.find((p) => p.id === myId);
        if (me) out.push(me);
      }
      return out;
    }

    // === MOVEMENT + DIRECTION CHANGE ===
    // Hold ArrowRight for 1.5s — should move and face right.
    await page.keyboard.down('ArrowRight');
    await page.waitForTimeout(1500);
    await page.keyboard.up('ArrowRight');
    await page.waitForTimeout(300);

    let me = selfFrames();
    expect(me.length, 'expected ≥1 self snapshot').toBeGreaterThan(0);
    const startX = me[0].x;
    const movedRight = me.some((p) => p.x - startX > 30);
    const facedRight = me.some((p) => p.direction === 'right');
    const lastSeqs = me.map((p) => p.lastSeq);
    const maxSeq = Math.max(...lastSeqs);
    expect(
      maxSeq,
      `server should have processed inputs; lastSeq trajectory=${lastSeqs.join(',')}; sentInputs=${sentInputs}; sentTypes=${[...sentTypes].join(',')}; myId=${myId}; pageErrors=${pageErrors.slice(0, 3).join(' | ')}`,
    ).toBeGreaterThan(0);
    expect(movedRight, `player should have moved right, x trajectory=${me.map((p) => p.x).join(',')}; lastSeq=${maxSeq}`).toBe(true);
    expect(facedRight, `player should face right at some point, dirs=${[...new Set(me.map((p) => p.direction))]}`).toBe(true);

    // Hold ArrowDown briefly to change direction.
    await page.keyboard.down('ArrowDown');
    await page.waitForTimeout(800);
    await page.keyboard.up('ArrowDown');
    await page.waitForTimeout(300);
    me = selfFrames();
    const facedDown = me.slice(-30).some((p) => p.direction === 'down');
    expect(facedDown, `player should face down after ArrowDown, dirs(tail)=${me.slice(-30).map((p) => p.direction).join(',')}`).toBe(true);

    // === ATTACK ===
    await page.keyboard.down('Space');
    await page.waitForTimeout(120);
    await page.keyboard.up('Space');
    await page.waitForTimeout(400);
    await page.keyboard.down('Space');
    await page.waitForTimeout(120);
    await page.keyboard.up('Space');
    await page.waitForTimeout(400);
    me = selfFrames();
    const attacked = me.some((p) => p.state === 'attacking');
    expect(attacked, `player should enter attacking state, states=${[...new Set(me.map((p) => p.state))]}`).toBe(true);

    // === ENEMIES MOVING ===
    expect(enemyMovementCount, 'enemies should move').toBeGreaterThan(5);

    // === DAMAGE & DEATH/RESPAWN ===
    // Stand still and let enemies hit us. After safe-zone (~3s) elapses,
    // contact damage should drain HP. Then we check death/respawn.
    await page.waitForTimeout(15_000);
    me = selfFrames();
    const hps = me.map((p) => p.hp);
    const minHP = Math.min(...hps);
    const sawDeath = me.some((p) => p.state === 'dead' || p.deaths >= 1);
    expect(minHP, `expected hp to decrease below 100, got hps min=${minHP}`).toBeLessThan(100);
    expect(sawDeath, 'expected player to die at least once during 15s of contact').toBe(true);
  });

  test('healthz reports the Go runtime', async ({ request }) => {
    const res = await request.get('http://localhost:3002/healthz');
    expect(res.ok()).toBeTruthy();
    const body = await res.json();
    expect(body.runtime).toBe('go');
    expect(body.status).toBe('ok');
  });
});
