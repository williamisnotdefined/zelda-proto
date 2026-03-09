import { appendFile, mkdir, readdir, readFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';

export interface ClientErrorLogEnvelope {
  schemaVersion?: number;
  sentAt?: string;
  app?: Record<string, unknown>;
  client?: Record<string, unknown>;
  events: ClientErrorEventInput[];
}

export interface ClientErrorEventInput {
  id?: string;
  ts?: string;
  level?: string;
  category?: string;
  type?: string;
  message?: string;
  name?: string;
  stack?: string;
  componentStack?: string;
  source?: string;
  line?: number;
  column?: number;
  handled?: boolean;
  tags?: Record<string, unknown>;
  context?: Record<string, unknown>;
  queue?: Record<string, unknown>;
}

export interface ClientErrorRequestMeta {
  receivedAt: string;
  ip: string;
  requestId: string;
}

const MAX_STRING_LENGTH = 16000;

export class ClientErrorLogStore {
  constructor(private readonly logDir = resolve(process.cwd(), 'logs')) {}

  async appendEnvelope(
    envelope: ClientErrorLogEnvelope,
    meta: ClientErrorRequestMeta
  ): Promise<number> {
    const sanitizedEvents = envelope.events.map((event) =>
      this.createRecord(event, envelope, meta)
    );
    if (sanitizedEvents.length === 0) {
      return 0;
    }

    const dateKey = meta.receivedAt.slice(0, 10);
    const filePath = join(this.logDir, `client-errors-${dateKey}.ndjson`);

    await mkdir(this.logDir, { recursive: true });
    await appendFile(
      filePath,
      sanitizedEvents.map((event) => JSON.stringify(event)).join('\n') + '\n',
      'utf8'
    );
    return sanitizedEvents.length;
  }

  getLogDir(): string {
    return this.logDir;
  }

  async readRecentEntries(last = 50, date?: string): Promise<unknown[]> {
    const files = await this.listLogFiles(date);
    const collected: unknown[] = [];

    for (const file of files) {
      const filePath = join(this.logDir, file);
      const content = await readFile(filePath, 'utf8');
      const lines = content.split('\n').filter(Boolean).reverse();

      for (const line of lines) {
        try {
          collected.push(JSON.parse(line));
        } catch {
          collected.push({ malformedLine: line, file });
        }

        if (collected.length >= last) {
          return collected;
        }
      }
    }

    return collected;
  }

  private async listLogFiles(date?: string): Promise<string[]> {
    try {
      const files = await readdir(this.logDir);
      return files
        .filter((file) => file.startsWith('client-errors-') && file.endsWith('.ndjson'))
        .filter((file) => (date ? file === `client-errors-${date}.ndjson` : true))
        .sort()
        .reverse();
    } catch {
      return [];
    }
  }

  private createRecord(
    event: ClientErrorEventInput,
    envelope: ClientErrorLogEnvelope,
    meta: ClientErrorRequestMeta
  ): Record<string, unknown> {
    return {
      schemaVersion: typeof envelope.schemaVersion === 'number' ? envelope.schemaVersion : 1,
      sentAt: normalizeDateString(envelope.sentAt),
      receivedAt: meta.receivedAt,
      requestId: meta.requestId,
      ip: meta.ip,
      app: sanitizeUnknown(envelope.app),
      client: sanitizeUnknown(envelope.client),
      event: {
        id: sanitizeString(event.id, 200),
        ts: normalizeDateString(event.ts),
        level: sanitizeString(event.level, 32),
        category: sanitizeString(event.category, 64),
        type: sanitizeString(event.type, 120),
        message: sanitizeString(event.message, MAX_STRING_LENGTH),
        name: sanitizeString(event.name, 200),
        stack: sanitizeString(event.stack, MAX_STRING_LENGTH),
        componentStack: sanitizeString(event.componentStack, MAX_STRING_LENGTH),
        source: sanitizeString(event.source, 1000),
        line:
          typeof event.line === 'number' && Number.isFinite(event.line) ? event.line : undefined,
        column:
          typeof event.column === 'number' && Number.isFinite(event.column)
            ? event.column
            : undefined,
        handled: typeof event.handled === 'boolean' ? event.handled : undefined,
        tags: sanitizeUnknown(event.tags),
        context: sanitizeUnknown(event.context),
        queue: sanitizeUnknown(event.queue),
      },
    };
  }
}

function sanitizeUnknown(value: unknown, depth = 0): unknown {
  if (depth > 5) {
    return '[max-depth]';
  }

  if (value == null || typeof value === 'boolean' || typeof value === 'number') {
    return value;
  }

  if (typeof value === 'string') {
    return sanitizeString(value, MAX_STRING_LENGTH);
  }

  if (Array.isArray(value)) {
    return value.slice(0, 50).map((entry) => sanitizeUnknown(entry, depth + 1));
  }

  if (typeof value === 'object') {
    const result: Record<string, unknown> = {};
    for (const [key, entry] of Object.entries(value)) {
      result[key] = sanitizeUnknown(entry, depth + 1);
    }
    return result;
  }

  return sanitizeString(String(value), 1000);
}

function sanitizeString(value: string | undefined, maxLength: number): string | undefined {
  if (!value) {
    return undefined;
  }

  return value.length > maxLength ? `${value.slice(0, maxLength - 1)}...` : value;
}

function normalizeDateString(value: string | undefined): string | undefined {
  if (!value) {
    return undefined;
  }

  const parsed = Date.parse(value);
  return Number.isFinite(parsed) ? new Date(parsed).toISOString() : undefined;
}
