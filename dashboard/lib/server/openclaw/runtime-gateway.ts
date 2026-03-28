import fs from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";

import { GATEWAY_TOKEN, OPENCLAW_PACKAGE_JSON } from "@/lib/server/openclaw/constants";

type GatewayClientLike = {
  start(): void;
  stop(): void;
  request(method: string, params: Record<string, unknown>, opts?: { expectFinal?: boolean }): Promise<unknown>;
};

type GatewayClientCtor = new (opts: Record<string, unknown>) => GatewayClientLike;

type OpenClawGatewayModule = {
  GatewayClient: GatewayClientCtor;
  loadOrCreateDeviceIdentity: () => unknown;
};

type Deferred<T> = {
  promise: Promise<T>;
  resolve: (value: T | PromiseLike<T>) => void;
  reject: (reason?: unknown) => void;
};

function createDeferred<T>(): Deferred<T> {
  let resolve!: Deferred<T>["resolve"];
  let reject!: Deferred<T>["reject"];
  const promise = new Promise<T>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
}

async function importOpenClawGatewayModule(): Promise<OpenClawGatewayModule> {
  const packageDir = path.dirname(OPENCLAW_PACKAGE_JSON);
  const distDir = path.join(packageDir, "dist");
  const entries = fs.readdirSync(distDir).filter((entry) => entry.endsWith(".js")).sort();

  const preferredPrefixes = ["method-scopes-", "reply-"];
  const candidates = [
    ...preferredPrefixes.flatMap((prefix) => entries.filter((entry) => entry.startsWith(prefix))),
    ...entries.filter((entry) => !preferredPrefixes.some((prefix) => entry.startsWith(prefix))),
  ];

  if (candidates.length === 0) {
    throw new Error(`Could not find an OpenClaw gateway bundle under ${distDir}`);
  }

  const dynamicImport = new Function("modulePath", "return import(modulePath);") as (modulePath: string) => Promise<Record<string, unknown>>;
  const errors: string[] = [];

  for (const entry of candidates) {
    try {
      const importPath = pathToFileURL(path.join(distDir, entry)).href;
      const mod = await dynamicImport(importPath);
      const GatewayClient = Object.values(mod).find(
        (value): value is GatewayClientCtor => typeof value === "function" && value.name === "GatewayClient",
      );
      const loadOrCreateDeviceIdentity = Object.values(mod).find(
        (value): value is OpenClawGatewayModule["loadOrCreateDeviceIdentity"] =>
          typeof value === "function" && value.name === "loadOrCreateDeviceIdentity",
      );

      if (GatewayClient && loadOrCreateDeviceIdentity) {
        return { GatewayClient, loadOrCreateDeviceIdentity };
      }

      errors.push(`${entry}: missing GatewayClient/loadOrCreateDeviceIdentity exports`);
    } catch (error) {
      errors.push(`${entry}: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  throw new Error(`Could not resolve OpenClaw GatewayClient internals from installed package (${errors.slice(0, 5).join("; ")})`);
}

function withTimeout<T>(promise: Promise<T>, timeoutMs: number, label: string) {
  let timer: NodeJS.Timeout | null = null;

  const timeoutPromise = new Promise<T>((_, reject) => {
    timer = setTimeout(() => {
      reject(new Error(`${label} timed out after ${timeoutMs}ms`));
    }, timeoutMs);
  });

  return Promise.race([promise, timeoutPromise]).finally(() => {
    if (timer) clearTimeout(timer);
  });
}

class RuntimeGatewayClient {
  private modulePromise: Promise<OpenClawGatewayModule> | null = null;
  private client: GatewayClientLike | null = null;
  private started = false;
  private connected = false;
  private ready = createDeferred<void>();
  private lastConnectError: Error | null = null;

  private async loadModule() {
    if (!this.modulePromise) {
      this.modulePromise = importOpenClawGatewayModule();
    }
    return await this.modulePromise;
  }

  private resetReady(reason?: Error) {
    if (!this.connected && reason) {
      this.ready.reject(reason);
    }
    this.connected = false;
    this.ready = createDeferred<void>();
  }

  private async ensureStarted() {
    if (!GATEWAY_TOKEN) {
      throw new Error("GATEWAY_TOKEN is required in environment");
    }

    if (this.client) return this.client;

    const { GatewayClient, loadOrCreateDeviceIdentity } = await this.loadModule();
    const deviceIdentity = loadOrCreateDeviceIdentity();

    this.resetReady();
    this.lastConnectError = null;
    this.started = true;

    this.client = new GatewayClient({
      token: GATEWAY_TOKEN,
      clientName: "gateway-client",
      clientDisplayName: "SuperClaw Dashboard",
      clientVersion: "2026.3.12",
      platform: process.platform,
      mode: "backend",
      role: "operator",
      scopes: ["operator.admin"],
      caps: ["tool-events"],
      deviceIdentity,
      minProtocol: 3,
      maxProtocol: 3,
      onHelloOk: () => {
        this.lastConnectError = null;
        this.connected = true;
        this.ready.resolve();
      },
      onConnectError: (error: unknown) => {
        this.connected = false;
        this.lastConnectError = error instanceof Error ? error : new Error(String(error));
      },
      onClose: (_code: number, reason: string) => {
        this.resetReady(reason ? new Error(reason) : undefined);
      },
    });

    this.client.start();
    return this.client;
  }

  async request<T>(method: string, params: Record<string, unknown> = {}, timeoutMs = 10_000): Promise<T> {
    const client = await this.ensureStarted();

    try {
      await withTimeout(this.ready.promise, timeoutMs, `gateway connect for ${method}`);
    } catch (error) {
      throw this.lastConnectError ?? (error instanceof Error ? error : new Error(String(error)));
    }

    try {
      return (await withTimeout(client.request(method, params), timeoutMs, `gateway request ${method}`)) as T;
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      if (message.includes("gateway not connected")) {
        await withTimeout(this.ready.promise, timeoutMs, `gateway reconnect for ${method}`);
        return (await withTimeout(client.request(method, params), timeoutMs, `gateway retry ${method}`)) as T;
      }
      throw error;
    }
  }
}

let runtimeGatewayClient: RuntimeGatewayClient | null = null;

function getRuntimeGatewayClient() {
  if (!runtimeGatewayClient) {
    runtimeGatewayClient = new RuntimeGatewayClient();
  }
  return runtimeGatewayClient;
}

export async function runtimeGatewayRequest<T>(method: string, params: Record<string, unknown> = {}, timeoutMs?: number) {
  return await getRuntimeGatewayClient().request<T>(method, params, timeoutMs);
}
