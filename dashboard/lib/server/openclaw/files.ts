/* eslint-disable @typescript-eslint/no-explicit-any */
import { mkdirSync, readdirSync, readFileSync, statSync, writeFileSync } from "fs";
import path from "path";

import { ApiError } from "@/lib/server/errors";
import { resolveExistingFileWithin, resolvePathWithin } from "@/lib/server/path-safety";
import { optionalAgentId, requiredString } from "@/lib/server/validate";
import { readLocalConfig } from "@/lib/server/openclaw/config";
import { json, parseBody } from "@/lib/server/openclaw/http";

function parseInlineIdentityField(content: string, field: "Name" | "Emoji" | "Avatar") {
  const line = content
    .split(/\r?\n/)
    .find((entry) => new RegExp(`\\*\\*${field}:\\*\\*`, "i").test(entry));
  if (!line) return null;

  const match = line.match(new RegExp(`\\*\\*${field}:\\*\\*([^\\n]*)`, "i"));
  const value = match?.[1]?.trim() || "";
  return value.length > 0 ? value : null;
}

export function parseAvatarFromIdentity(content: string | null | undefined) {
  if (!content) return null;
  return parseInlineIdentityField(content, "Avatar");
}

export function parseIdentityFromMarkdown(content: string | null | undefined) {
  if (!content) return {};

  const name = parseInlineIdentityField(content, "Name");
  const emoji = parseInlineIdentityField(content, "Emoji");
  const avatar = parseInlineIdentityField(content, "Avatar");

  return { name, emoji, avatar };
}

export function hasMeaningfulMarkdownContent(content: string | null | undefined) {
  if (content === undefined || content === null) return false;
  if (typeof content !== "string") return false;

  const lines = content.split("\n");
  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed) continue;
    if (/^#+(\s|$)/.test(trimmed)) continue;
    if (/^[-*+]\s*(\[[\sXx]?\]\s*)?$/.test(trimmed)) continue;
    if (/^```[A-Za-z0-9_-]*$/.test(trimmed)) continue;
    return true;
  }

  return false;
}

function getAgentWorkspace(agentId: string) {
  const config = readLocalConfig();
  const agent = Array.isArray(config.agents?.list) ? config.agents.list.find((entry: any) => entry.id === agentId) : null;
  return agent?.workspace || config.agents?.defaults?.workspace || "";
}

function readWorkspaceFile(workspace: string, relativePath: string) {
  const absPath = resolveExistingFileWithin(workspace, relativePath);
  if (!absPath) return null;

  try {
    return {
      path: absPath,
      content: readFileSync(absPath, "utf8"),
      stat: statSync(absPath),
    };
  } catch {
    return null;
  }
}

export function listAgentWorkspaceFiles(agentId: string) {
  const workspace = getAgentWorkspace(agentId);
  if (!workspace) return [];

  try {
    return readdirSync(workspace, { withFileTypes: true })
      .filter((entry) => entry.isFile())
      .map((entry) => {
        const absPath = path.join(workspace, entry.name);
        const stat = statSync(absPath);
        return {
          name: entry.name,
          path: absPath,
          missing: false,
          size: stat.size,
          updatedAtMs: stat.mtimeMs,
        };
      })
      .sort((a, b) => a.name.localeCompare(b.name));
  } catch {
    return [];
  }
}

export function getAgentIdentityFile(agentId: string) {
  const workspace = getAgentWorkspace(agentId);
  if (!workspace) return null;
  return readWorkspaceFile(workspace, "IDENTITY.md");
}

export function getAgentHeartbeatFile(agentId: string) {
  const workspace = getAgentWorkspace(agentId);
  if (!workspace) return null;
  return readWorkspaceFile(workspace, "HEARTBEAT.md");
}

export async function handleAvatar(agentIdRaw: string) {
  const agentId = optionalAgentId(agentIdRaw);
  if (!agentId) throw new ApiError("invalid agent id", 400);

  const workspace = getAgentWorkspace(agentId);
  const identityFile = getAgentIdentityFile(agentId);
  const avatarRelPath = parseAvatarFromIdentity(identityFile?.content);
  if (!avatarRelPath) return json({ error: "no avatar" }, 404);

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

  const workspace = getAgentWorkspace(agentId);
  const file = readWorkspaceFile(workspace, name);
  if (!file) return json({ error: "file not found" }, 404);

  return json({
    file: {
      name,
      path: file.path,
      content: file.content,
      size: file.stat.size,
      updatedAtMs: file.stat.mtimeMs,
    },
  });
}

export async function handleAgentFilePut(req: Request, agentIdRaw: string, fileNameRaw: string) {
  const agentId = optionalAgentId(agentIdRaw);
  const name = requiredString(fileNameRaw, "name", 255);
  if (!agentId) throw new ApiError("invalid agent id", 400);
  const body = await parseBody(req as any);
  const content = typeof body.content === "string" ? body.content : "";

  const workspace = getAgentWorkspace(agentId);
  if (!workspace) throw new ApiError("agent workspace not configured", 404);

  const absPath = resolvePathWithin(workspace, name);
  if (!absPath) throw new ApiError("invalid file path", 400);

  mkdirSync(path.dirname(absPath), { recursive: true });
  writeFileSync(absPath, content, "utf8");

  return json({ ok: true });
}

export async function handleAgentFilesList(agentIdRaw: string) {
  const agentId = optionalAgentId(agentIdRaw);
  if (!agentId) throw new ApiError("invalid agent id", 400);

  return json({ files: listAgentWorkspaceFiles(agentId) });
}
