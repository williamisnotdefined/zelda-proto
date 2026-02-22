type ServerMessage = {
  type: string;
  [key: string]: unknown;
};

type MessageHandler = (msg: ServerMessage) => void;

const protocol = window.location.protocol === "https:" ? "wss:" : "ws:";
const WS_URL = `${protocol}//${window.location.host}/ws`;

let ws: WebSocket | null = null;
let handlers: MessageHandler[] = [];
let reconnectTimer: ReturnType<typeof setTimeout> | null = null;

export function connect(): void {
  if (
    ws &&
    (ws.readyState === WebSocket.OPEN || ws.readyState === WebSocket.CONNECTING)
  ) {
    return;
  }

  ws = new WebSocket(WS_URL);

  ws.onopen = () => {
    console.log("Connected to server");
  };

  ws.onmessage = (event) => {
    try {
      const msg = JSON.parse(event.data as string) as ServerMessage;
      for (const handler of handlers) {
        handler(msg);
      }
    } catch {
      // ignore
    }
  };

  ws.onclose = () => {
    console.log("Disconnected from server");
    ws = null;
    if (!reconnectTimer) {
      reconnectTimer = setTimeout(() => {
        reconnectTimer = null;
        connect();
      }, 2000);
    }
  };

  ws.onerror = () => {
    ws?.close();
  };
}

export function send(msg: object): void {
  if (ws && ws.readyState === WebSocket.OPEN) {
    ws.send(JSON.stringify(msg));
  }
}

export function onMessage(handler: MessageHandler): () => void {
  handlers.push(handler);
  return () => {
    handlers = handlers.filter((h) => h !== handler);
  };
}

export function disconnect(): void {
  if (reconnectTimer) {
    clearTimeout(reconnectTimer);
    reconnectTimer = null;
  }
  if (ws) {
    ws.close();
    ws = null;
  }
}
