/* eslint-disable @typescript-eslint/no-explicit-any */
import { runOpenClaw } from "@/lib/server/openclaw/cli";

export type SkillOption = {
  name: string;
  emoji?: string;
  eligible?: boolean;
};

type SkillsListResponse = {
  skills?: Array<{
    name?: string;
    emoji?: string;
    eligible?: boolean;
  }>;
};

const SKILL_OPTIONS_TTL_MS = 60_000;

let skillOptionsCache:
  | {
      expiresAt: number;
      value: SkillOption[];
    }
  | null = null;

function parseCliJson<T>(stdout: string, stderr: string, fallback: T): T {
  const candidates = [stdout, stderr]
    .map((text) => text.trim())
    .filter(Boolean)
    .map((text) => {
      const objectStart = text.indexOf("{");
      if (objectStart >= 0) return text.slice(objectStart);

      const arrayStart = text.indexOf("[");
      return arrayStart >= 0 ? text.slice(arrayStart) : text;
    });

  for (const candidate of candidates) {
    try {
      return JSON.parse(candidate) as T;
    } catch {
      // Try next candidate.
    }
  }

  return fallback;
}

export async function fetchSkillOptions(): Promise<SkillOption[]> {
  const now = Date.now();
  if (skillOptionsCache && skillOptionsCache.expiresAt > now) {
    return skillOptionsCache.value;
  }

  let data: SkillsListResponse = { skills: [] };
  let stdout = "";
  let stderr = "";
  try {
    const result = await runOpenClaw(["skills", "list", "--json"], { timeoutMs: 30_000 });
    stdout = result.stdout;
    stderr = result.stderr;
    data = parseCliJson<SkillsListResponse>(stdout, stderr, { skills: [] });
  } catch (error) {
    throw new Error(`openclaw skills list failed: ${error instanceof Error ? error.message : String(error)}`);
  }

  if (!Array.isArray(data.skills) && (stdout.trim() || stderr.trim())) {
    throw new Error("openclaw skills list returned an unexpected payload");
  }

  const value = (data.skills ?? [])
    .filter((skill: any): skill is { name: string; emoji?: string; eligible?: boolean } =>
      typeof skill?.name === "string" && skill.name.trim().length > 0,
    )
    .map((skill: { name: string; emoji?: string; eligible?: boolean }) => ({
      name: skill.name,
      emoji: skill.emoji,
      eligible: skill.eligible,
    }))
    .sort((a: SkillOption, b: SkillOption) => a.name.localeCompare(b.name));

  skillOptionsCache = {
    expiresAt: now + SKILL_OPTIONS_TTL_MS,
    value,
  };

  return value;
}
