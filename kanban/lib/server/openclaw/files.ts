import { readFileSync } from "fs";

import { resolveExistingFileWithin } from "@/lib/server/path-safety";
import { getAgentWorkspace, readLocalConfig } from "@/lib/server/openclaw/config";

export function parseAvatarFromIdentity(content: string | null | undefined) {
  if (!content) return null;
  const match = content.match(/\*\*Avatar:\*\*\s*(.+)/i);
  return match?.[1]?.trim() || null;
}

export function parseIdentityMarkdown(content: string | null | undefined) {
  if (!content) return {};

  const name = content.match(/\*\*Name:\*\*\s*(.+)/i)?.[1]?.trim() || null;
  const emoji = content.match(/\*\*Emoji:\*\*\s*(.+)/i)?.[1]?.trim() || null;
  const avatar = parseAvatarFromIdentity(content);

  return { name, emoji, avatar };
}

export function readAgentIdentityFile(agentId: string) {
  const config = readLocalConfig();
  const workspace = getAgentWorkspace(config, agentId);
  const identityPath = resolveExistingFileWithin(workspace, "IDENTITY.md");
  if (!identityPath) return null;

  try {
    return {
      workspace,
      path: identityPath,
      content: readFileSync(identityPath, "utf8"),
    };
  } catch {
    return null;
  }
}

export function resolveAgentAvatarPath(agentId: string) {
  const identityFile = readAgentIdentityFile(agentId);
  if (!identityFile) return null;

  const avatarRelPath = parseAvatarFromIdentity(identityFile.content);
  if (!avatarRelPath) return null;

  return resolveExistingFileWithin(identityFile.workspace, avatarRelPath);
}
