export type DashboardModel = {
  id: string;
  name: string;
  provider: string;
};

export type DashboardAgent = {
  id: string;
  name: string;
  emoji: string;
  avatarUrl: string | null;
  avatar?: string | null;
  model: string;
  modelFull: string;
  fallbacks: string[];
  hasOwnModel: boolean;
  workspace: string;
  sandboxed: boolean;
  workspaceAccess: "none" | "ro" | "rw" | null;
  isDefault: boolean;
  channels: unknown[];
  skills: unknown[];
  models: DashboardModel[];
  heartbeat: {
    every: string | null;
    model: string | null;
    active: boolean;
  };
  crons: unknown[];
  files: unknown[];
};

export type AgentsListResponse = {
  version: string;
  defaultAgent: string | null;
  defaultModel: {
    primary: string | null;
    fallbacks: string[];
  };
  agents: DashboardAgent[];
  warnings?: string[];
};
