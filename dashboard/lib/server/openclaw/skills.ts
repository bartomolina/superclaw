/* eslint-disable @typescript-eslint/no-explicit-any */
import { ApiError } from "@/lib/server/errors";
import { optionalAgentId } from "@/lib/server/validate";
import { gatewayCall, runOpenClaw } from "@/lib/server/openclaw/cli";
import { json } from "@/lib/server/openclaw/http";

type SkillRecord = {
  name: string;
  emoji?: string;
  description?: string;
  eligible?: boolean;
  disabled?: boolean;
  blockedByAllowlist?: boolean;
  source?: string;
  bundled?: boolean;
  homepage?: string;
  missing?: {
    bins?: string[];
    anyBins?: string[];
    env?: string[];
    config?: string[];
    os?: string[];
  };
};

type SkillsListResponse = {
  skills?: SkillRecord[];
};

type SkillsStatusResponse = {
  skills?: SkillRecord[];
};

type AgentListRecord = {
  id?: string;
};

function normalizeSkill(skill: SkillRecord) {
  return {
    name: skill.name,
    emoji: skill.emoji || "📦",
    description: skill.description || "",
    eligible: skill.eligible ?? false,
    disabled: skill.disabled ?? false,
    blockedByAllowlist: skill.blockedByAllowlist ?? false,
    source: skill.source || "",
    bundled: skill.bundled ?? false,
    homepage: skill.homepage || null,
    missing: {
      bins: skill.missing?.bins || [],
      anyBins: skill.missing?.anyBins || [],
      env: skill.missing?.env || [],
      config: skill.missing?.config || [],
      os: skill.missing?.os || [],
    },
  };
}

function parseCliJson<T>(stdout: string, stderr: string, fallback: T): T {
  const candidates = [stdout, stderr]
    .map((text) => text.trim())
    .filter(Boolean)
    .flatMap((text) => {
      const candidatesForText = [text];
      const objectStart = text.indexOf("{");
      const arrayStart = text.indexOf("[");
      const jsonStart = [objectStart, arrayStart].filter((value) => value >= 0).sort((a, b) => a - b)[0];
      if (typeof jsonStart === "number") {
        candidatesForText.push(text.slice(jsonStart));
      }
      return candidatesForText;
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

function mergeSkills(skills: SkillRecord[]) {
  const merged = new Map<string, SkillRecord>();

  for (const skill of skills) {
    const key = `${skill.name}::${skill.source || ""}`;
    const current = merged.get(key);

    if (!current) {
      merged.set(key, {
        ...skill,
        missing: {
          bins: [...(skill.missing?.bins || [])],
          anyBins: [...(skill.missing?.anyBins || [])],
          env: [...(skill.missing?.env || [])],
          config: [...(skill.missing?.config || [])],
          os: [...(skill.missing?.os || [])],
        },
      });
      continue;
    }

    current.emoji ||= skill.emoji;
    current.description ||= skill.description;
    current.eligible = (current.eligible ?? false) || (skill.eligible ?? false);
    current.disabled = (current.disabled ?? false) || (skill.disabled ?? false);
    current.blockedByAllowlist = (current.blockedByAllowlist ?? false) || (skill.blockedByAllowlist ?? false);
    current.bundled = (current.bundled ?? false) || (skill.bundled ?? false);
    current.homepage ||= skill.homepage;
    current.missing = {
      bins: Array.from(new Set([...(current.missing?.bins || []), ...(skill.missing?.bins || [])])),
      anyBins: Array.from(new Set([...(current.missing?.anyBins || []), ...(skill.missing?.anyBins || [])])),
      env: Array.from(new Set([...(current.missing?.env || []), ...(skill.missing?.env || [])])),
      config: Array.from(new Set([...(current.missing?.config || []), ...(skill.missing?.config || [])])),
      os: Array.from(new Set([...(current.missing?.os || []), ...(skill.missing?.os || [])])),
    };
  }

  return Array.from(merged.values());
}

export async function handleSkills() {
  const warnings: string[] = [];
  const combinedSkills: SkillRecord[] = [];

  try {
    const { stdout, stderr } = await runOpenClaw(["skills", "list", "--json"], { timeoutMs: 15_000 });
    const data = parseCliJson<SkillsListResponse>(stdout, stderr, { skills: [] });
    combinedSkills.push(...(data.skills || []));
  } catch (error) {
    warnings.push(`openclaw skills list --json: ${error instanceof Error ? error.message : String(error)}`);
  }

  try {
    const { stdout, stderr } = await runOpenClaw(["agents", "list", "--json"], { timeoutMs: 15_000 });
    const agents = parseCliJson<AgentListRecord[]>(stdout, stderr, []).filter((agent) => typeof agent.id === "string" && agent.id.trim());

    const skillResults = await Promise.all(
      agents.map(async (agent) => {
        const agentId = agent.id!.trim();
        try {
          const data = (await gatewayCall<SkillsStatusResponse>("skills.status", { agentId })) || {};
          return (data.skills || []).filter((skill) => skill.eligible);
        } catch (error) {
          warnings.push(`skills.status(${agentId}): ${error instanceof Error ? error.message : String(error)}`);
          return [] as SkillRecord[];
        }
      }),
    );

    for (const skills of skillResults) {
      combinedSkills.push(...skills);
    }
  } catch (error) {
    warnings.push(`openclaw agents list --json: ${error instanceof Error ? error.message : String(error)}`);
  }

  return json({
    skills: mergeSkills(combinedSkills).map(normalizeSkill),
    ...(warnings.length > 0 ? { warnings } : {}),
  });
}

export async function handleAgentSkills(agentIdRaw: string) {
  const agentId = optionalAgentId(agentIdRaw);
  if (!agentId) throw new ApiError("invalid agent id", 400);

  try {
    const data = (await gatewayCall<SkillsStatusResponse>("skills.status", { agentId })) || {};
    const effectiveSkills = (data.skills || []).filter((skill) => skill.eligible);
    return json({ skills: effectiveSkills.map(normalizeSkill) });
  } catch (error) {
    return json({
      skills: [],
      warnings: [`skills.status(${agentId}): ${error instanceof Error ? error.message : String(error)}`],
    });
  }
}
