/* eslint-disable @typescript-eslint/no-explicit-any */
"use client";

import { useEffect, useState } from "react";

import { authFetch } from "@/components/dashboard/auth";

export function SkillsPage() {
  const [skills, setSkills] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [filter, setFilter] = useState<"eligible" | "disabled" | "missing">("eligible");

  useEffect(() => {
    authFetch("/api/skills")
      .then((d) => {
        setSkills(d.skills || []);
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  const filtered = skills.filter((s) => {
    if (search.trim()) {
      const q = search.toLowerCase();
      if (!s.name.toLowerCase().includes(q) && !s.description?.toLowerCase().includes(q)) return false;
    }
    if (filter === "eligible") return s.eligible;
    if (filter === "disabled") return s.disabled;
    if (filter === "missing") return !s.eligible && !s.disabled && (s.missing?.bins?.length > 0 || s.missing?.anyBins?.length > 0 || s.missing?.env?.length > 0 || s.missing?.os?.length > 0);
    return true;
  });

  const counts = {
    eligible: skills.filter((s) => s.eligible).length,
    disabled: skills.filter((s) => s.disabled).length,
    missing: skills.filter((s) => !s.eligible && !s.disabled && (s.missing?.bins?.length > 0 || s.missing?.anyBins?.length > 0 || s.missing?.env?.length > 0 || s.missing?.os?.length > 0)).length,
  };

  if (loading) return <div className="text-center py-24 text-zinc-400 dark:text-zinc-500 text-sm">Loading skills...</div>;

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="text-lg font-semibold text-zinc-800 dark:text-zinc-200">Skills</h1>
        <span className="text-xs text-zinc-400">{skills.length} total</span>
      </div>

      <input
        type="text"
        value={search}
        onChange={(e) => setSearch(e.target.value)}
        placeholder="Search skills..."
        className="w-full px-3 py-2 bg-white dark:bg-zinc-900/80 border border-zinc-200 dark:border-zinc-800 rounded-lg text-sm text-zinc-900 dark:text-zinc-200 placeholder:text-zinc-400 dark:placeholder:text-zinc-600 focus:outline-none focus:ring-2 focus:ring-zinc-300 dark:focus:ring-zinc-700"
      />

      <div className="flex gap-1.5">
        {(["eligible", "disabled", "missing"] as const).map((f) => (
          <button
            key={f}
            onClick={() => setFilter(f)}
            className={`text-xs px-2.5 py-1.5 rounded-lg border transition-colors ${
              filter === f
                ? "bg-zinc-900 dark:bg-zinc-100 text-white dark:text-zinc-900 border-transparent"
                : "bg-zinc-50 dark:bg-zinc-950 text-zinc-600 dark:text-zinc-400 border-zinc-200 dark:border-zinc-800 hover:bg-zinc-100 dark:hover:bg-zinc-800"
            }`}
          >
            {f.charAt(0).toUpperCase() + f.slice(1)} ({counts[f]})
          </button>
        ))}
      </div>

      <div className="bg-white dark:bg-zinc-900/80 border border-zinc-200 dark:border-zinc-800/60 rounded-xl overflow-hidden shadow-sm dark:shadow-none">
        {filtered.length === 0 ? (
          <div className="p-5 text-sm text-zinc-400 italic">No skills match</div>
        ) : (
          <div className="divide-y divide-zinc-100 dark:divide-zinc-800/60">
            {filtered.map((s) => (
              <div key={s.name} className="px-5 py-3 flex items-start gap-3">
                <span className="text-xl mt-0.5">{s.emoji || "📦"}</span>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="text-sm font-medium text-zinc-800 dark:text-zinc-200">{s.name}</span>
                    {s.eligible && <span className="text-[10px] uppercase tracking-wider bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-400 px-1.5 py-0.5 rounded font-medium">active</span>}
                    {s.disabled && <span className="text-[10px] uppercase tracking-wider bg-zinc-100 dark:bg-zinc-800 text-zinc-400 px-1.5 py-0.5 rounded font-medium">disabled</span>}
                    {!s.eligible && !s.disabled && (s.missing?.bins?.length > 0 || s.missing?.anyBins?.length > 0 || s.missing?.env?.length > 0) && (
                      <span className="text-[10px] uppercase tracking-wider bg-amber-100 dark:bg-amber-900/30 text-amber-700 dark:text-amber-400 px-1.5 py-0.5 rounded font-medium">missing deps</span>
                    )}
                    <span className="text-[10px] text-zinc-400 dark:text-zinc-500">{s.bundled ? "bundled" : s.source === "openclaw-managed" ? "managed" : s.source}</span>
                  </div>
                  <p className="text-xs text-zinc-500 dark:text-zinc-400 mt-0.5 line-clamp-2">{s.description}</p>
                  {(s.missing?.bins?.length > 0 || s.missing?.anyBins?.length > 0 || s.missing?.env?.length > 0) && (
                    <div className="mt-1.5 flex flex-wrap gap-1">
                      {s.missing?.bins?.map((b: string) => (
                        <span key={b} className="text-[10px] font-mono bg-red-50 dark:bg-red-900/20 text-red-600 dark:text-red-400 px-1.5 py-0.5 rounded">
                          {b}
                        </span>
                      ))}
                      {s.missing?.anyBins?.length > 0 && (
                        <span className="text-[10px] font-mono bg-red-50 dark:bg-red-900/20 text-red-600 dark:text-red-400 px-1.5 py-0.5 rounded">{s.missing.anyBins.join(" | ")}</span>
                      )}
                      {s.missing?.env?.map((e: string) => (
                        <span key={e} className="text-[10px] font-mono bg-red-50 dark:bg-red-900/20 text-red-600 dark:text-red-400 px-1.5 py-0.5 rounded">
                          {e}
                        </span>
                      ))}
                      {s.missing.os?.map((o: string) => (
                        <span key={o} className="text-[10px] font-mono bg-red-50 dark:bg-red-900/20 text-red-600 dark:text-red-400 px-1.5 py-0.5 rounded">
                          os:{o}
                        </span>
                      ))}
                    </div>
                  )}
                  {s.homepage && (
                    <a href={s.homepage} target="_blank" rel="noopener noreferrer" className="text-[11px] text-zinc-400 hover:text-zinc-600 dark:hover:text-zinc-300 mt-1 inline-block">
                      {s.homepage.replace(/^https?:\/\//, "").replace(/\/$/, "")}
                    </a>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
