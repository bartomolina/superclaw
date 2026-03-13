export const WS_METHODS = [
  { method: "agents.list", params: "{}" },
  { method: "agent.identity.get", params: '{"agentId":"main"}' },
  { method: "agents.files.list", params: '{"agentId":"main"}' },
  { method: "agents.files.get", params: '{"agentId":"main","path":"SOUL.md"}' },
  { method: "channels.status", params: "{}" },
  { method: "config.get", params: "{}" },
  { method: "config.schema", params: "{}" },
  { method: "cron.list", params: "{}" },
  { method: "cron.status", params: "{}" },
  { method: "cron.runs", params: "{}" },
  { method: "logs.tail", params: "{}" },
  { method: "models.list", params: "{}" },
  { method: "node.list", params: "{}" },
  { method: "node.describe", params: "{}" },
  { method: "node.pair.list", params: "{}" },
  { method: "sessions.list", params: "{}" },
  { method: "sessions.preview", params: "{}" },
  { method: "sessions.usage", params: "{}" },
  { method: "sessions.usage.timeseries", params: "{}" },
  { method: "sessions.usage.logs", params: "{}" },
  { method: "skills.status", params: "{}" },
  { method: "system-presence", params: "{}" },
  { method: "tools.catalog", params: "{}" },
  { method: "config.apply", params: '{"raw":"","baseHash":""}' },
  { method: "config.patch", params: "{}" },
  { method: "agents.create", params: "{}" },
  { method: "agents.update", params: "{}" },
  { method: "agents.delete", params: "{}" },
  { method: "cron.add", params: "{}" },
  { method: "cron.update", params: "{}" },
  { method: "cron.remove", params: "{}" },
  { method: "cron.run", params: "{}" },
  { method: "sessions.patch", params: "{}" },
  { method: "sessions.reset", params: "{}" },
  { method: "sessions.delete", params: "{}" },
  { method: "sessions.compact", params: "{}" },
];

export function fmt(bytes: number): string {
  if (bytes >= 1e9) return `${(bytes / 1e9).toFixed(1)} GB`;
  if (bytes >= 1e6) return `${(bytes / 1e6).toFixed(0)} MB`;
  return `${(bytes / 1e3).toFixed(0)} KB`;
}

export function fmtUptime(s: number): string {
  const d = Math.floor(s / 86400);
  const h = Math.floor((s % 86400) / 3600);
  const m = Math.floor((s % 3600) / 60);
  return [d && `${d}d`, h && `${h}h`, `${m}m`].filter(Boolean).join(" ");
}
