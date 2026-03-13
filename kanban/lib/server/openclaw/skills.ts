/* eslint-disable @typescript-eslint/no-explicit-any */
import { runtimeGatewayRequest } from "@/lib/server/openclaw/runtime-gateway";

export type SkillOption = {
  name: string;
  emoji?: string;
  eligible?: boolean;
};

const SKILL_OPTIONS_TTL_MS = 10_000;

let skillOptionsCache:
  | {
      expiresAt: number;
      value: SkillOption[];
    }
  | null = null;

export async function fetchSkillOptions(): Promise<SkillOption[]> {
  const now = Date.now();
  if (skillOptionsCache && skillOptionsCache.expiresAt > now) {
    return skillOptionsCache.value;
  }

  let status: any = {};
  try {
    status = (await runtimeGatewayRequest<any>("skills.status", {}, 5_000)) || {};
  } catch {
    return [];
  }

  const value = (status.skills ?? [])
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
