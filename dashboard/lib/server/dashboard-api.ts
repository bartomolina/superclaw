/* eslint-disable @typescript-eslint/no-explicit-any */
import { mkdirSync, readFileSync, rmSync } from "fs";
import { homedir } from "os";
import path from "path";

import JSON5 from "json5";
import { NextRequest } from "next/server";

import { runCommand } from "@/lib/server/command";
import { ApiError, toApiError } from "@/lib/server/errors";
import { request, GATEWAY_TOKEN } from "@/lib/server/gateway";
import { isSafeWorkspacePath, resolveExistingFileWithin } from "@/lib/server/path-safety";
import { optionalAgentId, optionalString, requiredAgentId, requiredString } from "@/lib/server/validate";

export const OPENCLAW_HOME = process.env.OPENCLAW_HOME || path.join(homedir(), ".openclaw");
const OPENCLAW_PACKAGE_JSON = process.env.OPENCLAW_PACKAGE_JSON || "/usr/lib/node_modules/openclaw/package.json";

export type JsonRecord = Record<string, unknown>;

function getInstalledOpenClawVersion() {
  try {
    const content = readFileSync(OPENCLAW_PACKAGE_JSON, "utf8");
    const data = JSON.parse(content) as { version?: unknown };
    return typeof data.version === "string" ? data.version : null;
  } catch {
    return null;
  }
}

export function json(data: unknown, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

export function errorResponse(error: unknown) {
  const apiError = toApiError(error);
  return json({ error: apiError.message }, apiError.status);
}

export async function parseBody(req: NextRequest) {
  try {
    return await req.json();
  } catch {
    return {};
  }
}

export function isAuthorized(req: NextRequest) {
  const authHeader = req.headers.get("authorization");
  const token = authHeader?.startsWith("Bearer ") ? authHeader.slice(7).trim() : null;
  return !!token && token === GATEWAY_TOKEN;
}

function parseAvatarFromIdentity(content: string | null | undefined) {
  if (!content) return null;
  const match = content.match(/\*\*Avatar:\*\*\s*(.+)/i);
  return match?.[1]?.trim() || null;
}

function readAllowFrom(channel: string, accountId: string) {
  try {
    const suffix = accountId === "default" ? "default" : accountId;
    const content = readFileSync(path.join(OPENCLAW_HOME, "credentials", `${channel}-${suffix}-allowFrom.json`), "utf8");
    const data = JSON.parse(content) as { allowFrom?: string[] };
    return data.allowFrom || [];
  } catch {
    return [];
  }
}

export async function handleVerify(req: NextRequest) {
  const body = await parseBody(req);
  const token = typeof body.token === "string" ? body.token.trim() : "";
  if (!token) return json({ ok: false }, 401);
  if (token === GATEWAY_TOKEN) return json({ ok: true });
  return json({ ok: false }, 401);
}

export async function handleGatewayStatus() {
  const version = getInstalledOpenClawVersion();
  try {
    await request("system-presence", {});
    return json({ online: true, version });
  } catch {
    return json({ online: false, version });
  }
}

export async function handleSkills() {
  const data = (await request("skills.status", {})) as any;
  return json({ skills: data.skills || [] });
}

export async function handleUsage() {
  const data = await request("sessions.usage", {});
  return json(data as JsonRecord);
}

export async function handlePerformance() {
  const os = await import("os");
  const cpus = os.cpus();
  const loadAvg = os.loadavg();
  const totalMem = os.totalmem();
  const freeMem = os.freemem();
  const uptime = os.uptime();

  let diskTotal = 0;
  let diskUsed = 0;
  let diskFree = 0;
  try {
    const { stdout } = await runCommand("df", ["-B1", "/"], { timeoutMs: 5_000 });
    const lines = stdout.trim().split("\n");
    const dataLine = lines[lines.length - 1] || "";
    const parts = dataLine.trim().split(/\s+/);
    diskTotal = parseInt(parts[1] || "0", 10);
    diskUsed = parseInt(parts[2] || "0", 10);
    diskFree = parseInt(parts[3] || "0", 10);
  } catch {
    // Disk metrics unavailable.
  }

  let pm2Processes: any[] = [];
  try {
    const { stdout } = await runCommand("pm2", ["jlist"], { timeoutMs: 5_000 });
    pm2Processes = JSON.parse(stdout || "[]").map((p: any) => ({
      name: p.name,
      status: p.pm2_env?.status,
      cpu: p.monit?.cpu,
      memory: p.monit?.memory,
      uptime: p.pm2_env?.pm_uptime,
    }));
  } catch {
    // PM2 may not be installed.
  }

  let gatewayUp = false;
  try {
    await request("system-presence", {});
    gatewayUp = true;
  } catch {
    gatewayUp = false;
  }

  return json({
    cpu: { cores: cpus.length, model: cpus[0]?.model, loadAvg },
    memory: { total: totalMem, free: freeMem, used: totalMem - freeMem },
    disk: { total: diskTotal, used: diskUsed, free: diskFree },
    uptime,
    pm2: pm2Processes,
    gateway: { online: gatewayUp },
  });
}

export async function handleConfigGet() {
  const config = (await request("config.get", {})) as any;
  return json({ raw: config.raw, hash: config.hash });
}

export async function handleConfigPut(req: NextRequest) {
  const body = (await parseBody(req)) as JsonRecord;
  const raw = requiredString(body.raw, "raw", 2_000_000);
  const baseHash = requiredString(body.baseHash, "baseHash", 256);
  await request("config.apply", { raw, baseHash });
  return json({ ok: true });
}

let modelsCache: Record<string, any[]> | null = null;
let modelsCacheTime = 0;
let modelsCacheInFlight: Promise<Record<string, any[]>> | null = null;

async function loadModelsCatalog() {
  const { stdout } = await runCommand("openclaw", ["models", "list", "--all", "--json"], { timeoutMs: 15_000 });
  const data = JSON.parse(stdout || "{}") as { models?: Array<any> };
  const byProvider: Record<string, any[]> = {};

  for (const model of data.models || []) {
    const provider = String(model.key).split("/")[0];
    byProvider[provider] = byProvider[provider] || [];
    byProvider[provider].push({
      key: model.key,
      name: model.name,
      input: model.input,
      contextWindow: model.contextWindow,
      available: model.available ?? true,
    });
  }

  return byProvider;
}

async function getModelsCatalog() {
  const now = Date.now();
  if (modelsCache && now - modelsCacheTime < 300_000) return modelsCache;

  if (!modelsCacheInFlight) {
    modelsCacheInFlight = loadModelsCatalog()
      .then((catalog) => {
        modelsCache = catalog;
        modelsCacheTime = Date.now();
        return catalog;
      })
      .catch(() => modelsCache || {})
      .finally(() => {
        modelsCacheInFlight = null;
      });
  }

  return modelsCacheInFlight;
}

export async function handleModelsCatalogProviders() {
  const catalog = await getModelsCatalog();
  const providers = Object.keys(catalog)
    .sort()
    .map((provider) => ({ id: provider, count: catalog[provider].length }));
  return json({ providers });
}

export async function handleModelsCatalogProvider(providerRaw: string) {
  const provider = decodeURIComponent(providerRaw);
  const catalog = await getModelsCatalog();
  return json({ provider, models: catalog[provider] || [] });
}

export async function handleModelsAdd(req: NextRequest) {
  const body = (await parseBody(req)) as JsonRecord;
  const modelKey = requiredString(body.model, "model", 256);
  const alias = optionalString(body.alias, 120);

  const config = (await request("config.get", {})) as any;
  const raw = JSON5.parse(config.raw);
  if (!raw.agents) raw.agents = {};
  if (!raw.agents.defaults) raw.agents.defaults = {};
  if (!raw.agents.defaults.models) raw.agents.defaults.models = {};

  const entry: Record<string, string> = {};
  if (alias) entry.alias = alias;
  raw.agents.defaults.models[modelKey] = entry;

  await request("config.apply", { raw: JSON.stringify(raw, null, 2), baseHash: config.hash });
  return json({ ok: true });
}

export async function handleModelsRemove(req: NextRequest) {
  const body = (await parseBody(req)) as JsonRecord;
  const modelKey = requiredString(body.model, "model", 256);

  const config = (await request("config.get", {})) as any;
  const raw = JSON5.parse(config.raw);
  const models = raw.agents?.defaults?.models;

  if (!models || !models[modelKey]) return json({ error: "model not in catalog" }, 404);
  const primary = raw.agents?.defaults?.model?.primary;
  if (modelKey === primary) return json({ error: "cannot remove the primary model" }, 400);

  delete models[modelKey];

  const fallbacks = raw.agents?.defaults?.model?.fallbacks;
  if (Array.isArray(fallbacks)) {
    raw.agents.defaults.model.fallbacks = fallbacks.filter((fallback: string) => fallback !== modelKey);
  }

  await request("config.apply", { raw: JSON.stringify(raw, null, 2), baseHash: config.hash });
  return json({ ok: true });
}

export async function handleModelsSetPrimary(req: NextRequest) {
  const body = (await parseBody(req)) as JsonRecord;
  const modelKey = requiredString(body.model, "model", 256);

  const config = (await request("config.get", {})) as any;
  const raw = JSON5.parse(config.raw);
  if (!raw.agents) raw.agents = {};
  if (!raw.agents.defaults) raw.agents.defaults = {};
  if (!raw.agents.defaults.model) raw.agents.defaults.model = {};

  raw.agents.defaults.model.primary = modelKey;
  if (!raw.agents.defaults.models) raw.agents.defaults.models = {};
  if (!raw.agents.defaults.models[modelKey]) raw.agents.defaults.models[modelKey] = {};

  await request("config.apply", { raw: JSON.stringify(raw, null, 2), baseHash: config.hash });
  return json({ ok: true });
}

export async function handleAgentsList() {
  const [agentsList, config, channelsData, modelsData, cronsData] = await Promise.all([
    request("agents.list", {}),
    request("config.get", {}),
    request("channels.status", {}),
    request("models.list", {}),
    request("cron.list", {}).catch(() => ({ jobs: [] })),
  ]);

  const configObj = config as { raw: string; hash: string };
  const rawConfig = JSON5.parse(configObj.raw || "{}") as any;
  const defaults = rawConfig.agents?.defaults ?? {};
  const defaultModel = defaults.model?.primary ?? "—";

  const agents = (agentsList as any).agents || [];
  const [identities, toolsCatalogs, perAgentSkills, heartbeatFiles, agentFiles, identityFiles] = await Promise.all([
    Promise.all(
      agents.map((a: any) =>
        request("agent.identity.get", { agentId: a.id }).catch(() => ({
          agentId: a.id,
          name: a.id,
          emoji: "🤖",
          avatar: null,
        }))
      )
    ),
    Promise.all(agents.map((a: any) => request("tools.catalog", { agentId: a.id }).catch(() => ({ groups: [] })))),
    Promise.all(agents.map((a: any) => request("skills.status", { agentId: a.id }).catch(() => ({ skills: [] })))),
    Promise.all(agents.map((a: any) => request("agents.files.get", { agentId: a.id, name: "HEARTBEAT.md" }).catch(() => null))),
    Promise.all(agents.map((a: any) => request("agents.files.list", { agentId: a.id }).catch(() => ({ files: [] })))),
    Promise.all(agents.map((a: any) => request("agents.files.get", { agentId: a.id, name: "IDENTITY.md" }).catch(() => null))),
  ]);

  const configRaw = JSON5.parse(configObj.raw || "{}") as any;
  const bindings = configRaw.bindings || [];
  const accountsByAgent: Record<string, any[]> = {};

  const sessionsData = (await request("sessions.list", {}).catch(() => ({ sessions: [] }))) as any;
  const sessionNamesByPeerId: Record<string, string> = {};
  for (const s of sessionsData.sessions || []) {
    if (s.origin?.provider && s.origin?.from && s.displayName) {
      const peerId = String(s.origin.from).split(":").pop();
      if (peerId && !sessionNamesByPeerId[peerId]) {
        sessionNamesByPeerId[peerId] = String(s.displayName).replace(/\s*id:\d+$/, "");
      }
    }
  }

  const channelAccounts = (channelsData as any).channelAccounts || {};
  for (const [channelId, accounts] of Object.entries(channelAccounts)) {
    const label = (channelsData as any).channelLabels?.[channelId] || channelId;
    const detail = (channelsData as any).channelDetailLabels?.[channelId] || null;

    for (const acct of accounts as any[]) {
      const binding = bindings.find((b: any) => b.match?.channel === channelId && b.match?.accountId === acct.accountId);
      const agentId = binding?.agentId || agents.find((a: any) => a.default)?.id || "main";
      if (!accountsByAgent[agentId]) accountsByAgent[agentId] = [];

      const allowFrom = readAllowFrom(String(channelId), acct.accountId);
      const pairedUsers = allowFrom.map((id: string) => ({ id, name: sessionNamesByPeerId[id] || id }));

      const accountConfig = configRaw.channels?.[channelId]?.accounts?.[acct.accountId] || {};
      const topLevelGroups = acct.accountId === "default" ? configRaw.channels?.[channelId]?.groups || {} : {};
      const groupsConfig = { ...topLevelGroups, ...accountConfig.groups };
      const groups = Object.entries(groupsConfig)
        .filter(([key]) => key !== "*")
        .map(([id, cfg]: [string, any]) => ({
          id,
          requireMention: cfg.requireMention ?? true,
          groupPolicy: cfg.groupPolicy ?? "allowlist",
        }));

      const streaming = accountConfig.streaming ?? configRaw.channels?.[channelId]?.streaming ?? "partial";

      accountsByAgent[agentId].push({
        id: `${channelId}:${acct.accountId}`,
        name: label,
        detail: acct.accountId === "default" ? detail : `${detail || label} · ${acct.accountId}`,
        running: acct.running ?? false,
        mode: acct.mode ?? null,
        streaming: channelId === "telegram" ? streaming : null,
        pairedUsers,
        groups,
      });
    }
  }

  const wsModelsMap = new Map(
    ((modelsData as any).models || []).map((m: any) => {
      const fullId = String(m.id).includes("/") ? m.id : `${m.provider}/${m.id}`;
      return [fullId, m];
    })
  );

  const configModels = rawConfig.agents?.defaults?.models || {};
  const models = Object.keys(configModels).map((key) => {
    const ws = wsModelsMap.get(key) as any;
    const provider = key.split("/")[0];
    return {
      id: key,
      name: ws?.name || key.split("/").pop(),
      provider: ws?.provider || provider,
      contextWindow: ws?.contextWindow || null,
    };
  });

  const mappedAgents = agents.map((a: any, idx: number) => {
    const identity = identities.find((i: any) => i.agentId === a.id) || {};
    const agentTools = toolsCatalogs[idx] as any;
    const agentSkills = perAgentSkills[idx] as any;
    const hbFile = heartbeatFiles[idx] as any;
    const hbContent = hbFile?.file?.content || "";
    const hbHasRealContent = String(hbContent)
      .split("\n")
      .some((line) => line.trim() && !line.trim().startsWith("#"));

    const identityContent = (identityFiles[idx] as any)?.file?.content || "";
    const avatarRelPath = parseAvatarFromIdentity(identityContent);
    const agentEntry = configRaw.agents?.list?.find((x: any) => x.id === a.id) || {};
    const agentWorkspace = agentEntry.workspace ?? defaults.workspace ?? "";
    const avatarAbsPath = resolveExistingFileWithin(agentWorkspace, avatarRelPath);
    const hasAvatar = !!avatarAbsPath;

    const agentConfig = rawConfig.agents?.list?.find((l: any) => l.id === a.id) || {};
    const hasOwnModel = !!agentConfig.model;
    const modelObj = typeof agentConfig.model === "string" ? { primary: agentConfig.model } : agentConfig.model ?? {};
    const agentModel = modelObj.primary ?? defaultModel;
    const agentFallbacks = modelObj.fallbacks ?? defaults.model?.fallbacks ?? [];
    const isDefault = a.id === (agentsList as any).defaultId;

    return {
      id: a.id,
      name: identity.name || a.name || a.id,
      emoji: identity.emoji || "🤖",
      avatarUrl: hasAvatar ? `/api/agents/${a.id}/avatar` : null,
      avatar: identity.avatar || null,
      model: String(agentModel).split("/").pop(),
      modelFull: agentModel,
      fallbacks: agentFallbacks,
      hasOwnModel,
      workspace: agentConfig.workspace ?? defaults.workspace ?? "—",
      isDefault,
      toolsProfile: agentConfig.tools?.profile ?? defaults.tools?.profile ?? null,
      sandboxed: !!agentConfig.sandbox && agentConfig.sandbox.mode && agentConfig.sandbox.mode !== "off",
      workspaceAccess: agentConfig.sandbox?.workspaceAccess ?? null,
      channels: accountsByAgent[a.id] || (isDefault ? accountsByAgent.main || [] : []),
      skills: (agentSkills?.skills || []).map((s: any) => ({
        name: s.name,
        emoji: s.emoji ?? "📦",
        description: s.description ?? "",
        eligible: s.eligible ?? false,
        disabled: s.disabled ?? false,
        source: s.source ?? "",
      })),
      models,
      toolGroups: (agentTools?.groups || []).map((g: any) => ({
        id: g.id,
        label: g.label,
        tools: (g.tools || []).map((t: any) => ({
          id: t.id,
          label: t.label,
          description: t.description || "",
        })),
      })),
      heartbeat: {
        every: agentConfig.heartbeat?.every ?? defaults.heartbeat?.every ?? null,
        model: agentConfig.heartbeat?.model ?? defaults.heartbeat?.model ?? null,
        active: hbHasRealContent,
      },
      files: ((agentFiles[idx] as any)?.files || []).map((f: any) => ({
        name: f.name,
        path: f.path,
        missing: f.missing ?? false,
        size: f.size ?? 0,
        updatedAtMs: f.updatedAtMs ?? 0,
      })),
      crons: ((cronsData as any).jobs || [])
        .filter((j: any) => (j.agentId || "main") === a.id)
        .map((j: any) => ({
          id: j.id,
          name: j.name || j.id,
          schedule:
            j.schedule?.expr ||
            j.schedule?.at ||
            (j.schedule?.everyMs ? `${Math.round(j.schedule.everyMs / 60000)}m` : ""),
          scheduleKind: j.schedule?.kind || "",
          model: j.payload?.model || null,
          message: j.payload?.message || null,
          enabled: j.enabled ?? true,
          nextRunAtMs: j.state?.nextRunAtMs || null,
        })),
    };
  });

  const modelConfig = rawConfig.agents?.defaults?.model ?? {};
  return json({
    version: getInstalledOpenClawVersion() ?? "—",
    defaultAgent: (agentsList as any).defaultId,
    defaultModel: {
      primary: modelConfig.primary ?? null,
      fallbacks: modelConfig.fallbacks ?? [],
    },
    agents: mappedAgents,
  });
}

export async function handleCreateAgent(req: NextRequest) {
  const body = (await parseBody(req)) as JsonRecord;

  const id = requiredAgentId(body.id);
  const name = optionalString(body.name, 120);
  const emoji = optionalString(body.emoji, 16);
  const telegramToken = optionalString(body.telegramToken, 256);
  const description = optionalString(body.description, 1200);

  const workspace = path.join(OPENCLAW_HOME, `workspace-${id}`);

  await runCommand("openclaw", ["agents", "add", id, "--non-interactive", "--workspace", workspace], { timeoutMs: 15_000 });

  if (name || emoji) {
    const args = ["agents", "set-identity", "--agent", id];
    if (name) args.push("--name", name);
    if (emoji) args.push("--emoji", emoji);
    await runCommand("openclaw", args, { timeoutMs: 10_000 });
  }

  if (description) {
    try {
      const avatarDir = path.join(workspace, "avatars");
      mkdirSync(avatarDir, { recursive: true });

      const avatarPath = path.join(avatarDir, `${id}-avatar.png`);
      const basePrompt =
        "Digital illustration close-up portrait in a vibrant cel-shaded style with vivid saturated colors, sharp detailed background, clean lines. Borderless seamless artwork, no panel borders, no frames. Square 1:1 composition, character from chest up filling the frame. Character:";
      const fullPrompt = `${basePrompt} ${description}`;
      const apiKey = process.env.GEMINI_API_KEY || "";
      const uvPath = process.env.UV_PATH || `${homedir()}/.local/bin`;

      await runCommand(
        "uv",
        [
          "run",
          "/usr/lib/node_modules/openclaw/skills/nano-banana-pro/scripts/generate_image.py",
          "--prompt",
          fullPrompt,
          "--filename",
          avatarPath,
          "--resolution",
          "1K",
        ],
        {
          timeoutMs: 60_000,
          env: {
            ...process.env,
            GEMINI_API_KEY: apiKey,
            PATH: `${uvPath}:${process.env.PATH || ""}`,
          },
        }
      );

      const identityContent = `# IDENTITY.md - Who Am I?\n\n- **Name:** ${name || id}\n- **Emoji:** ${emoji || "🤖"}\n- **Avatar:** avatars/${id}-avatar.png\n`;
      await request("agents.files.set", { agentId: id, name: "IDENTITY.md", content: identityContent });
    } catch {
      // Non-fatal; agent creation succeeded.
    }
  }

  if (telegramToken) {
    await runCommand("openclaw", ["channels", "add", "--channel", "telegram", "--account", id, "--token", telegramToken], {
      timeoutMs: 15_000,
    });

    await new Promise((resolve) => setTimeout(resolve, 2000));

    const config = (await request("config.get", {})) as any;
    const raw = JSON5.parse(config.raw);
    if (!raw.bindings) raw.bindings = [];
    raw.bindings.push({ agentId: id, match: { channel: "telegram", accountId: id } });

    await request("config.apply", { raw: JSON.stringify(raw, null, 2), baseHash: config.hash });
  }

  return json({ ok: true, id, workspace });
}

export async function handleDeleteAgent(req: NextRequest, agentIdRaw: string) {
  const agentId = optionalAgentId(agentIdRaw);
  if (!agentId) throw new ApiError("invalid agent id", 400);
  if (agentId === "main") return json({ error: "cannot delete default agent" }, 400);

  const deleteWorkspace = req.nextUrl.searchParams.get("deleteWorkspace") === "true";

  const config = (await request("config.get", {})) as any;
  const raw = JSON5.parse(config.raw);
  const idx = (raw.agents?.list || []).findIndex((a: any) => a.id === agentId);
  if (idx === -1) return json({ error: "agent not found" }, 404);

  const workspace = raw.agents.list[idx].workspace;
  raw.agents.list.splice(idx, 1);
  await request("config.apply", { raw: JSON.stringify(raw, null, 2), baseHash: config.hash });

  try {
    await runCommand("openclaw", ["channels", "remove", "--channel", "telegram", "--account", agentId, "--delete"], {
      timeoutMs: 10_000,
    });
  } catch {
    // Telegram account might not exist for this agent.
  }

  try {
    await new Promise((resolve) => setTimeout(resolve, 2000));
    const updatedConfig = (await request("config.get", {})) as any;
    const updatedRaw = JSON5.parse(updatedConfig.raw);
    if (Array.isArray(updatedRaw.bindings)) {
      updatedRaw.bindings = updatedRaw.bindings.filter((b: any) => b.agentId !== agentId);
      if (updatedRaw.bindings.length === 0) delete updatedRaw.bindings;
      await request("config.apply", { raw: JSON.stringify(updatedRaw, null, 2), baseHash: updatedConfig.hash });
    }
  } catch {
    // Non-fatal cleanup path.
  }

  try {
    const crons = (await request("cron.list", {})) as any;
    const agentCrons = (crons.jobs || []).filter((job: any) => job.agentId === agentId);
    for (const job of agentCrons) {
      await request("cron.remove", { jobId: job.id }).catch(() => {});
    }
  } catch {
    // Non-fatal cleanup path.
  }

  if (deleteWorkspace) {
    const warnings: string[] = [];

    if (workspace) {
      if (!isSafeWorkspacePath(OPENCLAW_HOME, workspace)) {
        warnings.push("Workspace removal blocked by safety policy");
      } else {
        try {
          rmSync(workspace, { recursive: true, force: true });
        } catch (error) {
          warnings.push(`Workspace removal failed: ${(error as Error).message}`);
        }
      }
    }

    try {
      rmSync(path.join(OPENCLAW_HOME, "agents", agentId), { recursive: true, force: true });
    } catch (error) {
      warnings.push(`Agent state dir removal failed: ${(error as Error).message}`);
    }

    if (warnings.length) return json({ ok: true, warnings });
  }

  return json({ ok: true });
}

export async function handleAgentModel(req: NextRequest, agentIdRaw: string) {
  const agentId = optionalAgentId(agentIdRaw);
  if (!agentId) throw new ApiError("invalid agent id", 400);

  const body = (await parseBody(req)) as JsonRecord;
  const newModel = requiredString(body.model, "model", 256);

  const config = (await request("config.get", {})) as any;
  const raw = JSON5.parse(config.raw);
  const agentEntry = (raw.agents?.list || []).find((agent: any) => agent.id === agentId);
  if (!agentEntry) return json({ error: "agent not found" }, 404);

  const defaults = raw.agents?.defaults ?? {};
  const defaultFallbacks = defaults.model?.fallbacks ?? [];

  if (newModel === "__default__") {
    delete agentEntry.model;
  } else {
    agentEntry.model = {
      primary: newModel,
      fallbacks: agentEntry.model?.fallbacks ?? defaultFallbacks,
    };
  }

  await request("config.apply", { raw: JSON.stringify(raw, null, 2), baseHash: config.hash });
  return json({ ok: true, model: newModel });
}

export async function handleAvatar(agentIdRaw: string) {
  const agentId = optionalAgentId(agentIdRaw);
  if (!agentId) throw new ApiError("invalid agent id", 400);

  const identityData = (await request("agents.files.get", { agentId, name: "IDENTITY.md" })) as any;
  const avatarRelPath = parseAvatarFromIdentity(identityData?.file?.content);
  if (!avatarRelPath) return json({ error: "no avatar" }, 404);

  const config = (await request("config.get", {})) as any;
  const raw = JSON5.parse(config.raw);
  const agent = raw.agents?.list?.find((a: any) => a.id === agentId);
  const workspace = agent?.workspace || raw.agents?.defaults?.workspace || "";
  const absPath = resolveExistingFileWithin(workspace, avatarRelPath);

  if (!absPath) return json({ error: "avatar file not found" }, 404);

  const ext = path.extname(absPath).toLowerCase();
  const mimeTypes: Record<string, string> = {
    ".jpg": "image/jpeg",
    ".jpeg": "image/jpeg",
    ".png": "image/png",
    ".gif": "image/gif",
    ".webp": "image/webp",
  };
  const contentType = mimeTypes[ext] || "application/octet-stream";
  const data = readFileSync(absPath);

  return new Response(data, {
    headers: {
      "Content-Type": contentType,
      "Cache-Control": "public, max-age=300",
    },
  });
}

export async function handleAgentFileGet(agentIdRaw: string, fileNameRaw: string) {
  const agentId = optionalAgentId(agentIdRaw);
  const name = requiredString(fileNameRaw, "name", 255);
  if (!agentId) throw new ApiError("invalid agent id", 400);
  const data = await request("agents.files.get", { agentId, name });
  return json(data as JsonRecord);
}

export async function handleAgentFilePut(req: NextRequest, agentIdRaw: string, fileNameRaw: string) {
  const agentId = optionalAgentId(agentIdRaw);
  const name = requiredString(fileNameRaw, "name", 255);
  if (!agentId) throw new ApiError("invalid agent id", 400);
  const body = (await parseBody(req)) as JsonRecord;
  const content = typeof body.content === "string" ? body.content : "";
  await request("agents.files.set", { agentId, name, content });
  return json({ ok: true });
}

export async function handleAgentHeartbeatModel(req: NextRequest, agentIdRaw: string) {
  const agentId = optionalAgentId(agentIdRaw);
  if (!agentId) throw new ApiError("invalid agent id", 400);

  const body = (await parseBody(req)) as JsonRecord;
  const model = optionalString(body.model, 256);

  const config = (await request("config.get", {})) as any;
  const raw = JSON5.parse(config.raw);
  const agent = raw.agents?.list?.find((entry: any) => entry.id === agentId);
  if (!agent) return json({ error: "agent not found" }, 404);

  if (!agent.heartbeat) agent.heartbeat = {};
  if (model) {
    agent.heartbeat.model = model;
  } else {
    delete agent.heartbeat.model;
    if (Object.keys(agent.heartbeat).length === 0) delete agent.heartbeat;
  }

  await request("config.apply", { raw: JSON.stringify(raw, null, 2), baseHash: config.hash });
  return json({ ok: true });
}

export async function handleAgentSandbox(req: NextRequest, agentIdRaw: string) {
  const agentId = optionalAgentId(agentIdRaw);
  if (!agentId) throw new ApiError("invalid agent id", 400);

  const body = (await parseBody(req)) as JsonRecord;
  const sandboxed = body.sandboxed === true;
  const workspaceAccess = body.workspaceAccess === "none" || body.workspaceAccess === "ro" || body.workspaceAccess === "rw"
    ? body.workspaceAccess
    : "rw";

  const config = (await request("config.get", {})) as any;
  const raw = JSON5.parse(config.raw);
  const agent = raw.agents?.list?.find((entry: any) => entry.id === agentId);
  if (!agent) return json({ error: "agent not found" }, 404);

  if (sandboxed) {
    agent.sandbox = {
      mode: "all",
      scope: "agent",
      workspaceAccess,
    };
  } else {
    delete agent.sandbox;
  }

  await request("config.apply", { raw: JSON.stringify(raw, null, 2), baseHash: config.hash });
  return json({ ok: true, sandboxed, workspaceAccess: sandboxed ? workspaceAccess : null });
}

export async function handleCronModel(req: NextRequest, cronIdRaw: string) {
  const cronId = requiredString(cronIdRaw, "cronId", 128);
  const body = (await parseBody(req)) as JsonRecord;
  const model = optionalString(body.model, 256);

  const crons = (await request("cron.list", {})) as any;
  const job = crons.jobs?.find((entry: any) => entry.id === cronId);
  if (!job) return json({ error: "cron not found" }, 404);

  const payload: Record<string, unknown> = { kind: job.payload.kind };
  if (job.payload.message) payload.message = job.payload.message;
  if (model) payload.model = model;

  await request("cron.update", { jobId: cronId, patch: { payload } });
  return json({ ok: true });
}

export function isDebugRpcEnabled() {
  const raw = String(process.env.DEBUG_RPC_ENABLED || "false").toLowerCase().trim();
  return raw === "1" || raw === "true" || raw === "yes" || raw === "on";
}

export async function handleFeatures() {
  return json({ debugRpcEnabled: isDebugRpcEnabled() });
}

export async function handleDebugWs(req: NextRequest) {
  if (!isDebugRpcEnabled()) {
    return json({ error: "debug rpc disabled" }, 403);
  }

  const body = (await parseBody(req)) as JsonRecord;
  const wsMethod = requiredString(body.method, "method", 120);
  if (!/^[a-zA-Z0-9._-]+$/.test(wsMethod)) {
    throw new ApiError("invalid method", 400);
  }

  const params = typeof body.params === "object" && body.params !== null ? body.params : {};
  const result = await request(wsMethod, params as Record<string, unknown>);
  return json({ ok: true, method: wsMethod, result });
}
