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

function defaultSkillEmoji(skill: SkillRecord) {
  if (skill.emoji) return skill.emoji;

  const customSources = new Set(["openclaw-workspace", "openclaw-managed", "agents-skills-personal"]);
  if (skill.source && customSources.has(skill.source)) return "👨‍💻";

  return "📦";
}

function normalizeSkill(skill: SkillRecord) {
  return {
    name: skill.name,
    emoji: defaultSkillEmoji(skill),
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
    .map((text) => {
      const start = text.indexOf("{");
      return start >= 0 ? text.slice(start) : text;
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

export async function handleSkills() {
  try {
    const { stdout, stderr } = await runOpenClaw(["skills", "list", "--json"], { timeoutMs: 15_000 });
    const data = parseCliJson<SkillsListResponse>(stdout, stderr, { skills: [] });
    return json({ skills: (data.skills || []).map(normalizeSkill) });
  } catch (error) {
    return json({
      skills: [],
      warnings: [`openclaw skills list --json: ${error instanceof Error ? error.message : String(error)}`],
    });
  }
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
