import { request } from "@/lib/server/gateway";
import { resolveExistingFileWithin } from "@/lib/server/path-safety";

type AgentPayload = {
  id: string;
  name: string;
  emoji?: string;
  avatarUrl?: string | null;
};

type SkillPayload = {
  name: string;
  emoji?: string;
  eligible?: boolean;
};

type RawConfig = {
  agents?: {
    defaults?: {
      workspace?: string;
    };
    list?: Array<{
      id?: string;
      workspace?: string;
    }>;
  };
};

function parseAvatarFromIdentity(content: string | null | undefined) {
  if (!content) return null;
  const match = content.match(/\*\*Avatar:\*\*\s*(.+)/i);
  return match?.[1]?.trim() || null;
}

export async function fetchAgentOptions(): Promise<AgentPayload[]> {
  const [list, config] = (await Promise.all([
    request("agents.list", {}),
    request("config.get", {}),
  ])) as [{ agents?: Array<{ id?: string | null }> }, { raw?: string }];

  const agentIds = (list.agents ?? [])
    .map((agent) => agent?.id)
    .filter((id): id is string => typeof id === "string" && id.length > 0);

  let rawConfig: RawConfig = {};
  try {
    rawConfig = JSON.parse(config.raw ?? "{}") as RawConfig;
  } catch {
    rawConfig = {};
  }

  const defaultsWorkspace = String(rawConfig.agents?.defaults?.workspace ?? "");
  const configuredAgents = Array.isArray(rawConfig.agents?.list) ? rawConfig.agents.list : [];

  const identities = await Promise.all(
    agentIds.map(async (agentId) => {
      try {
        const [identity, identityFile] = (await Promise.all([
          request("agent.identity.get", { agentId }),
          request("agents.files.get", { agentId, name: "IDENTITY.md" }).catch(() => null),
        ])) as [
          {
            name?: string;
            emoji?: string;
          },
          { file?: { content?: string } } | null,
        ];

        const configuredAgent = configuredAgents.find((agent) => agent?.id === agentId);
        const workspace = String(configuredAgent?.workspace ?? defaultsWorkspace);
        const avatarRelPath = parseAvatarFromIdentity(identityFile?.file?.content);
        const avatarFile = resolveExistingFileWithin(workspace, avatarRelPath);

        return {
          id: agentId,
          name: identity.name?.trim() || agentId,
          emoji: identity.emoji,
          avatarUrl: avatarFile ? `/api/agents/${encodeURIComponent(agentId)}/avatar` : null,
        };
      } catch {
        return {
          id: agentId,
          name: agentId,
          emoji: undefined,
          avatarUrl: null,
        };
      }
    }),
  );

  return identities.sort((a, b) => a.name.localeCompare(b.name));
}

export async function fetchSkillOptions(): Promise<SkillPayload[]> {
  const status = (await request("skills.status", {})) as {
    skills?: Array<{ name?: string; emoji?: string; eligible?: boolean }>;
  };

  return (status.skills ?? [])
    .filter((skill): skill is { name: string; emoji?: string; eligible?: boolean } =>
      typeof skill?.name === "string" && skill.name.trim().length > 0,
    )
    .map((skill) => ({
      name: skill.name,
      emoji: skill.emoji,
      eligible: skill.eligible,
    }))
    .sort((a, b) => a.name.localeCompare(b.name));
}
