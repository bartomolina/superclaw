import fs from "node:fs";
import path from "node:path";
import { randomUUID } from "node:crypto";
import { performance } from "node:perf_hooks";
import { createRequire } from "node:module";
import { pathToFileURL } from "node:url";

const DEFAULT_GATEWAY_URL = "ws://127.0.0.1:18789";
const DEFAULT_OPENCLAW_PACKAGE_JSON = process.env.OPENCLAW_PACKAGE_JSON || "/usr/lib/node_modules/openclaw/package.json";
const DEFAULT_ENV_FILE = path.resolve(process.cwd(), ".env");
const DEFAULT_METHODS = ["system-presence", "skills.status", "channels.status", "sessions.list"];

function loadEnvFile(filePath) {
  if (!fs.existsSync(filePath)) return;

  const raw = fs.readFileSync(filePath, "utf8");
  for (const line of raw.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const separator = trimmed.indexOf("=");
    if (separator <= 0) continue;

    const key = trimmed.slice(0, separator).trim();
    if (!key || process.env[key]) continue;

    let value = trimmed.slice(separator + 1).trim();
    if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
      value = value.slice(1, -1);
    }
    process.env[key] = value;
  }
}

function parseArgs(argv) {
  const methods = [];
  let envFile = DEFAULT_ENV_FILE;
  let origin;
  let clientId = "openclaw-control-ui";
  let mode = "ui";
  let useDeviceIdentity = false;
  const scopes = [];
  const caps = [];

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === "--env-file") {
      envFile = path.resolve(argv[index + 1] || envFile);
      index += 1;
      continue;
    }
    if (arg === "--origin") {
      origin = argv[index + 1] || origin;
      index += 1;
      continue;
    }
    if (arg === "--client-id") {
      clientId = argv[index + 1] || clientId;
      index += 1;
      continue;
    }
    if (arg === "--mode") {
      mode = argv[index + 1] || mode;
      index += 1;
      continue;
    }
    if (arg === "--scope") {
      scopes.push(argv[index + 1]);
      index += 1;
      continue;
    }
    if (arg === "--cap") {
      caps.push(argv[index + 1]);
      index += 1;
      continue;
    }
    if (arg === "--device-identity") {
      useDeviceIdentity = true;
      continue;
    }
    methods.push(arg);
  }

  return {
    envFile,
    origin,
    clientId,
    mode,
    useDeviceIdentity,
    scopes: scopes.filter(Boolean),
    caps: caps.filter(Boolean),
    methods: methods.length > 0 ? methods : DEFAULT_METHODS,
  };
}

function resolveWsClient() {
  const requireFromOpenClaw = createRequire(DEFAULT_OPENCLAW_PACKAGE_JSON);
  return requireFromOpenClaw("ws");
}

async function loadOpenClawGatewayRuntime() {
  const packageDir = path.dirname(DEFAULT_OPENCLAW_PACKAGE_JSON);
  const runtimeEntry = path.join(packageDir, "dist", "plugin-sdk", "gateway-runtime.js");
  if (!fs.existsSync(runtimeEntry)) {
    throw new Error(`Could not find OpenClaw gateway runtime under ${runtimeEntry}`);
  }
  const packageJson = JSON.parse(fs.readFileSync(DEFAULT_OPENCLAW_PACKAGE_JSON, "utf8"));
  const runtime = await import(pathToFileURL(runtimeEntry).href);
  return {
    GatewayClient: runtime.GatewayClient,
    version: packageJson.version || "unknown",
  };
}

function formatElapsed(startedAt) {
  return `${((performance.now() - startedAt) / 1000).toFixed(3)}s`;
}

async function runOfficialClientProbe({ gatewayUrl, token, clientId, mode, scopes, caps, methods }) {
  const startedAt = performance.now();
  const openclawGatewayRuntime = await loadOpenClawGatewayRuntime();
  const GatewayClient = openclawGatewayRuntime.GatewayClient;
  const clientVersion = openclawGatewayRuntime.version;

  if (typeof GatewayClient !== "function") {
    throw new Error("OpenClaw GatewayClient export is unavailable");
  }

  await new Promise((resolve, reject) => {
    let settled = false;
    let client;

    const finish = (error) => {
      if (settled) return;
      settled = true;
      if (client) client.stop();
      if (error) reject(error);
      else resolve();
    };

    client = new GatewayClient({
      url: gatewayUrl,
      token,
      clientName: clientId,
      clientDisplayName: "Codex Gateway Probe",
      clientVersion,
      platform: process.platform,
      mode,
      role: "operator",
      scopes: scopes.length > 0 ? scopes : ["operator.admin"],
      caps,
      minProtocol: 3,
      maxProtocol: 3,
      onHelloOk: async (hello) => {
        try {
          console.log(`connect ok ${formatElapsed(startedAt)} protocol=${hello?.protocol ?? "?"}`);
          for (const method of methods) {
            const methodStartedAt = performance.now();
            try {
              const payload = await client.request(method, {});
              let summary = "ok";
              if (Array.isArray(payload?.skills)) summary = `skills=${payload.skills.length}`;
              else if (Array.isArray(payload?.sessions)) summary = `sessions=${payload.sessions.length}`;
              else if (payload?.channelAccounts && typeof payload.channelAccounts === "object") {
                summary = `channels=${Object.keys(payload.channelAccounts).length}`;
              } else if (Array.isArray(payload?.instances)) {
                summary = `instances=${payload.instances.length}`;
              }
              console.log(`${method} ${formatElapsed(methodStartedAt)} ${summary}`);
            } catch (error) {
              const message = error instanceof Error ? error.message : String(error);
              console.log(`${method} error ${formatElapsed(methodStartedAt)} ${message}`);
            }
          }
          finish();
        } catch (error) {
          finish(error);
        }
      },
      onConnectError: (error) => {
        const message = error instanceof Error ? error.message : String(error);
        finish(new Error(`connect failed ${formatElapsed(startedAt)} ${message}`));
      },
      onClose: (code, reason) => {
        if (!settled) {
          finish(new Error(`closed ${formatElapsed(startedAt)} code=${code} reason=${reason}`));
        }
      },
    });

    console.log(`socket start ${formatElapsed(startedAt)} ${gatewayUrl} official-client`);
    client.start();
  });
}

async function main() {
  const { envFile, methods, origin, clientId, mode, useDeviceIdentity, scopes, caps } = parseArgs(process.argv.slice(2));
  loadEnvFile(envFile);

  const gatewayUrl = process.env.GATEWAY_URL || DEFAULT_GATEWAY_URL;
  const token = process.env.GATEWAY_TOKEN?.trim();
  if (!token) {
    throw new Error(`GATEWAY_TOKEN is required. Checked environment and ${envFile}`);
  }

  if (useDeviceIdentity) {
    await runOfficialClientProbe({
      gatewayUrl,
      token,
      clientId,
      mode,
      scopes,
      caps,
      methods,
    });
    return;
  }

  const WebSocket = resolveWsClient();
  const startedAt = performance.now();
  const pending = new Map();
  let connectSent = false;
  let connectTimer = null;

  const ws = new WebSocket(gatewayUrl, {
    maxPayload: 25 * 1024 * 1024,
    ...(origin ? { origin } : {}),
  });

  function cleanupPending(error) {
    for (const [, entry] of pending) {
      entry.reject(error);
    }
    pending.clear();
  }

  function request(method, params = {}, { expectFinal = false } = {}) {
    if (ws.readyState !== WebSocket.OPEN) {
      throw new Error("gateway not connected");
    }

    const id = randomUUID();
    return new Promise((resolve, reject) => {
      pending.set(id, { resolve, reject, method, expectFinal, startedAt: performance.now() });
      ws.send(JSON.stringify({ type: "req", id, method, params }));
    });
  }

  function sendConnect() {
    if (connectSent) return;
    connectSent = true;
    if (connectTimer) {
      clearTimeout(connectTimer);
      connectTimer = null;
    }

    return request("connect", {
      minProtocol: 3,
      maxProtocol: 3,
      client: {
        id: clientId,
        displayName: "Codex Gateway Probe",
        version: "2026.3.12",
        platform: process.platform,
        mode,
      },
      caps,
      auth: { token },
      role: "operator",
      scopes: scopes.length > 0 ? scopes : ["operator.admin"],
    });
  }

  ws.on("open", () => {
    console.log(`socket open ${formatElapsed(startedAt)} ${gatewayUrl}${origin ? ` origin=${origin}` : ""}`);
    connectTimer = setTimeout(() => {
      ws.close(1008, "connect challenge timeout");
    }, 4_000);
  });

  ws.on("message", async (rawData) => {
    let message;
    try {
      message = JSON.parse(rawData.toString());
    } catch (error) {
      console.error(`parse error ${formatElapsed(startedAt)} ${String(error)}`);
      return;
    }

    if (message?.type === "event" && message.event === "connect.challenge") {
      const nonce = typeof message.payload?.nonce === "string" ? message.payload.nonce.trim() : "";
      console.log(`challenge ${formatElapsed(startedAt)} nonce=${nonce.length > 0}`);
      if (!nonce) {
        ws.close(1008, "connect challenge missing nonce");
        return;
      }

      try {
        const hello = await sendConnect();
        console.log(`connect ok ${formatElapsed(startedAt)} protocol=${hello?.protocol ?? "?"}`);

        for (const method of methods) {
          const methodStartedAt = performance.now();
          try {
            const payload = await request(method, {});
            let summary = "ok";
            if (Array.isArray(payload?.skills)) summary = `skills=${payload.skills.length}`;
            else if (Array.isArray(payload?.sessions)) summary = `sessions=${payload.sessions.length}`;
            else if (payload?.channelAccounts && typeof payload.channelAccounts === "object") {
              summary = `channels=${Object.keys(payload.channelAccounts).length}`;
            } else if (Array.isArray(payload?.instances)) {
              summary = `instances=${payload.instances.length}`;
            }
            console.log(`${method} ${formatElapsed(methodStartedAt)} ${summary}`);
          } catch (error) {
            const messageText = error instanceof Error ? error.message : String(error);
            console.log(`${method} error ${formatElapsed(methodStartedAt)} ${messageText}`);
          }
        }

        ws.close(1000, "done");
      } catch (error) {
        const messageText = error instanceof Error ? error.message : String(error);
        console.error(`connect failed ${formatElapsed(startedAt)} ${messageText}`);
        ws.close(1008, "connect failed");
      }
      return;
    }

    if (message?.type === "res" && typeof message.id === "string") {
      const entry = pending.get(message.id);
      if (!entry) return;
      if (entry.expectFinal && message.payload?.status === "accepted") return;
      pending.delete(message.id);

      if (message.ok) {
        entry.resolve(message.payload);
      } else {
        entry.reject(new Error(message.error?.message || `${entry.method} failed`));
      }
    }
  });

  ws.on("close", (code, reason) => {
    if (connectTimer) clearTimeout(connectTimer);
    console.log(`closed ${formatElapsed(startedAt)} code=${code} reason=${reason.toString()}`);
    cleanupPending(new Error(`gateway closed (${code}): ${reason.toString()}`));
  });

  ws.on("error", (error) => {
    console.error(`socket error ${formatElapsed(startedAt)} ${error instanceof Error ? error.message : String(error)}`);
  });
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
});
