import { ClientErrorLogStore } from './clientErrorLogStore.js';

const DEFAULT_LAST = 50;

async function main(): Promise<void> {
  const args = process.argv.slice(2);
  const last = parseNumberArg(args, '--last') ?? DEFAULT_LAST;
  const date = parseStringArg(args, '--date');
  const asJson = args.includes('--json');

  const store = new ClientErrorLogStore();
  const entries = await store.readRecentEntries(last, date);

  if (entries.length === 0) {
    console.log(`No client error logs found in ${store.getLogDir()}`);
    return;
  }

  if (asJson) {
    console.log(JSON.stringify(entries, null, 2));
    return;
  }

  for (const entry of entries.reverse()) {
    console.log(JSON.stringify(entry, null, 2));
  }
}

function parseNumberArg(args: string[], flag: string): number | undefined {
  const value = parseStringArg(args, flag);
  if (!value) {
    return undefined;
  }

  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : undefined;
}

function parseStringArg(args: string[], flag: string): string | undefined {
  const index = args.indexOf(flag);
  if (index === -1) {
    return undefined;
  }

  return args[index + 1];
}

void main().catch((error) => {
  console.error('Failed to read client error logs');
  console.error(error);
  process.exitCode = 1;
});
