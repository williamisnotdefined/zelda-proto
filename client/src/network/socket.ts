type ServerMessage = {
  type: string;
  [key: string]: unknown;
};

type MessageHandler = (msg: ServerMessage) => void;
type ErrorHandler = (error: string) => void;

const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
const WS_URL = `${protocol}//${window.location.host}/ws`;

let ws: WebSocket | null = null;
let handlers: MessageHandler[] = [];
let errorHandlers: ErrorHandler[] = [];
let openCallbacks: (() => void)[] = [];
let reconnectTimer: ReturnType<typeof setTimeout> | null = null;
let connectionTimeout: ReturnType<typeof setTimeout> | null = null;
const MAX_CONNECTION_TIMEOUT = 30000;

function notifyError(error: string): void {
  console.error('[WebSocket Error]', error);
  for (const handler of errorHandlers) {
    handler(error);
  }
}

export function connect(): void {
  if (ws && (ws.readyState === WebSocket.OPEN || ws.readyState === WebSocket.CONNECTING)) {
    return;
  }

  try {
    ws = new WebSocket(WS_URL);
  } catch (error) {
    const errorMsg = `Failed to create WebSocket: ${error instanceof Error ? error.message : 'Unknown error'}`;
    notifyError(errorMsg);
    return;
  }

  // Set connection timeout
  if (connectionTimeout) {
    clearTimeout(connectionTimeout);
  }
  connectionTimeout = setTimeout(() => {
    if (ws && ws.readyState === WebSocket.CONNECTING) {
      console.error('[WebSocket] Connection timeout after 30 seconds');
      notifyError('Connection timeout - server may be unreachable');
      ws.close();
    }
  }, MAX_CONNECTION_TIMEOUT);

  ws.onopen = () => {
    if (connectionTimeout) {
      clearTimeout(connectionTimeout);
      connectionTimeout = null;
    }
    for (const cb of openCallbacks) cb();
    openCallbacks = [];
  };

  ws.onmessage = (event) => {
    try {
      const msg = JSON.parse(event.data as string) as ServerMessage;
      for (const handler of handlers) {
        handler(msg);
      }
    } catch (error) {
      console.error('[WebSocket] Failed to parse message:', error, event.data);
    }
  };

  ws.onclose = (event) => {
    if (connectionTimeout) {
      clearTimeout(connectionTimeout);
      connectionTimeout = null;
    }
    openCallbacks = [];
    // Provide user-friendly error messages based on close codes
    if (event.code === 1006) {
      notifyError('Connection closed abnormally - check your internet connection');
    } else if (event.code >= 1002 && event.code <= 1003) {
      notifyError('Connection closed due to protocol error');
    } else if (!event.wasClean && event.code !== 1000) {
      notifyError(`Connection lost unexpectedly (code: ${event.code})`);
    }

    ws = null;
    if (!reconnectTimer) {
      reconnectTimer = setTimeout(() => {
        reconnectTimer = null;
        connect();
      }, 2000);
    }
  };

  ws.onerror = (event) => {
    console.error('[WebSocket] Error event:', event);
    // Note: The error event doesn't provide detailed error info in the browser
    // The actual error details will be in the onclose event
    notifyError('WebSocket error occurred - connection may have failed');
  };
}

export function send(msg: object): void {
  if (ws && ws.readyState === WebSocket.OPEN) {
    ws.send(JSON.stringify(msg));
  } else {
    console.warn(
      '[WebSocket] Cannot send message, socket not ready. State:',
      ws?.readyState,
      'Message:',
      msg
    );
  }
}

export function sendJoin(nickname: string): void {
  send({ type: 'join', nickname });
}

export function sendChat(text: string): void {
  send({ type: 'chat', text });
}

export function onceOpen(cb: () => void): void {
  if (ws && ws.readyState === WebSocket.OPEN) {
    cb();
  } else {
    openCallbacks.push(cb);
  }
}

export function onMessage(handler: MessageHandler): () => void {
  handlers.push(handler);
  return () => {
    handlers = handlers.filter((h) => h !== handler);
  };
}

export function onError(handler: ErrorHandler): () => void {
  errorHandlers.push(handler);
  return () => {
    errorHandlers = errorHandlers.filter((h) => h !== handler);
  };
}

export function getConnectionState(): string {
  if (!ws) return 'DISCONNECTED';
  switch (ws.readyState) {
    case WebSocket.CONNECTING:
      return 'CONNECTING';
    case WebSocket.OPEN:
      return 'OPEN';
    case WebSocket.CLOSING:
      return 'CLOSING';
    case WebSocket.CLOSED:
      return 'CLOSED';
    default:
      return 'UNKNOWN';
  }
}

export function disconnect(): void {
  if (reconnectTimer) {
    clearTimeout(reconnectTimer);
    reconnectTimer = null;
  }
  if (connectionTimeout) {
    clearTimeout(connectionTimeout);
    connectionTimeout = null;
  }
  if (ws) {
    ws.close();
    ws = null;
  }
}
