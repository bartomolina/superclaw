/* eslint-disable @typescript-eslint/no-explicit-any */
import { execFile } from "child_process";
import { existsSync, lstatSync, mkdirSync, rmSync, writeFileSync } from "fs";
import path from "path";
import { promisify } from "util";

import { GoogleGenAI } from "@google/genai";
import { NextRequest } from "next/server";

import { ApiError } from "@/lib/server/errors";
import { isSafeWorkspacePath } from "@/lib/server/path-safety";
import { optionalAgentId, optionalString, requiredAgentId, requiredString } from "@/lib/server/validate";
import { runOpenClaw, runOpenClawJson } from "@/lib/server/openclaw/cli";
import { applyConfig, getConfigDocument, parseConfigRaw, readLocalConfig } from "@/lib/server/openclaw/config";
import { OPENCLAW_HOME } from "@/lib/server/openclaw/constants";
import { listCrons } from "@/lib/server/openclaw/crons";
import {
  getAgentHeartbeatFile,
  getAgentIdentityFile,
  hasMeaningfulMarkdownContent,
  listAgentWorkspaceFiles,
  parseAvatarFromIdentity,
  parseIdentityFromMarkdown,
} from "@/lib/server/openclaw/files";
import { json, parseBody } from "@/lib/server/openclaw/http";
import { aliasToFullModel, detectFallbacks, inferAvailableModels } from "@/lib/server/openclaw/models";
import { getInstalledOpenClawVersion } from "@/lib/server/openclaw/status";
import { AgentsListResponse, DashboardAgent } from "@/lib/server/openclaw/types";

function normalizeAgentsList(parsed: any): { agents: any[]; defaultId: string | null } {
  if (Array.isArray(parsed)) {
    return { agents: parsed, defaultId: null };
  }

  if (parsed && Array.isArray(parsed.agents)) {
    return {
      agents: parsed.agents,
      defaultId: typeof parsed.defaultId === "string" ? parsed.defaultId : null,
    };
  }

  if (parsed && Array.isArray(parsed.list)) {
    return {
      agents: parsed.list,
      defaultId: typeof parsed.defaultId === "string" ? parsed.defaultId : null,
    };
  }

  return { agents: [], defaultId: null };
}

const execFileAsync = promisify(execFile);
const KANBAN_APP_DIR = path.join(OPENCLAW_HOME, "workspace", "apps", "superclaw", "kanban");
const AGENT_CREATE_TIMEOUT_MS = 300_000;
const AVATAR_GENERATION_TIMEOUT_MS = 60_000;

function addWarning(warnings: string[], label: string, error: unknown) {
  warnings.push(`${label}: ${error instanceof Error ? error.message : String(error)}`);
}

function withTimeout<T>(promise: Promise<T>, timeoutMs: number, label: string): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  const timeout = new Promise<never>((_, reject) => {
    timer = setTimeout(() => reject(new Error(`${label} timed out after ${timeoutMs}ms`)), timeoutMs);
  });

  return Promise.race([promise, timeout]).finally(() => {
    if (timer) clearTimeout(timer);
  });
}

function parseCliJsonValue<T>(stdout: string, stderr: string, fallback: T): T {
  const candidates = [stdout, stderr]
    .map((text) => text.trim())
    .filter(Boolean)
    .map((text) => {
      const objectStart = text.indexOf("{");
      const arrayStart = text.indexOf("[");
      if (objectStart === -1) return arrayStart >= 0 ? text.slice(arrayStart) : text;
      if (arrayStart === -1) return text.slice(objectStart);
      return text.slice(Math.min(objectStart, arrayStart));
    });

  for (const candidate of candidates) {
    try {
      return JSON.parse(candidate) as T;
    } catch {
      // try next candidate
    }
  }

  return fallback;
}

function detectImageExtension(buffer: Buffer) {
  if (buffer.length >= 12 && buffer.subarray(0, 4).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47]))) return ".png";
  if (buffer.length >= 3 && buffer.subarray(0, 3).equals(Buffer.from([0xff, 0xd8, 0xff]))) return ".jpg";
  if (buffer.length >= 6 && (buffer.subarray(0, 6).toString("ascii") === "GIF87a" || buffer.subarray(0, 6).toString("ascii") === "GIF89a")) return ".gif";
  if (buffer.length >= 12 && buffer.subarray(0, 4).toString("ascii") === "RIFF" && buffer.subarray(8, 12).toString("ascii") === "WEBP") return ".webp";
  return ".png";
}

async function generateAvatarImage({
  apiKey,
  prompt,
  outputPath,
}: {
  apiKey: string;
  prompt: string;
  outputPath: string;
}) {
  const ai = new GoogleGenAI({ apiKey });
  const interaction = await ai.interactions.create({
    model: process.env.GEMINI_IMAGE_MODEL || "gemini-3-pro-image-preview",
    input: prompt,
    response_modalities: ["image"],
  });

  const imageOutput = interaction.outputs?.find(
    (output): output is { type: "image"; data?: string } => output.type === "image",
  );
  const image = imageOutput?.data;

  if (!image) {
    throw new Error("Gemini returned no image data");
  }

  const buffer = Buffer.from(image, "base64");
  const sourcePath = outputPath.replace(/\.webp$/i, `.source${detectImageExtension(buffer)}`);
  writeFileSync(sourcePath, buffer);

  try {
    await execFileAsync("convert", [sourcePath, "-resize", "512x512", "-strip", "-quality", "84", outputPath], {
      timeout: 30_000,
      maxBuffer: 16 * 1024 * 1024,
    });
  } finally {
    rmSync(sourcePath, { force: true });
  }
}

function ensureAgentSandbox(agent: any) {
  if (!agent.sandbox || typeof agent.sandbox !== "object") {
    agent.sandbox = {
      mode: "off",
      scope: "agent",
    };
    return agent.sandbox;
  }

  if (!agent.sandbox.mode) {
    agent.sandbox.mode = "off";
  }

  if (!agent.sandbox.scope) {
    agent.sandbox.scope = "agent";
  }

  return agent.sandbox;
}

function hasRealCopiedSkill(workspace: string, skillName: string) {
  try {
    const skillDir = path.join(workspace, "skills", skillName);
    const skillFile = path.join(skillDir, "SKILL.md");
    if (!existsSync(skillDir) || !existsSync(skillFile)) return false;
    return !lstatSync(skillDir).isSymbolicLink();
  } catch {
    return false;
  }
}

async function listDedicatedKanbanCredentialAgentIds() {
  const { stdout: superuserStdout, stderr: superuserStderr } = await execFileAsync(
    "pnpm",
    ["exec", "convex", "env", "get", "SUPERUSER_EMAIL"],
    {
      cwd: KANBAN_APP_DIR,
      timeout: 15_000,
      env: process.env,
      maxBuffer: 256 * 1024,
    },
  );

  const superuserEmail = [superuserStdout, superuserStderr]
    .flatMap((text) => text.split(/\r?\n/))
    .map((line) => line.trim())
    .filter(Boolean)
    .at(-1);

  if (!superuserEmail) {
    throw new Error("SUPERUSER_EMAIL is missing from the Convex deployment");
  }

  const identity = JSON.stringify({
    email: superuserEmail,
    subject: "openclaw-operator",
    name: "OpenClaw Operator",
  });

  const { stdout, stderr } = await execFileAsync(
    "pnpm",
    ["exec", "convex", "run", "agent_credentials:listCredentials", "--identity", identity, "{}"],
    {
      cwd: KANBAN_APP_DIR,
      timeout: 20_000,
      env: process.env,
      maxBuffer: 512 * 1024,
    },
  );

  const rows = parseCliJsonValue<Array<{ agentId?: string }>>(stdout, stderr, []);
  return new Set(rows.map((row) => row.agentId).filter((value): value is string => typeof value === "string" && value.trim().length > 0));
}

function buildKanbanReadiness({
  sandboxed,
  workspace,
  sandboxEnv,
  hasDedicatedCredential,
  canVerifyDedicatedCredential,
}: {
  sandboxed: boolean;
  workspace: string;
  sandboxEnv: Record<string, unknown> | undefined | null;
  hasDedicatedCredential: boolean;
  canVerifyDedicatedCredential: boolean;
}) {
  if (!sandboxed) {
    return {
      applicable: false,
      ready: false,
      missing: [] as string[],
    };
  }

  const missing: string[] = [];

  if (!hasRealCopiedSkill(workspace, "kanban")) missing.push("skill:kanban");
  if (!hasRealCopiedSkill(workspace, "superclaw")) missing.push("skill:superclaw");

  const baseUrl = typeof sandboxEnv?.KANBAN_BASE_URL === "string" ? sandboxEnv.KANBAN_BASE_URL.trim() : "";
  const token = typeof sandboxEnv?.KANBAN_AGENT_TOKEN === "string" ? sandboxEnv.KANBAN_AGENT_TOKEN.trim() : "";

  if (!baseUrl) missing.push("env:KANBAN_BASE_URL");
  if (!token) missing.push("env:KANBAN_AGENT_TOKEN");
  if (!canVerifyDedicatedCredential) missing.push("credential:status");
  else if (!hasDedicatedCredential) missing.push("credential:dedicated");

  return {
    applicable: true,
    ready: missing.length === 0,
    missing,
  };
}

async function getAgentKanbanReadiness(agentId: string) {
  const localConfig = readLocalConfig();
  const defaults = localConfig.agents?.defaults || {};
  const configuredAgents = Array.isArray(localConfig.agents?.list) ? localConfig.agents.list : [];
  const agentConfig = configuredAgents.find((entry: any) => entry.id === agentId) || {};
  const isDefault = agentId === (defaults.id || null);
  const sandboxed = agentConfig.sandbox?.mode
    ? agentConfig.sandbox.mode !== "off"
    : isDefault
      ? defaults?.sandbox?.mode && defaults.sandbox.mode !== "off"
      : false;

  if (!sandboxed) {
    return {
      kanbanReadiness: {
        applicable: false,
        ready: false,
        missing: [] as string[],
      },
    };
  }

  const workspace = agentConfig.workspace ?? defaults.workspace ?? path.join(OPENCLAW_HOME, "workspace");
  const sandboxEnv = {
    ...(defaults?.sandbox?.docker?.env || {}),
    ...(agentConfig.sandbox?.docker?.env || {}),
  };

  try {
    const dedicatedCredentialAgentIds = await listDedicatedKanbanCredentialAgentIds();
    return {
      kanbanReadiness: buildKanbanReadiness({
        sandboxed,
        workspace,
        sandboxEnv,
        hasDedicatedCredential: dedicatedCredentialAgentIds.has(agentId),
        canVerifyDedicatedCredential: true,
      }),
    };
  } catch (error) {
    return {
      kanbanReadiness: buildKanbanReadiness({
        sandboxed,
        workspace,
        sandboxEnv,
        hasDedicatedCredential: false,
        canVerifyDedicatedCredential: false,
      }),
      warnings: [`kanban dedicated credentials: ${error instanceof Error ? error.message : String(error)}`],
    };
  }
}

async function buildAgentResponse(): Promise<AgentsListResponse> {
  const warnings: string[] = [];
  const localConfig = readLocalConfig();
  const defaults = localConfig.agents?.defaults || {};
  const configuredAgents = Array.isArray(localConfig.agents?.list) ? localConfig.agents.list : [];
  const providerMap = localConfig.models?.providers || {};

  let cliAgents: any[] = [];
  let defaultId: string | null = null;

  try {
    const parsed = await runOpenClawJson<any>(["agents", "list", "--json"], [], { timeoutMs: 12_000 });
    const normalized = normalizeAgentsList(parsed);
    cliAgents = normalized.agents;
    defaultId = normalized.defaultId;
  } catch (error) {
    addWarning(warnings, "openclaw agents list", error);
  }

  const ids = new Set<string>();
  for (const row of cliAgents) {
    if (typeof row?.id === "string" && row.id) ids.add(row.id);
  }
  for (const row of configuredAgents) {
    if (typeof row?.id === "string" && row.id) ids.add(row.id);
  }

  const baseAgents = Array.from(ids)
    .sort()
    .map((id) => {
      const cliAgent = cliAgents.find((row) => row?.id === id) || {};
      const agentConfig = configuredAgents.find((entry: any) => entry.id === id) || {};
      const configuredModel = agentConfig.model || defaults.model || {};
      const primaryModel = configuredModel.primary || cliAgent.model || defaults?.model?.primary || "—";

      return {
        id,
        name: cliAgent.identityName || cliAgent.name || cliAgent.displayName || id,
        emoji: cliAgent.identityEmoji || cliAgent.emoji || "🤖",
        avatarUrl: cliAgent.avatarUrl || null,
        model: primaryModel,
        modelFull: aliasToFullModel(primaryModel, providerMap),
        fallbacks: detectFallbacks(configuredModel, defaults?.model),
        hasOwnModel: !!agentConfig.model,
        workspace: agentConfig.workspace ?? cliAgent.workspace ?? defaults.workspace ?? "—",
        sandboxed: !!agentConfig.sandbox?.mode && agentConfig.sandbox.mode !== "off",
        workspaceAccess: agentConfig.sandbox?.workspaceAccess ?? null,
        isDefault: id === (defaultId || defaults.id || null),
      };
    });

  const availableModels = inferAvailableModels(providerMap);
  const configModels = localConfig.agents?.defaults?.models || {};
  const models = Object.keys(configModels).map((key) => {
    const provider = key.split("/")[0];
    return {
      id: key,
      name: key.split("/").pop() || key,
      provider,
    };
  });
  const defaultModel = localConfig.agents?.defaults?.model ?? {};

  const agents: DashboardAgent[] = baseAgents.map((agent) => {
    const agentConfig = configuredAgents.find((entry: any) => entry.id === agent.id) || {};
    const identityFile = getAgentIdentityFile(agent.id);
    const heartbeatFile = getAgentHeartbeatFile(agent.id);
    const identity = parseIdentityFromMarkdown(identityFile?.content);
    const hasAvatar = !!(identityFile?.content && parseAvatarFromIdentity(identityFile.content));
    const hasHeartbeatContent = hasMeaningfulMarkdownContent(heartbeatFile?.content);
    const modelObj = typeof agentConfig.model === "string" ? { primary: agentConfig.model } : agentConfig.model ?? {};
    const agentModel = modelObj.primary ?? defaultModel.primary ?? agent.modelFull;
    const agentFallbacks = modelObj.fallbacks ?? defaultModel.fallbacks ?? [];
    const isDefault = agent.id === (defaultId || defaults.id || null);
    const sandboxed = !!agentConfig.sandbox?.mode && agentConfig.sandbox.mode !== "off";
    const workspace = agentConfig.workspace ?? agent.workspace ?? defaults.workspace ?? "—";

    return {
      id: agent.id,
      name: identity.name || agent.name || agent.id,
      emoji: identity.emoji || agent.emoji || "🤖",
      avatarUrl: hasAvatar ? `/api/agents/${agent.id}/avatar` : null,
      avatar: identity.avatar || null,
      model: String(agentModel).split("/").pop() || "—",
      modelFull: agentModel,
      fallbacks: agentFallbacks,
      hasOwnModel: !!agentConfig.model,
      workspace,
      isDefault,
      sandboxed,
      workspaceAccess: agentConfig.sandbox?.workspaceAccess ?? null,
      channels: [],
      skills: [],
      models: models.length > 0 ? models : availableModels,
      heartbeat: {
        active: hasHeartbeatContent,
      },
      kanbanReadiness: { applicable: sandboxed, ready: false, missing: [] },
      files: listAgentWorkspaceFiles(agent.id),
      crons: [],
    };
  });

  return {
    version: getInstalledOpenClawVersion() ?? "—",
    defaultAgent: defaultId || defaults.id || null,
    defaultModel: {
      primary: defaultModel.primary ?? null,
      fallbacks: defaultModel.fallbacks ?? [],
    },
    agents,
    warnings,
  };
}

export async function getAgentsSummary() {
  return buildAgentResponse();
}

export async function handleAgentsList() {
  const response = await buildAgentResponse();
  return json(response);
}

export async function handleAgentKanbanReadiness(agentIdRaw: string) {
  const agentId = optionalAgentId(agentIdRaw);
  if (!agentId) throw new ApiError("invalid agent id", 400);

  return json(await getAgentKanbanReadiness(agentId));
}

export async function handleCreateAgent(req: NextRequest) {
  const body = await parseBody(req);

  const id = requiredAgentId(body.id);
  const name = optionalString(body.name, 120);
  const emoji = optionalString(body.emoji, 16);
  const telegramToken = optionalString(body.telegramToken, 256);
  const description = optionalString(body.description, 1200);

  const workspace = path.join(OPENCLAW_HOME, `workspace-${id}`);

  await runOpenClaw(["agents", "add", id, "--non-interactive", "--workspace", workspace], {
    timeoutMs: AGENT_CREATE_TIMEOUT_MS,
  });

  if (name || emoji) {
    const args = ["agents", "set-identity", "--agent", id, "--workspace", workspace];
    if (name) args.push("--name", name);
    if (emoji) args.push("--emoji", emoji);
    await runOpenClaw(args, { timeoutMs: AGENT_CREATE_TIMEOUT_MS });
  }

  const warnings: string[] = [];
  let avatarRelativePath: string | null = null;

  if (description) {
    try {
      const avatarDir = path.join(workspace, "avatars");
      mkdirSync(avatarDir, { recursive: true });

      const avatarPath = path.join(avatarDir, `${id}-avatar.webp`);
      const basePrompt =
        "Digital illustration close-up portrait in a vibrant cel-shaded style with vivid saturated colors, sharp detailed background, clean lines. Borderless seamless artwork, no panel borders, no frames. Square 1:1 composition, character from chest up filling the frame. Keep the subject clearly separated from the background with strong contrast in value and hue so clothes, hair, and silhouette never blend into the scene. Prefer grounded, natural color palettes and avoid purple-heavy, magenta-heavy, or neon AI-art color schemes unless explicitly requested. Character:";
      const fullPrompt = `${basePrompt} ${description}`;
      const apiKey = process.env.GEMINI_API_KEY || process.env.GOOGLE_API_KEY || "";
      if (!apiKey) {
        throw new Error("Missing GEMINI_API_KEY");
      }

      await withTimeout(
        generateAvatarImage({
          apiKey,
          prompt: fullPrompt,
          outputPath: avatarPath,
        }),
        AVATAR_GENERATION_TIMEOUT_MS,
        "Avatar generation",
      );

      avatarRelativePath = `avatars/${id}-avatar.webp`;
    } catch (error) {
      addWarning(warnings, "Avatar generation skipped", error);
    }
  }

  const identityContent = [
    "# IDENTITY.md - Who Am I?",
    "",
    `- **Name:** ${name || id}`,
    `- **Emoji:** ${emoji || "🤖"}`,
    ...(avatarRelativePath ? [`- **Avatar:** ${avatarRelativePath}`] : []),
    "",
  ].join("\n");
  writeFileSync(path.join(workspace, "IDENTITY.md"), identityContent, "utf8");

  if (telegramToken) {
    try {
      const config = await getConfigDocument();
      const raw = parseConfigRaw(config.raw, {} as any);
      raw.channels ??= {};
      raw.channels.telegram ??= {};
      raw.channels.telegram.enabled = true;
      raw.channels.telegram.accounts ??= {};
      raw.channels.telegram.accounts[id] = {
        ...(raw.channels.telegram.accounts[id] && typeof raw.channels.telegram.accounts[id] === "object"
          ? raw.channels.telegram.accounts[id]
          : {}),
        enabled: true,
        botToken: telegramToken,
      };
      delete raw.channels.telegram.accounts[id].tokenFile;

      if (!raw.bindings) raw.bindings = [];
      const hasBinding = raw.bindings.some(
        (binding: any) =>
          binding?.agentId === id && binding?.match?.channel === "telegram" && binding?.match?.accountId === id,
      );
      if (!hasBinding) {
        raw.bindings.push({ agentId: id, match: { channel: "telegram", accountId: id } });
      }

      await applyConfig(JSON.stringify(raw, null, 2), config.hash);
    } catch (error) {
      addWarning(warnings, "Telegram channel setup skipped", error);
    }
  }

  return json({ ok: true, id, workspace, ...(warnings.length ? { warnings } : {}) });
}

export async function handleDeleteAgent(req: NextRequest, agentIdRaw: string) {
  const agentId = optionalAgentId(agentIdRaw);
  if (!agentId) throw new ApiError("invalid agent id", 400);
  if (agentId === "main") return json({ error: "cannot delete default agent" }, 400);

  const deleteWorkspace = req.nextUrl.searchParams.get("deleteWorkspace") === "true";

  const config = await getConfigDocument();
  const raw = parseConfigRaw(config.raw, {} as any);
  const index = (raw.agents?.list || []).findIndex((agent: any) => agent.id === agentId);
  if (index === -1) return json({ error: "agent not found" }, 404);

  const workspace = raw.agents.list[index].workspace;
  raw.agents.list.splice(index, 1);
  await applyConfig(JSON.stringify(raw, null, 2), config.hash);

  try {
    await runOpenClaw(["channels", "remove", "--channel", "telegram", "--account", agentId, "--delete"], {
      timeoutMs: 10_000,
    });
  } catch {
    // Telegram account might not exist for this agent.
  }

  try {
    await new Promise((resolve) => setTimeout(resolve, 2_000));
    const updatedConfig = await getConfigDocument();
    const updatedRaw = parseConfigRaw(updatedConfig.raw, {} as any);
    if (Array.isArray(updatedRaw.bindings)) {
      updatedRaw.bindings = updatedRaw.bindings.filter((binding: any) => binding.agentId !== agentId);
      if (updatedRaw.bindings.length === 0) delete updatedRaw.bindings;
      await applyConfig(JSON.stringify(updatedRaw, null, 2), updatedConfig.hash);
    }
  } catch {
    // Non-fatal cleanup path.
  }

  try {
    const crons = await listCrons();
    const agentCrons = crons.filter((job: any) => job.agentId === agentId);
    for (const job of agentCrons) {
      await runOpenClaw(["cron", "rm", job.id], { timeoutMs: 15_000 }).catch(() => {});
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

  const body = await parseBody(req);
  const newModel = requiredString(body.model, "model", 256);

  const config = await getConfigDocument();
  const raw = parseConfigRaw(config.raw, {} as any);
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

  await applyConfig(JSON.stringify(raw, null, 2), config.hash);
  return json({ ok: true, model: newModel });
}

export async function handleAgentHeartbeatModel(req: NextRequest, agentIdRaw: string) {
  const agentId = optionalAgentId(agentIdRaw);
  if (!agentId) throw new ApiError("invalid agent id", 400);

  const body = await parseBody(req);
  const model = optionalString(body.model, 256);

  const config = await getConfigDocument();
  const raw = parseConfigRaw(config.raw, {} as any);
  const agent = raw.agents?.list?.find((entry: any) => entry.id === agentId);
  if (!agent) return json({ error: "agent not found" }, 404);

  if (!agent.heartbeat) agent.heartbeat = {};
  if (model) {
    agent.heartbeat.model = model;
  } else {
    delete agent.heartbeat.model;
    if (Object.keys(agent.heartbeat).length === 0) delete agent.heartbeat;
  }

  await applyConfig(JSON.stringify(raw, null, 2), config.hash);
  return json({ ok: true });
}

export async function handleAgentSandbox(req: NextRequest, agentIdRaw: string) {
  const agentId = optionalAgentId(agentIdRaw);
  if (!agentId) throw new ApiError("invalid agent id", 400);

  const body = await parseBody(req);
  const sandboxed = body.sandboxed === true;
  const workspaceAccess =
    body.workspaceAccess === "none" || body.workspaceAccess === "ro" || body.workspaceAccess === "rw"
      ? body.workspaceAccess
      : "rw";

  const config = await getConfigDocument();
  const raw = parseConfigRaw(config.raw, {} as any);
  const agent = raw.agents?.list?.find((entry: any) => entry.id === agentId);
  if (!agent) return json({ error: "agent not found" }, 404);

  const sandbox = ensureAgentSandbox(agent);

  if (sandboxed) {
    sandbox.mode = "all";
    sandbox.scope = sandbox.scope || "agent";
    sandbox.workspaceAccess = workspaceAccess;
  } else {
    sandbox.mode = "off";
    sandbox.scope = sandbox.scope || "agent";
    if (sandbox.workspaceAccess !== workspaceAccess) {
      sandbox.workspaceAccess = workspaceAccess;
    }
  }

  await applyConfig(JSON.stringify(raw, null, 2), config.hash);
  return json({ ok: true, sandboxed, workspaceAccess: sandboxed ? workspaceAccess : null });
}
