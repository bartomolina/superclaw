/* eslint-disable @typescript-eslint/no-explicit-any */
import { mkdirSync, rmSync, writeFileSync } from "fs";
import path from "path";

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
import { AgentsListResponse, DashboardAgent, SandboxKanbanConfig } from "@/lib/server/openclaw/types";

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

function addWarning(warnings: string[], label: string, error: unknown) {
  warnings.push(`${label}: ${error instanceof Error ? error.message : String(error)}`);
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

  writeFileSync(outputPath, Buffer.from(image, "base64"));
}

function getSandboxKanbanConfig(agentConfig: any): SandboxKanbanConfig {
  const env = agentConfig?.sandbox?.docker?.env;
  const baseUrl = typeof env?.KANBAN_BASE_URL === "string" && env.KANBAN_BASE_URL.trim() ? env.KANBAN_BASE_URL.trim() : null;
  const hasAgentToken =
    typeof env?.KANBAN_AGENT_TOKEN === "string" ? env.KANBAN_AGENT_TOKEN.trim().length > 0 : env?.KANBAN_AGENT_TOKEN != null;

  return {
    configured: baseUrl !== null || hasAgentToken,
    active: !!agentConfig?.sandbox?.mode && agentConfig.sandbox.mode !== "off" && (baseUrl !== null || hasAgentToken),
    baseUrl,
    hasAgentToken,
  };
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

function cleanupSandboxDockerEnv(sandbox: any) {
  if (!sandbox?.docker || typeof sandbox.docker !== "object") return;
  if (sandbox.docker.env && typeof sandbox.docker.env === "object" && Object.keys(sandbox.docker.env).length === 0) {
    delete sandbox.docker.env;
  }
  if (Object.keys(sandbox.docker).length === 0) {
    delete sandbox.docker;
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
        toolsProfile: agentConfig.tools?.profile ?? defaults.tools?.profile ?? null,
        sandboxed: !!agentConfig.sandbox?.mode && agentConfig.sandbox.mode !== "off",
        workspaceAccess: agentConfig.sandbox?.workspaceAccess ?? null,
        sandboxKanban: getSandboxKanbanConfig(agentConfig),
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
      workspace: agentConfig.workspace ?? agent.workspace ?? defaults.workspace ?? "—",
      isDefault,
      toolsProfile: agentConfig.tools?.profile ?? defaults.tools?.profile ?? null,
      sandboxed: !!agentConfig.sandbox?.mode && agentConfig.sandbox.mode !== "off",
      workspaceAccess: agentConfig.sandbox?.workspaceAccess ?? null,
      sandboxKanban: getSandboxKanbanConfig(agentConfig),
      channels: [],
      skills: [],
      models: models.length > 0 ? models : availableModels,
      toolGroups: [],
      heartbeat: {
        every: agentConfig.heartbeat?.every ?? defaults.heartbeat?.every ?? null,
        model: agentConfig.heartbeat?.model ?? defaults.heartbeat?.model ?? null,
        active: hasHeartbeatContent,
      },
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

export async function handleCreateAgent(req: NextRequest) {
  const body = await parseBody(req);

  const id = requiredAgentId(body.id);
  const name = optionalString(body.name, 120);
  const emoji = optionalString(body.emoji, 16);
  const telegramToken = optionalString(body.telegramToken, 256);
  const description = optionalString(body.description, 1200);

  const workspace = path.join(OPENCLAW_HOME, `workspace-${id}`);

  await runOpenClaw(["agents", "add", id, "--non-interactive", "--workspace", workspace], { timeoutMs: 15_000 });

  if (name || emoji) {
    const args = ["agents", "set-identity", "--agent", id];
    if (name) args.push("--name", name);
    if (emoji) args.push("--emoji", emoji);
    await runOpenClaw(args, { timeoutMs: 10_000 });
  }

  let avatarRelativePath: string | null = null;

  if (description) {
    try {
      const avatarDir = path.join(workspace, "avatars");
      mkdirSync(avatarDir, { recursive: true });

      const avatarPath = path.join(avatarDir, `${id}-avatar.png`);
      const basePrompt =
        "Digital illustration close-up portrait in a vibrant cel-shaded style with vivid saturated colors, sharp detailed background, clean lines. Borderless seamless artwork, no panel borders, no frames. Square 1:1 composition, character from chest up filling the frame. Character:";
      const fullPrompt = `${basePrompt} ${description}`;
      const apiKey = process.env.GEMINI_API_KEY || process.env.GOOGLE_API_KEY || "";
      if (!apiKey) {
        throw new Error("Missing GEMINI_API_KEY");
      }

      await generateAvatarImage({
        apiKey,
        prompt: fullPrompt,
        outputPath: avatarPath,
      });

      avatarRelativePath = `avatars/${id}-avatar.png`;
    } catch {
      // Non-fatal; agent creation succeeded.
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
    await runOpenClaw(["channels", "add", "--channel", "telegram", "--account", id, "--token", telegramToken], {
      timeoutMs: 15_000,
    });

    await new Promise((resolve) => setTimeout(resolve, 2_000));

    const config = await getConfigDocument();
    const raw = parseConfigRaw(config.raw, {} as any);
    if (!raw.bindings) raw.bindings = [];
    raw.bindings.push({ agentId: id, match: { channel: "telegram", accountId: id } });

    await applyConfig(JSON.stringify(raw, null, 2), config.hash);
  }

  return json({ ok: true, id, workspace });
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

export async function handleAgentSandboxKanban(req: NextRequest, agentIdRaw: string) {
  const agentId = optionalAgentId(agentIdRaw);
  if (!agentId) throw new ApiError("invalid agent id", 400);

  const body = await parseBody(req);
  const clear = body.clear === true;
  const hasBaseUrl = Object.prototype.hasOwnProperty.call(body, "baseUrl");
  const hasToken = Object.prototype.hasOwnProperty.call(body, "token");
  const baseUrl = clear ? undefined : optionalString(body.baseUrl, 2_000);
  const token = clear ? undefined : optionalString(body.token, 4_000);

  if (!clear && !hasBaseUrl && !hasToken) {
    return json({ error: "baseUrl, token, or clear=true is required" }, 400);
  }

  const config = await getConfigDocument();
  const raw = parseConfigRaw(config.raw, {} as any);
  const agent = raw.agents?.list?.find((entry: any) => entry.id === agentId);
  if (!agent) return json({ error: "agent not found" }, 404);

  if (clear) {
    const sandbox = agent.sandbox;
    if (!sandbox || typeof sandbox !== "object" || !sandbox.docker || typeof sandbox.docker !== "object") {
      return json({ ok: true, sandboxed: false, sandboxKanban: getSandboxKanbanConfig(agent) });
    }

    if (!sandbox.docker.env || typeof sandbox.docker.env !== "object") {
      return json({ ok: true, sandboxed: sandbox.mode !== "off", sandboxKanban: getSandboxKanbanConfig(agent) });
    }

    delete sandbox.docker.env.KANBAN_BASE_URL;
    delete sandbox.docker.env.KANBAN_AGENT_TOKEN;
    cleanupSandboxDockerEnv(sandbox);
  } else {
    const sandbox = ensureAgentSandbox(agent);
    if (!sandbox.docker || typeof sandbox.docker !== "object") {
      sandbox.docker = {};
    }
    if (!sandbox.docker.env || typeof sandbox.docker.env !== "object") {
      sandbox.docker.env = {};
    }

    if (hasBaseUrl) {
      if (baseUrl) {
        sandbox.docker.env.KANBAN_BASE_URL = baseUrl;
      } else {
        delete sandbox.docker.env.KANBAN_BASE_URL;
      }
    }

    if (hasToken) {
      if (token) {
        sandbox.docker.env.KANBAN_AGENT_TOKEN = token;
      } else {
        delete sandbox.docker.env.KANBAN_AGENT_TOKEN;
      }
    }

    cleanupSandboxDockerEnv(sandbox);
  }

  await applyConfig(JSON.stringify(raw, null, 2), config.hash);

  const sandboxKanban = getSandboxKanbanConfig(agent);
  return json({
    ok: true,
    sandboxed: !!agent.sandbox?.mode && agent.sandbox.mode !== "off",
    sandboxKanban,
  });
}
