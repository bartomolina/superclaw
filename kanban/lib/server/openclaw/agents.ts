/* eslint-disable @typescript-eslint/no-explicit-any */
import { readLocalConfig } from "@/lib/server/openclaw/config";
import { parseIdentityMarkdown, readAgentIdentityFile, resolveAgentAvatarPath } from "@/lib/server/openclaw/files";
import { runOpenClawJson } from "@/lib/server/openclaw/cli";

export type AgentOption = {
  id: string;
  name: string;
  emoji?: string;
  avatarUrl?: string | null;
};

const AGENT_OPTIONS_TTL_MS = 10_000;

let agentOptionsCache:
  | {
      expiresAt: number;
      value: AgentOption[];
    }
  | null = null;

function normalizeAgentsList(parsed: any): any[] {
  if (Array.isArray(parsed)) return parsed;
  if (Array.isArray(parsed?.agents)) return parsed.agents;
  if (Array.isArray(parsed?.list)) return parsed.list;
  return [];
}

export async function fetchAgentOptions(): Promise<AgentOption[]> {
  const now = Date.now();
  if (agentOptionsCache && agentOptionsCache.expiresAt > now) {
    return agentOptionsCache.value;
  }

  const config = readLocalConfig();
  const configuredAgents = Array.isArray(config.agents?.list) ? config.agents.list : [];
  let cliAgents: any[] = [];

  try {
    cliAgents = normalizeAgentsList(await runOpenClawJson<any>(["agents", "list", "--json"], [], { timeoutMs: 12_000 }));
  } catch {
    cliAgents = [];
  }

  const ids = new Set<string>();
  for (const agent of cliAgents) {
    if (typeof agent?.id === "string" && agent.id) ids.add(agent.id);
  }
  for (const agent of configuredAgents) {
    if (typeof agent?.id === "string" && agent.id) ids.add(agent.id);
  }

  if (ids.size === 0) ids.add("main");

  const value = Array.from(ids)
    .map((agentId) => {
      const cliAgent = cliAgents.find((agent: any) => agent?.id === agentId) || {};
      try {
        const identity = parseIdentityMarkdown(readAgentIdentityFile(agentId)?.content);
        const avatarPath = resolveAgentAvatarPath(agentId);

        return {
          id: agentId,
          name: identity.name || cliAgent.identityName || cliAgent.name || cliAgent.displayName || agentId,
          emoji: identity.emoji || cliAgent.identityEmoji || cliAgent.emoji || undefined,
          avatarUrl: avatarPath ? `/api/agents/${encodeURIComponent(agentId)}/avatar` : null,
        };
      } catch {
        return {
          id: agentId,
          name: cliAgent.identityName || cliAgent.name || cliAgent.displayName || agentId,
          emoji: cliAgent.identityEmoji || cliAgent.emoji || undefined,
          avatarUrl: null,
        };
      }
    })
    .sort((a, b) => a.name.localeCompare(b.name));

  agentOptionsCache = {
    expiresAt: now + AGENT_OPTIONS_TTL_MS,
    value,
  };

  return value;
}
