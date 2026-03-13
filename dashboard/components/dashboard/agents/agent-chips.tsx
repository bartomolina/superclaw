"use client";

import { useState } from "react";
import { Clock, Cpu, MessageSquare, Puzzle } from "lucide-react";

import { authHeaders } from "@/components/dashboard/auth";
import { StatusDot } from "@/components/dashboard/common";
import { type Agent, type Skill } from "@/components/dashboard/types";

export interface ChipSection {
  id: string;
  label: string;
  count: number;
  icon: typeof Cpu;
}

interface AgentChipsProps {
  agent: Agent;
  uniqueSkills: Skill[];
  sections: ChipSection[];
  onRefreshData: () => Promise<void>;
}

export function AgentChips({ agent, uniqueSkills, sections, onRefreshData }: AgentChipsProps) {
  const [expanded, setExpanded] = useState<string | null>(null);

  function toggle(id: string) {
    setExpanded(expanded === id ? null : id);
  }

  return (
    <div className="border-t border-zinc-200 dark:border-zinc-800/60">
      <div className="px-5 py-3 flex flex-wrap gap-1.5">
        {sections.map((s) => {
          const Icon = s.icon;
          const active = s.count > 0;
          const isExpanded = expanded === s.id;
          return (
            <button
              key={s.id}
              onClick={() => (s.count > 0 ? toggle(s.id) : undefined)}
              className={`inline-flex items-center gap-1.5 text-xs px-2 py-1 rounded-md border transition-colors ${
                isExpanded
                  ? "bg-zinc-200 dark:bg-zinc-700 border-zinc-300 dark:border-zinc-600 text-zinc-700 dark:text-zinc-200"
                  : active
                    ? "bg-zinc-50 dark:bg-zinc-800/50 border-zinc-200 dark:border-zinc-700/40 text-zinc-600 dark:text-zinc-400 hover:bg-zinc-100 dark:hover:bg-zinc-800 cursor-pointer"
                    : "bg-zinc-50 dark:bg-zinc-950/30 border-zinc-100 dark:border-zinc-800/30 text-zinc-300 dark:text-zinc-600 cursor-default"
              }`}
            >
              <Icon size={11} />
              {s.label}
              <span className="font-mono">{s.count}</span>
            </button>
          );
        })}
      </div>

      {expanded && (
        <div className="px-5 pb-3">
          {expanded === "channels" &&
            (agent.channels.length > 0 ? (
              <div className="space-y-2">
                {agent.channels.map((c) => (
                  <div key={c.id}>
                    <div className="flex items-center justify-between text-sm">
                      <div className="min-w-0">
                        <span className="text-zinc-700 dark:text-zinc-300">{c.name}</span>
                        {c.detail && <span className="text-[11px] text-zinc-400 dark:text-zinc-500 ml-1.5">({c.detail})</span>}
                      </div>
                      <span className="flex items-center gap-1.5 text-xs text-zinc-400 dark:text-zinc-500 shrink-0">
                        <StatusDot active={c.running} />
                        {c.running ? c.mode || "running" : "stopped"}
                        {c.streaming && (
                          <span
                            className={`ml-1 px-1.5 py-0.5 rounded text-[10px] font-medium ${
                              c.streaming === "partial"
                                ? "bg-green-100 dark:bg-green-900/30 text-green-600 dark:text-green-400"
                                : "bg-zinc-100 dark:bg-zinc-800 text-zinc-500 dark:text-zinc-400"
                            }`}
                          >
                            {c.streaming === "partial" ? "streaming" : "no stream"}
                          </span>
                        )}
                      </span>
                    </div>
                    {(c.pairedUsers.length > 0 || c.groups.length > 0) && (
                      <div className="flex flex-wrap gap-1.5 mt-1 ml-0.5">
                        {c.pairedUsers.map((u) => (
                          <span key={u.id} className="text-[11px] px-1.5 py-0.5 rounded border border-zinc-200 dark:border-zinc-700/40 text-zinc-500 dark:text-zinc-400">
                            {u.name}
                          </span>
                        ))}
                        {c.groups.map((g) => (
                          <span key={g.id} className="text-[11px] px-1.5 py-0.5 rounded border border-blue-200 dark:border-blue-800/40 text-blue-500 dark:text-blue-400">
                            Group {g.id}
                            {!g.requireMention ? "" : " · @mention"}
                          </span>
                        ))}
                      </div>
                    )}
                  </div>
                ))}
              </div>
            ) : null)}

          {expanded === "skills" && (
            <div className="flex flex-wrap gap-1.5">
              {uniqueSkills.map((s) => (
                <span
                  key={s.name}
                  title={s.description}
                  className="inline-flex items-center gap-1 text-xs bg-zinc-100 dark:bg-zinc-800/80 border border-zinc-200 dark:border-zinc-700/40 text-zinc-600 dark:text-zinc-300 px-2 py-1 rounded-md cursor-default"
                >
                  <span className="text-sm">{s.emoji || "📦"}</span>
                  {s.name}
                </span>
              ))}
            </div>
          )}

          {expanded === "crons" && (
            <div className="space-y-2">
              {agent.crons.map((cr) => (
                <div key={cr.id} className="bg-zinc-50 dark:bg-zinc-950/50 border border-zinc-200 dark:border-zinc-800/40 rounded-lg p-2.5">
                  <div className="flex items-center justify-between">
                    <span className="text-sm font-medium text-zinc-700 dark:text-zinc-300">{cr.name}</span>
                    <span className="flex items-center gap-1.5 text-xs shrink-0">
                      <StatusDot active={cr.enabled} />
                      {cr.enabled ? "active" : "paused"}
                    </span>
                  </div>
                  <div className="flex flex-wrap items-center gap-x-3 gap-y-0.5 mt-1 text-[11px] text-zinc-400 dark:text-zinc-500">
                    <span className="font-mono">{cr.schedule}</span>
                    <span className="flex items-center gap-1">
                      model:
                      <select
                        value={cr.model || "__default__"}
                        onChange={async (e) => {
                          const model = e.target.value === "__default__" ? null : e.target.value;
                          await fetch(`/api/crons/${cr.id}/model`, {
                            method: "POST",
                            headers: { "Content-Type": "application/json", ...authHeaders() },
                            body: JSON.stringify({ model }),
                          });
                          await onRefreshData();
                        }}
                        className="text-[11px] bg-transparent text-zinc-600 dark:text-zinc-400 focus:outline-none cursor-pointer"
                      >
                        <option value="__default__">default</option>
                        {agent.models.map((m) => (
                          <option key={m.id} value={m.id}>
                            {m.name}
                          </option>
                        ))}
                      </select>
                    </span>
                    {cr.nextRunAtMs && <span>next: {new Date(cr.nextRunAtMs).toLocaleString()}</span>}
                  </div>
                  {cr.message && <div className="text-[11px] text-zinc-500 dark:text-zinc-400 mt-1 truncate">{cr.message}</div>}
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

export function buildAgentSections(agent: Agent, uniqueSkillsCount: number): ChipSection[] {
  return [
    { id: "channels", label: "Channels", count: agent.channels.length, icon: MessageSquare },
    { id: "skills", label: "Skills", count: uniqueSkillsCount, icon: Puzzle },
    { id: "crons", label: "Crons", count: agent.crons.length, icon: Clock },
  ];
}
