/* eslint-disable @typescript-eslint/no-explicit-any */
import { ApiError } from "@/lib/server/errors";
import { optionalAgentId } from "@/lib/server/validate";
import { json } from "@/lib/server/openclaw/http";
import { runtimeGatewayRequest } from "@/lib/server/openclaw/runtime-gateway";

export async function handleSkills() {
  try {
    const data = (await runtimeGatewayRequest<any>("skills.status", {}, 5_000)) || {};
    return json({ skills: data.skills || [] });
  } catch (error) {
    return json({
      skills: [],
      warnings: [`skills.status: ${error instanceof Error ? error.message : String(error)}`],
    });
  }
}

export async function handleAgentSkills(agentIdRaw: string) {
  const agentId = optionalAgentId(agentIdRaw);
  if (!agentId) throw new ApiError("invalid agent id", 400);

  try {
    const data = (await runtimeGatewayRequest<any>("skills.status", { agentId }, 5_000)) || {};
    return json({ skills: data.skills || [] });
  } catch (error) {
    try {
      const fallback = (await runtimeGatewayRequest<any>("skills.status", {}, 5_000)) || {};
      return json({
        skills: fallback.skills || [],
        warnings: [`skills.status(${agentId}): ${error instanceof Error ? error.message : String(error)}`],
      });
    } catch (fallbackError) {
      return json({
        skills: [],
        warnings: [
          `skills.status(${agentId}): ${error instanceof Error ? error.message : String(error)}`,
          `skills.status: ${fallbackError instanceof Error ? fallbackError.message : String(fallbackError)}`,
        ],
      });
    }
  }
}
