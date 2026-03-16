/* eslint-disable @typescript-eslint/no-explicit-any */
"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { BarChart3, Gauge, Layers, LogOut, Moon, Puzzle, RefreshCw, Server, Sun, Terminal, Users, Wifi, WifiOff } from "lucide-react";
import { toast } from "sonner";

import { clearToken, getToken, setToken, authFetch, authHeaders } from "@/components/dashboard/auth";
import { AgentsPage } from "@/components/dashboard/agents";
import { ComingSoon } from "@/components/dashboard/common";
import { DebugPage, PerformancePage, UsagePage } from "@/components/dashboard/debug";
import { LoginScreen } from "@/components/dashboard/login-screen";
import { ModelsPage } from "@/components/dashboard/models-page";
import { SkillsPage } from "@/components/dashboard/skills-page";
import { type Agent, type Model, type Page } from "@/components/dashboard/types";
import { useTheme } from "@/components/dashboard/use-theme";

const BASE_NAV_ITEMS: { id: Page; label: string; icon: typeof Users }[] = [
  { id: "agents", label: "Agents", icon: Users },
  { id: "models", label: "Models", icon: Layers },
  { id: "skills", label: "Skills", icon: Puzzle },
  { id: "ops", label: "Ops", icon: Server },
  { id: "performance", label: "Performance", icon: Gauge },
  { id: "usage", label: "Usage", icon: BarChart3 },
  { id: "debug", label: "Debug", icon: Terminal },
];

export default function App() {
  const { dark, toggle: toggleTheme } = useTheme();
  const [authenticated, setAuthenticated] = useState(false);
  const [authReady, setAuthReady] = useState(false);
  const [page, setPageState] = useState<Page>(() => {
    if (typeof window === "undefined") return "agents";
    const hash = window.location.hash.replace("#", "") as Page;
    return BASE_NAV_ITEMS.some((n) => n.id === hash) ? hash : "agents";
  });
  const [debugRpcEnabled, setDebugRpcEnabled] = useState(false);
  const navItems = useMemo(
    () => (debugRpcEnabled ? BASE_NAV_ITEMS : BASE_NAV_ITEMS.filter((item) => item.id !== "debug")),
    [debugRpcEnabled]
  );
  const setPage = (p: Page) => {
    setPageState(p);
    if (typeof window !== "undefined") {
      window.location.hash = p;
    }
  };
  const [agents, setAgents] = useState<Agent[]>([]);
  const [version, setVersion] = useState("—");
  const [configuredModels, setConfiguredModels] = useState<Model[]>([]);
  const [defaultModel, setDefaultModel] = useState<{ primary: string | null; fallbacks: string[] }>({ primary: null, fallbacks: [] });
  const [gatewayUp, setGatewayUp] = useState(false);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [restarting, setRestarting] = useState(false);

  const hydrateRuntimeData = useCallback(async (mapped: Agent[]) => {
    const enrichment = await Promise.all(
      mapped.map(async (agent) => {
        const [channelsData, skillsData] = await Promise.all([
          authFetch(`/api/agents/${agent.id}/channels`).catch(() => ({ channels: [] })),
          authFetch(`/api/agents/${agent.id}/skills`).catch(() => ({ skills: [] })),
        ]);

        return {
          id: agent.id,
          channels: (channelsData.channels || []).map((c: any) => ({
            id: c.id,
            name: c.name || c.id,
            detail: c.detail || null,
            running: c.running ?? false,
            mode: c.mode || null,
            streaming: c.streaming || null,
            pairedUsers: (c.pairedUsers || []).map((u: any) => ({ id: u.id, name: u.name || u.id })),
            groups: (c.groups || []).map((g: any) => ({ id: g.id, requireMention: g.requireMention ?? true, groupPolicy: g.groupPolicy ?? "allowlist" })),
          })),
          skills: (skillsData.skills || []).map((s: any) => ({
            name: s.name,
            emoji: s.emoji || "📦",
            description: s.description || "",
            eligible: s.eligible ?? false,
            disabled: s.disabled ?? false,
            source: s.source || "",
          })),
        };
      }),
    );

    const enrichmentById = new Map(enrichment.map((entry) => [entry.id, entry]));
    setAgents((current) =>
      current.map((agent) => {
        const next = enrichmentById.get(agent.id);
        if (!next) return agent;
        return { ...agent, channels: next.channels, skills: next.skills };
      }),
    );
  }, []);

  useEffect(() => {
    let cancelled = false;

    async function bootstrapAuth() {
      const token = getToken();

      if (!token) {
        if (!cancelled) setAuthReady(true);
        return;
      }

      try {
        const res = await fetch("/api/auth/verify", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ token }),
        });
        const data = await res.json();

        if (!cancelled && data.ok) {
          setAuthenticated(true);
        }
      } catch {
        // no-op; login screen will be shown after auth bootstrap completes
      } finally {
        if (!cancelled) setAuthReady(true);
      }
    }

    void bootstrapAuth();

    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (!navItems.some((item) => item.id === page)) {
      setPage("agents");
    }
  }, [navItems, page]);

  const fetchAll = useCallback(async () => {
    try {
      const [agentsRes, gwStatus, featuresRes, modelsRes, cronsRes] = await Promise.all([
        authFetch("/api/agents"),
        authFetch("/api/gateway-status").catch(() => ({ online: false })),
        authFetch("/api/features").catch(() => ({ debugRpcEnabled: false })),
        authFetch("/api/models").catch(() => ({ configuredModels: [], defaultModel: { primary: null, fallbacks: [] } })),
        authFetch("/api/crons").catch(() => ({ jobs: [] })),
      ]);

      setVersion(gwStatus.version || agentsRes.version || "—");
      setConfiguredModels(modelsRes.configuredModels || []);
      setDefaultModel(modelsRes.defaultModel || agentsRes.defaultModel || { primary: null, fallbacks: [] });
      setGatewayUp(gwStatus.online ?? false);
      setDebugRpcEnabled(featuresRes.debugRpcEnabled ?? false);

      if (Array.isArray(agentsRes.warnings) && agentsRes.warnings.length > 0 && (agentsRes.agents?.length ?? 0) === 0) {
        console.warn("Dashboard agent warnings:", agentsRes.warnings);
      }

      const jobsByAgent = new Map<string, any[]>();
      for (const job of cronsRes.jobs || []) {
        const agentId = job.agentId || "main";
        const current = jobsByAgent.get(agentId) || [];
        current.push(job);
        jobsByAgent.set(agentId, current);
      }

      const mapped: Agent[] = (agentsRes.agents || []).map((a: any): Agent => {
        const agentCrons = jobsByAgent.get(a.id) || [];
        return {
        id: a.id,
        name: a.name ?? a.id,
        emoji: a.emoji ?? "🤖",
        avatarUrl: a.avatarUrl || null,
        model: a.model || "—",
        modelFull: a.modelFull || a.model || "—",
        fallbacks: a.fallbacks || [],
        hasOwnModel: a.hasOwnModel ?? true,
        workspace: a.workspace || "—",
        toolsProfile: a.toolsProfile || null,
        sandboxed: a.sandboxed ?? false,
        workspaceAccess: a.workspaceAccess ?? null,
        sandboxKanban: {
          configured: a.sandboxKanban?.configured ?? false,
          active: a.sandboxKanban?.active ?? false,
          baseUrl: a.sandboxKanban?.baseUrl ?? null,
          hasAgentToken: a.sandboxKanban?.hasAgentToken ?? false,
        },
        isDefault: a.isDefault ?? false,
        channels: [],
        skills: [],
        models: (a.models || []).map((m: any) => ({
          id: m.id,
          name: m.name || m.id,
          provider: m.provider || "",
        })),
        toolGroups: [],
        files: (a.files || []).map((f: any) => ({
          name: f.name,
          path: f.path || "",
          missing: f.missing ?? false,
          size: f.size ?? 0,
          updatedAtMs: f.updatedAtMs ?? 0,
        })),
        heartbeat: a.heartbeat || { every: null, model: null, active: false },
        crons: agentCrons.map((cr: any) => ({
          id: cr.id,
          name: cr.name || cr.id,
          schedule:
            cr.schedule?.expr ||
            cr.schedule?.at ||
            (cr.schedule?.everyMs ? `${Math.round(cr.schedule.everyMs / 60000)}m` : ""),
          scheduleKind: cr.schedule?.kind || "",
          model: cr.payload?.model || null,
          message: cr.payload?.message || cr.payload?.text || null,
          enabled: cr.enabled ?? true,
          nextRunAtMs: cr.state?.nextRunAtMs || cr.nextRunAtMs || null,
        })),
      }});

      setAgents(mapped);
      setLoading(false);
      setRefreshing(false);
      void hydrateRuntimeData(mapped);
    } catch (e: any) {
      if (e.message === "unauthorized") {
        clearToken();
        setAuthenticated(false);
        return;
      }
      console.error("Failed to fetch data:", e);
      setGatewayUp(false);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [hydrateRuntimeData]);

  useEffect(() => { if (authenticated) fetchAll(); }, [authenticated, fetchAll]);

  function handleLogin(token: string) {
    setToken(token);
    setAuthReady(true);
    setAuthenticated(true);
    setLoading(true);
  }

  function handleLogout() {
    clearToken();
    setAuthReady(true);
    setAuthenticated(false);
    setAgents([]);
  }

  async function handleModelChange(agentId: string, model: string) {
    try {
      const res = await fetch(`/api/agents/${agentId}/model`, {
        method: "POST",
        headers: { "Content-Type": "application/json", ...authHeaders() },
        body: JSON.stringify({ model }),
      });
      const data = await res.json();
      if (data.ok) {
        await waitForGateway();
        toast.success(`Updated ${agentId} model`);
      } else {
        console.error("Model switch failed:", data.error);
        toast.error(data.error || `Failed to update ${agentId} model`);
      }
    } catch (e) {
      console.error("Model switch failed:", e);
      toast.error(`Failed to update ${agentId} model`);
    }
  }

  const waitForGateway = useCallback(async () => {
    setRestarting(true);
    setGatewayUp(false);
    // Wait for gateway to go offline (or timeout after 8s)
    for (let i = 0; i < 16; i++) {
      await new Promise((r) => setTimeout(r, 200));
      try {
        const res = await authFetch("/api/gateway-status");
        if (!res.online) break;
      } catch { break; }
    }
    // Now wait for it to come back
    for (let i = 0; i < 30; i++) {
      await new Promise((r) => setTimeout(r, 1000));
      try {
        const res = await authFetch("/api/gateway-status");
        if (res.online) {
          setGatewayUp(true);
          setRestarting(false);
          await fetchAll();
          return;
        }
      } catch {}
    }
    setRestarting(false);
    await fetchAll();
  }, [fetchAll]);

  function handleRefresh() {
    setRefreshing(true);
    fetchAll();
  }

  if (!authReady) {
    return (
      <div className="min-h-screen bg-zinc-50 dark:bg-zinc-950 text-zinc-500 dark:text-zinc-400 flex items-center justify-center text-sm">
        Checking session...
      </div>
    );
  }

  if (!authenticated) {
    return <LoginScreen onLogin={handleLogin} />;
  }

  return (
    <div className="min-h-screen bg-zinc-50 dark:bg-zinc-950 text-zinc-900 dark:text-zinc-200 transition-colors">
      {/* Header */}
      <header className="sticky top-0 z-20 border-b border-zinc-200 dark:border-zinc-800/60 bg-white/80 dark:bg-zinc-950/80 backdrop-blur-md">
        <div className="max-w-6xl mx-auto px-4 h-14 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <span className="text-xl">🦞</span>
            <span className="text-sm font-semibold tracking-tight">SuperClaw</span>
            <span className="text-[11px] bg-zinc-200 dark:bg-zinc-800 text-zinc-500 px-1.5 py-0.5 rounded font-mono">
              v{version}
            </span>
          </div>
          <div className="flex items-center gap-3 text-xs text-zinc-500">
            <span className="flex items-center gap-1.5">
              {gatewayUp ? <><Wifi size={12} className="text-green-500" /> Gateway online</> : <><WifiOff size={12} className="text-red-400" /> Gateway offline</>}
            </span>
            <button
              onClick={toggleTheme}
              className="p-1.5 rounded-md hover:bg-zinc-100 dark:hover:bg-zinc-800/50 text-zinc-400 hover:text-zinc-600 dark:hover:text-zinc-300 transition-colors"
              title={dark ? "Switch to light mode" : "Switch to dark mode"}
            >
              {dark ? <Sun size={14} /> : <Moon size={14} />}
            </button>
            <button
              onClick={handleRefresh}
              disabled={refreshing}
              className="p-1.5 rounded-md hover:bg-zinc-100 dark:hover:bg-zinc-800/50 text-zinc-400 hover:text-zinc-600 dark:hover:text-zinc-300 transition-colors disabled:opacity-50"
              title="Refresh"
            >
              <RefreshCw size={14} className={refreshing ? 'animate-spin' : ''} />
            </button>
            <button
              onClick={handleLogout}
              className="p-1.5 rounded-md hover:bg-zinc-100 dark:hover:bg-zinc-800/50 text-zinc-400 hover:text-zinc-600 dark:hover:text-zinc-300 transition-colors"
              title="Logout"
            >
              <LogOut size={14} />
            </button>
          </div>
        </div>
      </header>

      <div className="max-w-6xl mx-auto px-4 flex gap-6 py-6">
        {/* Sidebar Nav */}
        <nav className="w-44 shrink-0 hidden md:block">
          <div className="sticky top-20 space-y-0.5">
            {navItems.map((item) => {
              const Icon = item.icon;
              const active = page === item.id;
              return (
                <button
                  key={item.id}
                  onClick={() => setPage(item.id)}
                  className={`w-full flex items-center gap-2.5 px-3 py-2 rounded-lg text-sm font-medium transition-colors ${
                    active
                      ? 'bg-zinc-200 dark:bg-zinc-800 text-zinc-900 dark:text-zinc-100'
                      : 'text-zinc-500 hover:text-zinc-700 dark:hover:text-zinc-300 hover:bg-zinc-100 dark:hover:bg-zinc-800/50'
                  }`}
                >
                  <Icon size={15} />
                  {item.label}
                </button>
              );
            })}
          </div>
        </nav>

        {/* Mobile Nav */}
        <div className="md:hidden fixed bottom-0 left-0 right-0 z-20 bg-white/90 dark:bg-zinc-950/90 backdrop-blur-md border-t border-zinc-200 dark:border-zinc-800/60 px-2 py-1.5">
          <div className="flex justify-around">
            {navItems.map((item) => {
              const Icon = item.icon;
              const active = page === item.id;
              return (
                <button
                  key={item.id}
                  onClick={() => setPage(item.id)}
                  className={`flex flex-col items-center gap-0.5 px-2 py-1 rounded-lg text-[10px] font-medium transition-colors ${
                    active
                      ? 'text-zinc-900 dark:text-zinc-100'
                      : 'text-zinc-400 dark:text-zinc-500'
                  }`}
                >
                  <Icon size={16} />
                  {item.label}
                </button>
              );
            })}
          </div>
        </div>

        {/* Content */}
        <main className="flex-1 min-w-0 pb-20 md:pb-0">
          {restarting && (
            <div className="mb-4 px-4 py-3 bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800/40 rounded-xl text-sm text-amber-700 dark:text-amber-400 flex items-center gap-2">
              <RefreshCw size={14} className="animate-spin" />
              Gateway restarting...
            </div>
          )}
          {loading ? <div className="text-center py-24 text-zinc-400 dark:text-zinc-500 text-sm">Connecting to gateway...</div> : (
            <>
              {page === "agents" && <AgentsPage agents={agents} defaultPrimary={defaultModel.primary || "—"} onModelChange={handleModelChange} onRefresh={waitForGateway} onRefreshQuick={fetchAll} />}
              {page === "models" && <ModelsPage configuredModels={configuredModels} defaultModel={defaultModel} onRefresh={waitForGateway} />}
              {page === "skills" && <SkillsPage />}
              {page === "debug" && debugRpcEnabled && <DebugPage />}
              {page === "ops" && <ComingSoon title="Ops" />}
              {page === "performance" && <PerformancePage />}
              {page === "usage" && <UsagePage />}
            </>
          )}
        </main>
      </div>
    </div>
  );
}
