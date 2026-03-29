/* eslint-disable @typescript-eslint/no-explicit-any */
import { readFileSync } from "fs";
import path from "path";

import { ApiError } from "@/lib/server/errors";
import { optionalAgentId } from "@/lib/server/validate";
import { readLocalConfig } from "@/lib/server/openclaw/config";
import { OPENCLAW_HOME } from "@/lib/server/openclaw/constants";
import { json } from "@/lib/server/openclaw/http";
import { runtimeGatewayRequest } from "@/lib/server/openclaw/runtime-gateway";

function readAllowFrom(channel: string, accountId: string) {
  try {
    const suffix = accountId === "default" ? "default" : accountId;
    const content = readFileSync(path.join(OPENCLAW_HOME, "credentials", `${channel}-${suffix}-allowFrom.json`), "utf8");
    const data = JSON.parse(content) as { allowFrom?: string[] };
    return data.allowFrom || [];
  } catch {
    return [];
  }
}

export function mapChannelsByAgent(channelsData: any, sessionsData: any, configRaw: any, defaultAgentId: string | null) {
  const bindings = configRaw.bindings || [];
  const accountsByAgent: Record<string, any[]> = {};
  const sessionNamesByPeerId: Record<string, string> = {};

  for (const session of sessionsData.sessions || []) {
    if (session.origin?.provider && session.origin?.from && session.displayName) {
      const peerId = String(session.origin.from).split(":").pop();
      if (peerId && !sessionNamesByPeerId[peerId]) {
        sessionNamesByPeerId[peerId] = String(session.displayName).replace(/\s*id:\d+$/, "");
      }
    }
  }

  const channelAccounts = channelsData.channelAccounts || {};
  for (const [channelId, accounts] of Object.entries(channelAccounts)) {
    const label = channelsData.channelLabels?.[channelId] || channelId;
    const detail = channelsData.channelDetailLabels?.[channelId] || null;

    for (const account of accounts as any[]) {
      const binding = bindings.find((entry: any) => entry.match?.channel === channelId && entry.match?.accountId === account.accountId);
      const agentId = binding?.agentId || defaultAgentId || "main";
      if (!accountsByAgent[agentId]) accountsByAgent[agentId] = [];

      const allowFrom = readAllowFrom(String(channelId), account.accountId);
      const pairedUsers = allowFrom.map((id: string) => ({ id, name: sessionNamesByPeerId[id] || id }));

      const accountConfig = configRaw.channels?.[channelId]?.accounts?.[account.accountId] || {};
      const topLevelGroups = account.accountId === "default" ? configRaw.channels?.[channelId]?.groups || {} : {};
      const groupsConfig = { ...topLevelGroups, ...accountConfig.groups };
      const groups = Object.entries(groupsConfig)
        .filter(([key]) => key !== "*")
        .map(([id, cfg]: [string, any]) => ({
          id,
          requireMention: cfg.requireMention ?? true,
          groupPolicy: cfg.groupPolicy ?? "allowlist",
        }));

      const streaming = accountConfig.streaming ?? configRaw.channels?.[channelId]?.streaming ?? "partial";
      const detailLabel =
        account.accountId === "default"
          ? null
          : channelId === "telegram" && account.accountId === agentId
            ? null
            : `${detail || label} · ${account.accountId}`;

      accountsByAgent[agentId].push({
        id: `${channelId}:${account.accountId}`,
        name: label,
        detail: detailLabel,
        running: account.running ?? false,
        mode: account.mode ?? null,
        streaming: channelId === "telegram" ? streaming : null,
        pairedUsers,
        groups,
      });
    }
  }

  return accountsByAgent;
}

export async function handleAgentChannels(agentIdRaw: string) {
  const agentId = optionalAgentId(agentIdRaw);
  if (!agentId) throw new ApiError("invalid agent id", 400);

  const warnings: string[] = [];
  const config = readLocalConfig();
  const defaultAgentId = config.agents?.defaults?.id || null;

  const [channelsData, sessionsData] = await Promise.all([
    runtimeGatewayRequest<any>("channels.status", {}, 5_000).catch((error) => {
      warnings.push(`channels.status: ${error instanceof Error ? error.message : String(error)}`);
      return { channelAccounts: {} };
    }),
    runtimeGatewayRequest<any>("sessions.list", {}, 5_000).catch((error) => {
      warnings.push(`sessions.list: ${error instanceof Error ? error.message : String(error)}`);
      return { sessions: [] };
    }),
  ]);

  const accountsByAgent = mapChannelsByAgent(channelsData, sessionsData, config, defaultAgentId);
  return json({ channels: accountsByAgent[agentId] || [], warnings });
}
