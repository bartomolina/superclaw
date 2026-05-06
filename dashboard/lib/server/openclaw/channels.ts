/* eslint-disable @typescript-eslint/no-explicit-any */
import { readFileSync } from "fs";
import path from "path";

import { ApiError } from "@/lib/server/errors";
import { optionalAgentId } from "@/lib/server/validate";
import { readLocalConfig } from "@/lib/server/openclaw/config";
import { OPENCLAW_HOME } from "@/lib/server/openclaw/constants";
import { json } from "@/lib/server/openclaw/http";
import { runOpenClawJson } from "@/lib/server/openclaw/cli";

const CHANNELS_STATUS_TIMEOUT_MS = 60_000;

function readStoredAllowFrom(channel: string, accountId: string) {
  try {
    const suffix = accountId === "default" ? "default" : accountId;
    const content = readFileSync(path.join(OPENCLAW_HOME, "credentials", `${channel}-${suffix}-allowFrom.json`), "utf8");
    const data = JSON.parse(content) as { allowFrom?: string[] };
    return data.allowFrom || [];
  } catch {
    return [];
  }
}

function readConfigAllowFrom(channelId: string, accountId: string, configRaw: any) {
  const channelConfig = configRaw.channels?.[channelId] || {};
  const accountConfig = channelConfig.accounts?.[accountId] || {};
  const topLevelAllowFrom = Array.isArray(channelConfig.allowFrom) ? channelConfig.allowFrom : [];
  const accountAllowFrom = Array.isArray(accountConfig.allowFrom) ? accountConfig.allowFrom : null;

  return (accountAllowFrom ?? topLevelAllowFrom).map((value: unknown) => String(value));
}

function mergeAllowedUsers(configIds: string[], storedIds: string[]) {
  const merged = new Map<string, "config" | "stored" | "both">();

  for (const id of configIds) merged.set(id, "config");
  for (const id of storedIds) merged.set(id, merged.has(id) ? "both" : "stored");

  return [...merged.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([id, source]) => ({ id, name: id, source }));
}

export function mapChannelsByAgent(channelsData: any, configRaw: any, defaultAgentId: string | null) {
  const bindings = configRaw.bindings || [];
  const accountsByAgent: Record<string, any[]> = {};

  const channelAccounts = channelsData.channelAccounts || {};
  for (const [channelId, accounts] of Object.entries(channelAccounts)) {
    const label = channelsData.channelLabels?.[channelId] || channelId;
    const detail = channelsData.channelDetailLabels?.[channelId] || null;

    for (const account of accounts as any[]) {
      const binding = bindings.find((entry: any) => entry.match?.channel === channelId && entry.match?.accountId === account.accountId);
      const agentId = binding?.agentId || defaultAgentId || "main";
      if (!accountsByAgent[agentId]) accountsByAgent[agentId] = [];

      const configAllowFrom = readConfigAllowFrom(String(channelId), account.accountId, configRaw);
      const storedAllowFrom = readStoredAllowFrom(String(channelId), account.accountId);
      const pairedUsers = mergeAllowedUsers(configAllowFrom, storedAllowFrom);

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
        mode: account.mode || null,
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

  const channelsData = await runOpenClawJson<any>(["channels", "status", "--json"], { channelAccounts: {} }, { timeoutMs: CHANNELS_STATUS_TIMEOUT_MS }).catch((error) => {
    warnings.push(`channels.status: ${error instanceof Error ? error.message : String(error)}`);
    return { channelAccounts: {} };
  });

  const accountsByAgent = mapChannelsByAgent(channelsData, config, defaultAgentId);
  return json({ channels: accountsByAgent[agentId] || [], warnings });
}

export async function handleAgentsChannels() {
  const warnings: string[] = [];
  const config = readLocalConfig();
  const defaultAgentId = config.agents?.defaults?.id || null;

  const channelsData = await runOpenClawJson<any>(["channels", "status", "--json"], { channelAccounts: {} }, { timeoutMs: CHANNELS_STATUS_TIMEOUT_MS }).catch((error) => {
    warnings.push(`channels.status: ${error instanceof Error ? error.message : String(error)}`);
    return { channelAccounts: {} };
  });

  const channelsByAgent = mapChannelsByAgent(channelsData, config, defaultAgentId);
  return json({ channelsByAgent, warnings });
}
