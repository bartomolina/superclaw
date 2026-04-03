"use client";

import { useState } from "react";
import { Clock, Cpu, FileText, Folder, MessageSquare, Puzzle, Settings2, UserRound } from "lucide-react";
import { toast } from "sonner";

import { authHeaders } from "@/components/dashboard/auth";
import { StatusDot } from "@/components/dashboard/common";
import { type Agent, type Skill } from "@/components/dashboard/types";

export interface ChipSection {
  id: string;
  label: string;
  count: number;
  icon: typeof Cpu;
  state?: "loading" | "ready" | "error";
}

const DEFAULT_AGENT_FILE_NAMES = new Set(["AGENTS.md", "BOOTSTRAP.md", "HEARTBEAT.md"]);
const IDENTITY_FILE_NAMES = new Set(["IDENTITY.md", "SOUL.md", "USER.md", "TOOLS.md", "MEMORY.md"]);

interface AgentChipsProps {
  agent: Agent;
  uniqueSkills: Skill[];
  sections: ChipSection[];
  onRefreshData: () => Promise<void>;
  onOpenFile: (name: string) => Promise<void>;
  loadingFile: string | null;
}

function renderFileButton(file: Agent["files"][number], onOpenFile: (name: string) => Promise<void>, loadingFile: string | null) {
  return (
    <button
      key={file.name}
      onClick={() => !file.missing && onOpenFile(file.name)}
      disabled={file.missing || loadingFile === file.name}
      className={`text-[11px] px-2 py-1 rounded-md border transition-colors ${
        file.missing
          ? "border-red-200 dark:border-red-800/40 text-red-400 dark:text-red-500 cursor-default line-through"
          : loadingFile === file.name
            ? "border-zinc-300 dark:border-zinc-600 text-zinc-500 animate-pulse"
            : "bg-zinc-50 dark:bg-zinc-800/50 border-zinc-200 dark:border-zinc-700/40 text-zinc-600 dark:text-zinc-400 hover:bg-zinc-100 dark:hover:bg-zinc-800 cursor-pointer"
      }`}
      title={file.path}
    >
      {file.name}
    </button>
  );
}

export function AgentChips({ agent, uniqueSkills, sections, onRefreshData, onOpenFile, loadingFile }: AgentChipsProps) {
  const [expanded, setExpanded] = useState<string | null>(null);
  const [expandedCronMessages, setExpandedCronMessages] = useState<Record<string, boolean>>({});

  function toggle(id: string) {
    setExpanded(expanded === id ? null : id);
  }

  function toggleCronMessage(id: string) {
    setExpandedCronMessages((current) => ({ ...current, [id]: !current[id] }));
  }

  return (
    <div className="border-t border-zinc-200 dark:border-zinc-800/60">
      <div className="px-4 py-2.5 flex flex-wrap gap-1.5">
        {sections.map((s) => {
          const Icon = s.icon;
          const active = s.count > 0 || s.state === "loading" || s.state === "error";
          const isExpanded = expanded === s.id;
          return (
            <button
              key={s.id}
              onClick={() => (active ? toggle(s.id) : undefined)}
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
              <span className="font-mono">{s.state === "loading" ? "…" : s.state === "error" ? "!" : s.count}</span>
            </button>
          );
        })}
      </div>

      {expanded && (
        <div className="px-4 pb-3">
          {expanded === "channels" &&
            (agent.channelsState === "loading" ? (
              <div className="text-sm text-zinc-400 dark:text-zinc-500">Loading channels…</div>
            ) : agent.channelsState === "error" ? (
              <div className="text-sm text-zinc-400 dark:text-zinc-500">Channels unavailable right now.</div>
            ) : agent.channels.length > 0 ? (
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
                        {c.pairedUsers.map((u) => {
                          const sourceLabel = u.source === "both" ? "allow+stored" : u.source === "config" ? "allow" : u.source === "stored" ? "stored" : null;

                          return (
                            <span key={u.id} className="text-[11px] px-1.5 py-0.5 rounded border border-zinc-200 dark:border-zinc-700/40 text-zinc-500 dark:text-zinc-400">
                              {u.name}
                              {sourceLabel ? <span className="ml-1 text-[10px] text-zinc-400 dark:text-zinc-500">· {sourceLabel}</span> : null}
                            </span>
                          );
                        })}
                        {c.groups.map((g) => {
                          const replyMode = g.requireMention ? "mention only" : "all messages";
                          const access = g.groupPolicy;

                          return (
                            <span key={g.id} className="text-[11px] px-1.5 py-0.5 rounded border border-blue-200 dark:border-blue-800/40 text-blue-500 dark:text-blue-400">
                              Group {g.id} · access: {access} · reply: {replyMode}
                            </span>
                          );
                        })}
                      </div>
                    )}
                  </div>
                ))}
              </div>
            ) : (
              <div className="text-sm text-zinc-400 dark:text-zinc-500">No channels.</div>
            ))}

          {expanded === "skills" &&
            (agent.skillsState === "loading" ? (
              <div className="text-sm text-zinc-400 dark:text-zinc-500">Loading skills…</div>
            ) : agent.skillsState === "error" ? (
              <div className="text-sm text-zinc-400 dark:text-zinc-500">Skills unavailable right now.</div>
            ) : uniqueSkills.length > 0 ? (
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
            ) : (
              <div className="text-sm text-zinc-400 dark:text-zinc-500">No unique skills.</div>
            ))}

          {expanded === "crons" && (
            <div className="space-y-2">
              {agent.crons.map((cr) => {
                const isMessageExpanded = !!expandedCronMessages[cr.id];
                const shouldShowMessageToggle = (cr.message?.length || 0) > 120;

                return (
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
                            try {
                              const res = await fetch(`/api/crons/${cr.id}/model`, {
                                method: "POST",
                                headers: { "Content-Type": "application/json", ...authHeaders() },
                                body: JSON.stringify({ model }),
                              });
                              const data = await res.json();
                              if (!data.ok) throw new Error(data.error || "Failed to update cron model");
                              await onRefreshData();
                            } catch (error) {
                              toast.error(error instanceof Error ? error.message : "Failed to update cron model");
                            }
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
                    {cr.message && (
                      <div className="mt-1">
                        <div className={`text-[11px] text-zinc-500 dark:text-zinc-400 ${isMessageExpanded ? "whitespace-pre-wrap break-words" : "truncate"}`}>
                          {cr.message}
                        </div>
                        {shouldShowMessageToggle && (
                          <button
                            type="button"
                            onClick={() => toggleCronMessage(cr.id)}
                            className="mt-1 text-[11px] text-zinc-500 hover:text-zinc-700 dark:text-zinc-400 dark:hover:text-zinc-200 transition-colors"
                          >
                            {isMessageExpanded ? "show less" : "show more"}
                          </button>
                        )}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}

          {expanded === "files" && (() => {
            const defaultFiles = agent.files.filter((file) => DEFAULT_AGENT_FILE_NAMES.has(file.name));
            const identityFiles = agent.files.filter((file) => IDENTITY_FILE_NAMES.has(file.name));
            const otherFiles = agent.files.filter(
              (file) => !DEFAULT_AGENT_FILE_NAMES.has(file.name) && !IDENTITY_FILE_NAMES.has(file.name),
            );

            const groups = [
              { id: "default", icon: Settings2, files: defaultFiles },
              { id: "identity", icon: UserRound, files: identityFiles },
              { id: "other", icon: Folder, files: otherFiles },
            ].filter((group) => group.files.length > 0);

            return (
              <div className="space-y-2">
                {groups.map((group) => {
                  const Icon = group.icon;
                  return (
                    <div key={group.id} className="flex items-start gap-2">
                      <Icon size={13} className="text-zinc-400 mt-1 shrink-0" />
                      <div className="flex flex-wrap gap-1.5">{group.files.map((file) => renderFileButton(file, onOpenFile, loadingFile))}</div>
                    </div>
                  );
                })}
              </div>
            );
          })()}
        </div>
      )}
    </div>
  );
}

export function buildAgentSections(agent: Agent, uniqueSkillsCount: number, skillsStable = true): ChipSection[] {
  return [
    { id: "channels", label: "Channels", count: agent.channels.length, icon: MessageSquare, state: agent.channelsState },
    { id: "skills", label: "Skills", count: uniqueSkillsCount, icon: Puzzle, state: skillsStable ? agent.skillsState : "loading" },
    { id: "crons", label: "Crons", count: agent.crons.length, icon: Clock },
    { id: "files", label: "Files", count: agent.files.length, icon: FileText },
  ];
}
