import { useGameStore } from '../ui/store';
import { phaserGame } from '../game/instance';

declare const __APP_VERSION__: string;
declare const __APP_RELEASE__: string;

type ErrorCategory = 'browser' | 'promise' | 'react' | 'network' | 'game';
type ErrorLevel = 'error' | 'warn';

interface QueuedClientErrorEvent {
  id: string;
  ts: string;
  level: ErrorLevel;
  category: ErrorCategory;
  type: string;
  message: string;
  name?: string;
  stack?: string;
  componentStack?: string;
  source?: string;
  line?: number;
  column?: number;
  handled?: boolean;
  tags?: Record<string, string>;
  context?: Record<string, unknown>;
  queue: {
    firstSeenAt: string;
    attempts: number;
  };
}

interface ClientErrorEnvelope {
  schemaVersion: number;
  sentAt: string;
  app: {
    name: string;
    version: string;
    env: string;
    release: string;
  };
  client: {
    installId: string;
    sessionId: string;
    playerId: string | null;
    nickname: string | null;
    connectionState: string;
    online: boolean;
    url: string;
    referrer: string;
    userAgent: string;
    language: string;
    displayMode: string;
    viewport: {
      width: number;
      height: number;
      pixelRatio: number;
    };
    scenes: string[];
  };
  events: QueuedClientErrorEvent[];
}

interface LogErrorInput {
  category: ErrorCategory;
  type: string;
  level?: ErrorLevel;
  message: string;
  error?: unknown;
  componentStack?: string;
  source?: string;
  line?: number;
  column?: number;
  handled?: boolean;
  tags?: Record<string, string | number | boolean | null | undefined>;
  context?: Record<string, unknown>;
}

const LOG_ENDPOINT = '/api/logs/client-errors';
const DB_NAME = 'gelehk-client-error-logs';
const STORE_NAME = 'events';
const DB_VERSION = 1;
const MAX_BATCH_SIZE = 20;
const MAX_QUEUE_SIZE = 500;
const MAX_STRING_LENGTH = 4000;
const INSTALL_ID_KEY = 'gelehk.install-id';
const SESSION_ID_KEY = 'gelehk.session-id';

let installed = false;
let flushPromise: Promise<void> | null = null;
let scheduledFlush: number | null = null;
const memoryQueue: QueuedClientErrorEvent[] = [];

export function installGlobalErrorLogging(): void {
  if (installed || typeof window === 'undefined') {
    return;
  }

  installed = true;

  window.addEventListener('error', (event) => {
    logError({
      category: 'browser',
      type: 'window.error',
      message: event.message || 'Unhandled window error',
      error: event.error,
      source: event.filename,
      line: event.lineno,
      column: event.colno,
      handled: false,
    });
  });

  window.addEventListener('unhandledrejection', (event) => {
    logError({
      category: 'promise',
      type: 'window.unhandledrejection',
      message: extractRejectionMessage(event.reason),
      error: event.reason,
      handled: false,
    });
  });

  window.addEventListener('online', () => {
    scheduleFlush(0);
  });

  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible') {
      scheduleFlush(0);
    }
  });

  scheduleFlush(0);
}

export function captureReactError(error: Error, componentStack?: string): void {
  logError({
    category: 'react',
    type: 'react.error-boundary',
    message: error.message || 'React render error',
    error,
    componentStack,
    handled: true,
  });
}

export function logError(input: LogErrorInput): void {
  const now = new Date().toISOString();
  const errorInfo = normalizeError(input.error);

  const event: QueuedClientErrorEvent = {
    id: createId(),
    ts: now,
    level: input.level ?? 'error',
    category: input.category,
    type: truncate(input.type, 120) ?? 'unknown',
    message:
      truncate(input.message || errorInfo.message || 'Unknown error', MAX_STRING_LENGTH) ??
      'Unknown error',
    name: truncate(errorInfo.name, 200),
    stack: truncate(errorInfo.stack, MAX_STRING_LENGTH),
    componentStack: truncate(input.componentStack, MAX_STRING_LENGTH),
    source: truncate(input.source, 1000),
    line: normalizeNumber(input.line),
    column: normalizeNumber(input.column),
    handled: input.handled,
    tags: normalizeTags(input.tags),
    context: normalizeContext(input.context),
    queue: {
      firstSeenAt: now,
      attempts: 0,
    },
  };

  void enqueueEvent(event)
    .catch(() => {
      enqueueInMemory(event);
    })
    .then(() => {
      scheduleFlush(0);
    });
}

export async function flushQueuedErrors(): Promise<void> {
  if (typeof window === 'undefined' || !navigator.onLine) {
    return;
  }

  if (flushPromise) {
    return flushPromise;
  }

  flushPromise = doFlush().finally(() => {
    flushPromise = null;
  });

  return flushPromise;
}

async function doFlush(): Promise<void> {
  while (navigator.onLine) {
    const queued = await listQueuedEvents();
    if (queued.length === 0) {
      return;
    }

    const batch = queued.slice(0, MAX_BATCH_SIZE);
    const envelope = buildEnvelope(batch);

    try {
      const response = await fetch(LOG_ENDPOINT, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(envelope),
        keepalive: batch.length <= 5,
      });

      if (response.ok) {
        await deleteQueuedEvents(batch.map((event) => event.id));
        continue;
      }

      if (response.status === 400 || response.status === 413 || response.status === 415) {
        await deleteQueuedEvents(batch.map((event) => event.id));
        continue;
      }

      await incrementAttempts(batch.map((event) => event.id));

      if (response.status === 429 || response.status >= 500) {
        scheduleFlush(parseRetryAfterMs(response.headers.get('Retry-After')));
      }

      return;
    } catch {
      await incrementAttempts(batch.map((event) => event.id));
      scheduleFlush(5000);
      return;
    }
  }
}

function scheduleFlush(delayMs: number): void {
  if (typeof window === 'undefined') {
    return;
  }

  if (scheduledFlush !== null) {
    window.clearTimeout(scheduledFlush);
  }

  scheduledFlush = window.setTimeout(
    () => {
      scheduledFlush = null;
      void flushQueuedErrors();
    },
    Math.max(0, delayMs)
  );
}

function buildEnvelope(events: QueuedClientErrorEvent[]): ClientErrorEnvelope {
  const state = useGameStore.getState();
  return {
    schemaVersion: 1,
    sentAt: new Date().toISOString(),
    app: {
      name: 'gelehk-web',
      version: __APP_VERSION__,
      env: import.meta.env.MODE,
      release: __APP_RELEASE__,
    },
    client: {
      installId: getPersistentId(localStorage, INSTALL_ID_KEY),
      sessionId: getPersistentId(sessionStorage, SESSION_ID_KEY),
      playerId: state.localPlayerId,
      nickname: state.nickname,
      connectionState: state.connectionState,
      online: navigator.onLine,
      url: window.location.href,
      referrer: document.referrer,
      userAgent: navigator.userAgent,
      language: navigator.language,
      displayMode: getDisplayMode(),
      viewport: {
        width: window.innerWidth,
        height: window.innerHeight,
        pixelRatio: window.devicePixelRatio,
      },
      scenes: getActiveScenes(),
    },
    events,
  };
}

function getActiveScenes(): string[] {
  const game = phaserGame;
  if (!game) {
    return [];
  }

  return game.scene.getScenes(true).map((scene) => scene.scene.key);
}

function getDisplayMode(): string {
  return 'browser';
}

async function enqueueEvent(event: QueuedClientErrorEvent): Promise<void> {
  if (typeof indexedDB === 'undefined') {
    enqueueInMemory(event);
    return;
  }

  const db = await openDatabase();
  await withStore(db, 'readwrite', (store) => store.put(event));
  await trimQueue(db);
}

async function listQueuedEvents(): Promise<QueuedClientErrorEvent[]> {
  if (typeof indexedDB === 'undefined') {
    return [...memoryQueue];
  }

  const db = await openDatabase();
  const events = await withStore<QueuedClientErrorEvent[]>(db, 'readonly', (store) =>
    requestToPromise(store.getAll())
  ).catch(() => [...memoryQueue]);
  return events.sort((a, b) => a.queue.firstSeenAt.localeCompare(b.queue.firstSeenAt));
}

async function deleteQueuedEvents(ids: string[]): Promise<void> {
  if (ids.length === 0) {
    return;
  }

  deleteFromMemory(ids);

  if (typeof indexedDB === 'undefined') {
    return;
  }

  const db = await openDatabase();
  await withStore(db, 'readwrite', async (store) => {
    for (const id of ids) {
      await requestToPromise(store.delete(id));
    }
  });
}

async function incrementAttempts(ids: string[]): Promise<void> {
  if (ids.length === 0) {
    return;
  }

  incrementAttemptsInMemory(ids);

  if (typeof indexedDB === 'undefined') {
    return;
  }

  const db = await openDatabase();
  await withStore(db, 'readwrite', async (store) => {
    for (const id of ids) {
      const current = await requestToPromise<QueuedClientErrorEvent | undefined>(store.get(id));
      if (!current) {
        continue;
      }
      current.queue.attempts += 1;
      await requestToPromise(store.put(current));
    }
  });
}

async function trimQueue(db: IDBDatabase): Promise<void> {
  const events = await withStore<QueuedClientErrorEvent[]>(db, 'readonly', (store) =>
    requestToPromise(store.getAll())
  );
  if (events.length <= MAX_QUEUE_SIZE) {
    return;
  }

  events.sort((a, b) => a.queue.firstSeenAt.localeCompare(b.queue.firstSeenAt));
  const staleEvents = events.slice(0, events.length - MAX_QUEUE_SIZE);

  await withStore(db, 'readwrite', async (store) => {
    for (const event of staleEvents) {
      await requestToPromise(store.delete(event.id));
    }
  });
}

function openDatabase(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);

    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains(STORE_NAME)) {
        db.createObjectStore(STORE_NAME, { keyPath: 'id' });
      }
    };

    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error ?? new Error('Failed to open IndexedDB'));
  });
}

function withStore<T>(
  db: IDBDatabase,
  mode: IDBTransactionMode,
  callback: (store: IDBObjectStore) => Promise<T> | T
): Promise<T> {
  return new Promise((resolve, reject) => {
    const transaction = db.transaction(STORE_NAME, mode);
    const store = transaction.objectStore(STORE_NAME);

    Promise.resolve(callback(store)).then(resolve, reject);

    transaction.onerror = () =>
      reject(transaction.error ?? new Error('IndexedDB transaction failed'));
  });
}

function requestToPromise<T>(request: IDBRequest<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error ?? new Error('IndexedDB request failed'));
  });
}

function getPersistentId(storage: Storage, key: string): string {
  try {
    const existing = storage.getItem(key);
    if (existing) {
      return existing;
    }

    const created = createId();
    storage.setItem(key, created);
    return created;
  } catch {
    return createId();
  }
}

function createId(): string {
  if (typeof crypto !== 'undefined' && 'randomUUID' in crypto) {
    return crypto.randomUUID();
  }

  return `${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

function extractRejectionMessage(reason: unknown): string {
  if (reason instanceof Error && reason.message) {
    return reason.message;
  }

  if (typeof reason === 'string' && reason.trim()) {
    return reason;
  }

  return 'Unhandled promise rejection';
}

function normalizeError(error: unknown): { name?: string; message?: string; stack?: string } {
  if (error instanceof Error) {
    return {
      name: error.name,
      message: error.message,
      stack: error.stack,
    };
  }

  if (typeof error === 'string') {
    return { message: error };
  }

  if (error && typeof error === 'object') {
    return {
      message: safeStringify(error),
    };
  }

  return {};
}

function normalizeContext(
  context: Record<string, unknown> | undefined
): Record<string, unknown> | undefined {
  if (!context) {
    return undefined;
  }

  return toSerializable(context, 0) as Record<string, unknown>;
}

function toSerializable(value: unknown, depth: number): unknown {
  if (depth > 4) {
    return '[max-depth]';
  }

  if (value == null || typeof value === 'number' || typeof value === 'boolean') {
    return value;
  }

  if (typeof value === 'string') {
    return truncate(value, MAX_STRING_LENGTH);
  }

  if (value instanceof Error) {
    return {
      name: value.name,
      message: truncate(value.message, MAX_STRING_LENGTH),
      stack: truncate(value.stack, MAX_STRING_LENGTH),
    };
  }

  if (Array.isArray(value)) {
    return value.slice(0, 25).map((entry) => toSerializable(entry, depth + 1));
  }

  if (typeof value === 'object') {
    const result: Record<string, unknown> = {};
    for (const [key, entry] of Object.entries(value)) {
      result[key] = toSerializable(entry, depth + 1);
    }
    return result;
  }

  return String(value);
}

function normalizeTags(
  tags: Record<string, string | number | boolean | null | undefined> | undefined
): Record<string, string> | undefined {
  if (!tags) {
    return undefined;
  }

  const normalized: Record<string, string> = {};
  for (const [key, value] of Object.entries(tags)) {
    if (value == null) {
      continue;
    }
    normalized[key] = truncate(String(value), 200) ?? String(value);
  }

  return Object.keys(normalized).length > 0 ? normalized : undefined;
}

function truncate(value: string | undefined, maxLength: number): string | undefined {
  if (!value) {
    return undefined;
  }

  return value.length > maxLength ? `${value.slice(0, maxLength - 1)}...` : value;
}

function safeStringify(value: unknown): string {
  try {
    return JSON.stringify(toSerializable(value, 0));
  } catch {
    return String(value);
  }
}

function normalizeNumber(value: number | undefined): number | undefined {
  return typeof value === 'number' && Number.isFinite(value) ? value : undefined;
}

function parseRetryAfterMs(headerValue: string | null): number {
  if (!headerValue) {
    return 15000;
  }

  const seconds = Number(headerValue);
  if (Number.isFinite(seconds) && seconds >= 0) {
    return seconds * 1000;
  }

  const retryDate = Date.parse(headerValue);
  if (Number.isFinite(retryDate)) {
    return Math.max(0, retryDate - Date.now());
  }

  return 15000;
}

function enqueueInMemory(event: QueuedClientErrorEvent): void {
  memoryQueue.push(event);
  if (memoryQueue.length > MAX_QUEUE_SIZE) {
    memoryQueue.splice(0, memoryQueue.length - MAX_QUEUE_SIZE);
  }
}

function deleteFromMemory(ids: string[]): void {
  const idSet = new Set(ids);
  for (let index = memoryQueue.length - 1; index >= 0; index -= 1) {
    if (idSet.has(memoryQueue[index].id)) {
      memoryQueue.splice(index, 1);
    }
  }
}

function incrementAttemptsInMemory(ids: string[]): void {
  const idSet = new Set(ids);
  for (const event of memoryQueue) {
    if (idSet.has(event.id)) {
      event.queue.attempts += 1;
    }
  }
}
