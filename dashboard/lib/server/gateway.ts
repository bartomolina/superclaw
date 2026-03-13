import WebSocket from "ws";

const GATEWAY_URL = process.env.GATEWAY_URL || "ws://127.0.0.1:18789";
const GATEWAY_TOKEN = process.env.GATEWAY_TOKEN;

type PendingResolver = {
  resolve: (value: unknown) => void;
  reject: (error: Error) => void;
};

let ws: WebSocket | null = null;
let connected = false;
let reqId = 1;
const pending = new Map<string, PendingResolver>();

function nextId() {
  return `req-${reqId++}`;
}

function sendRaw(obj: unknown) {
  if (!ws) throw new Error("gateway socket not initialized");
  ws.send(JSON.stringify(obj));
}

function connect() {
  if (!GATEWAY_TOKEN) return;

  ws = new WebSocket(GATEWAY_URL, {
    headers: { origin: "http://127.0.0.1:18789" },
  });

  ws.on("open", () => {
    const id = nextId();
    pending.set(id, {
      resolve: () => {
        connected = true;
      },
      reject: () => {
        connected = false;
      },
    });

    sendRaw({
      id,
      type: "req",
      method: "connect",
      params: {
        minProtocol: 3,
        maxProtocol: 3,
        client: {
          id: "webchat",
          version: "1.0.0",
          platform: "node",
          mode: "webchat",
        },
        role: "operator",
        scopes: ["operator.read", "operator.admin"],
        caps: [],
        auth: { token: GATEWAY_TOKEN },
        userAgent: "dashboard-server/1.0",
        locale: "en",
      },
    });
  });

  ws.on("message", (data) => {
    try {
      const msg = JSON.parse(data.toString()) as {
        id?: string;
        ok?: boolean;
        error?: { message?: string };
        payload?: unknown;
        result?: unknown;
      };
      if (msg.id && pending.has(msg.id)) {
        const handlers = pending.get(msg.id)!;
        pending.delete(msg.id);
        if (msg.ok === false) {
          handlers.reject(new Error(msg.error?.message ?? "rpc error"));
        } else {
          handlers.resolve(msg.payload ?? msg.result ?? msg);
        }
      }
    } catch {
      // Ignore malformed messages.
    }
  });

  ws.on("close", () => {
    connected = false;
    setTimeout(connect, 3000);
  });

  ws.on("error", () => {
    connected = false;
  });
}

if (GATEWAY_TOKEN) {
  connect();
}

export async function request(method: string, params: Record<string, unknown> = {}) {
  if (!GATEWAY_TOKEN) {
    throw new Error("GATEWAY_TOKEN is required in environment");
  }
  if (!connected) {
    throw new Error("not connected");
  }

  return new Promise<unknown>((resolve, reject) => {
    const id = nextId();
    pending.set(id, { resolve, reject });
    sendRaw({ id, type: "req", method, params });
    setTimeout(() => {
      if (pending.has(id)) {
        pending.delete(id);
        reject(new Error("timeout"));
      }
    }, 5000);
  });
}

export { GATEWAY_TOKEN };
