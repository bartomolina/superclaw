export type PairedUser = { id: string; name: string };
export type ChannelGroup = { id: string; requireMention: boolean; groupPolicy: string };
export type Channel = {
  id: string;
  name: string;
  detail: string | null;
  running: boolean;
  mode: string | null;
  streaming: string | null;
  pairedUsers: PairedUser[];
  groups: ChannelGroup[];
};
export type Skill = {
  name: string;
  emoji: string;
  description: string;
  eligible: boolean;
  disabled: boolean;
  source: string;
  missing?: { bins?: string[]; anyBins?: string[]; env?: string[]; os?: string[] };
};
export type ToolGroup = { id: string; label: string; tools: { id: string; label: string; description: string }[] };
export type AgentFile = { name: string; path: string; missing: boolean; size: number; updatedAtMs: number };
export type Model = { id: string; name: string; provider: string };
export type Cron = {
  id: string;
  name: string;
  schedule: string;
  scheduleKind: string;
  model: string | null;
  message: string | null;
  enabled: boolean;
  nextRunAtMs: number | null;
};
export type Heartbeat = { every: string | null; model: string | null; active: boolean };
export type SandboxKanbanConfig = {
  configured: boolean;
  active: boolean;
  baseUrl: string | null;
  hasAgentToken: boolean;
};
export type Agent = {
  id: string;
  name: string;
  emoji: string;
  avatarUrl: string | null;
  model: string;
  modelFull: string;
  fallbacks: string[];
  hasOwnModel: boolean;
  workspace: string;
  toolsProfile: string | null;
  sandboxed: boolean;
  workspaceAccess: "none" | "ro" | "rw" | null;
  sandboxKanban: SandboxKanbanConfig;
  isDefault: boolean;
  channels: Channel[];
  skills: Skill[];
  models: Model[];
  toolGroups: ToolGroup[];
  heartbeat: Heartbeat;
  crons: Cron[];
  files: AgentFile[];
};

export type Page = "agents" | "models" | "skills" | "debug" | "performance" | "usage" | "ops";
