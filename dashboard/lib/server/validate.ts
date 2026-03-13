import { ApiError } from "@/lib/server/errors";

const AGENT_ID_PATTERN = /^[a-z0-9](?:[a-z0-9-]{0,63})$/;

export function requiredString(value: unknown, field: string, maxLength = 256) {
  if (typeof value !== "string") throw new ApiError(`${field} is required`, 400);
  const trimmed = value.trim();
  if (!trimmed) throw new ApiError(`${field} is required`, 400);
  if (trimmed.length > maxLength) throw new ApiError(`${field} is too long`, 400);
  return trimmed;
}

export function optionalString(value: unknown, maxLength = 1024) {
  if (value == null) return undefined;
  if (typeof value !== "string") throw new ApiError("invalid string value", 400);
  const trimmed = value.trim();
  if (!trimmed) return undefined;
  if (trimmed.length > maxLength) throw new ApiError("string value is too long", 400);
  return trimmed;
}

export function requiredAgentId(value: unknown) {
  const agentId = requiredString(value, "id", 64);
  if (!AGENT_ID_PATTERN.test(agentId)) {
    throw new ApiError("id must match [a-z0-9-] and be up to 64 chars", 400);
  }
  return agentId;
}

export function optionalAgentId(value: unknown) {
  if (value == null) return undefined;
  const trimmed = optionalString(value, 64);
  if (!trimmed) return undefined;
  if (!AGENT_ID_PATTERN.test(trimmed)) {
    throw new ApiError("invalid agent id", 400);
  }
  return trimmed;
}
