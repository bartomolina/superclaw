/* eslint-disable @typescript-eslint/no-explicit-any */
"use client";

import { useEffect, useState } from "react";
import { Bar, BarChart, CartesianGrid, XAxis } from "recharts";

import { authFetch } from "@/components/dashboard/auth";
import { StateMessage } from "@/components/dashboard/state-message";
import { ChartContainer, ChartTooltip, ChartTooltipContent, type ChartConfig } from "@/components/ui/chart";

export function UsagePage() {
  const [data, setData] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [range, setRange] = useState<7 | 14 | 30>(7);

  useEffect(() => {
    authFetch("/api/usage")
      .then((d) => {
        setData(d);
        setLoading(false);
      })
      .catch(() => setLoading(false));
  }, []);

  if (loading) return <StateMessage>Loading usage data...</StateMessage>;
  if (!data?.aggregates) return <StateMessage>No usage data available</StateMessage>;

  const cutoff = new Date();
  cutoff.setDate(cutoff.getDate() - range);
  const cutoffStr = cutoff.toISOString().slice(0, 10);
  const filterDaily = (arr: any[]) => arr.filter((d: any) => d.date >= cutoffStr);
  const allDaily = data.aggregates.daily || [];
  const daily = filterDaily(allDaily);
  const filteredModelDaily = filterDaily(data.aggregates.modelDaily || []);
  const filteredByAgent = (data.aggregates.byAgent || []).map((a: any) => {
    const agentSessions = (data.sessions || []).filter((s: any) => s.agentId === a.agentId);
    const cost = agentSessions.reduce(
      (sum: number, s: any) =>
        sum +
        (s.usage?.dailyBreakdown || [])
          .filter((d: any) => d.date >= cutoffStr)
          .reduce((ds: number, d: any) => ds + d.cost, 0),
      0
    );
    const tokens = agentSessions.reduce(
      (sum: number, s: any) =>
        sum +
        (s.usage?.dailyBreakdown || [])
          .filter((d: any) => d.date >= cutoffStr)
          .reduce((ds: number, d: any) => ds + d.tokens, 0),
      0
    );
    return { ...a, filteredCost: cost, filteredTokens: tokens };
  });
  const totalCost = daily.reduce((s: number, d: any) => s + d.cost, 0);
  const totalTokens = daily.reduce((s: number, d: any) => s + d.tokens, 0);
  const totalMessages = daily.reduce((s: number, d: any) => s + d.messages, 0);
  const totalToolCalls = daily.reduce((s: number, d: any) => s + d.toolCalls, 0);

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-lg font-semibold text-zinc-800 dark:text-zinc-200">Usage</h1>
        <div className="flex gap-1 bg-zinc-100 dark:bg-zinc-800 rounded-lg p-0.5">
          {([7, 14, 30] as const).map((r) => (
            <button
              key={r}
              onClick={() => setRange(r)}
              className={`px-3 py-1 text-xs font-medium rounded-md transition-colors ${
                range === r
                  ? "bg-white dark:bg-zinc-700 text-zinc-800 dark:text-zinc-200 shadow-sm"
                  : "text-zinc-500 dark:text-zinc-400 hover:text-zinc-700 dark:hover:text-zinc-300"
              }`}
            >
              {r}d
            </button>
          ))}
        </div>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        {[
          { label: "Total Cost", value: `$${totalCost.toFixed(2)}` },
          { label: "Total Tokens", value: `${(totalTokens / 1_000_000).toFixed(1)}M` },
          { label: "Messages", value: totalMessages.toLocaleString() },
          { label: "Tool Calls", value: totalToolCalls.toLocaleString() },
        ].map((c) => (
          <div
            key={c.label}
            className="bg-white dark:bg-zinc-900/80 border border-zinc-200 dark:border-zinc-800/60 rounded-xl p-4"
          >
            <div className="text-[11px] text-zinc-400 uppercase tracking-wider font-medium">{c.label}</div>
            <div className="text-2xl font-semibold text-zinc-800 dark:text-zinc-200 mt-1">{c.value}</div>
          </div>
        ))}
      </div>

      <div className="bg-white dark:bg-zinc-900/80 border border-zinc-200 dark:border-zinc-800/60 rounded-xl p-5">
        <h2 className="text-sm font-semibold text-zinc-800 dark:text-zinc-200 mb-4">Daily Cost</h2>
        <ChartContainer
          config={{ cost: { label: "Cost", color: "hsl(221 83% 53%)" } satisfies ChartConfig["cost"] }}
          className="h-48 w-full"
        >
          <BarChart data={daily.map((d: any) => ({ ...d, label: d.date.slice(5) }))} margin={{ left: 12, right: 12 }}>
            <CartesianGrid vertical={false} />
            <XAxis dataKey="label" tickLine={false} axisLine={false} tickMargin={8} />
            <ChartTooltip
              content={
                <ChartTooltipContent
                  className="w-[120px]"
                  labelFormatter={(value: unknown) => String(value)}
                  formatter={(value: unknown) => [`$${Number(value).toFixed(2)}`, "Cost"]}
                />
              }
            />
            <Bar dataKey="cost" fill="var(--color-cost)" radius={[4, 4, 0, 0]} />
          </BarChart>
        </ChartContainer>
      </div>

      <div className="bg-white dark:bg-zinc-900/80 border border-zinc-200 dark:border-zinc-800/60 rounded-xl p-5">
        <h2 className="text-sm font-semibold text-zinc-800 dark:text-zinc-200 mb-3">Cost by Agent</h2>
        <div className="space-y-2">
          {filteredByAgent.map((a: any) => (
            <div key={a.agentId} className="flex items-center justify-between">
              <span className="text-sm text-zinc-700 dark:text-zinc-300 font-medium">{a.agentId}</span>
              <div className="flex items-center gap-3">
                <span className="text-xs text-zinc-400">{(a.filteredTokens / 1_000_000).toFixed(1)}M tokens</span>
                <span className="text-sm font-semibold text-zinc-800 dark:text-zinc-200">
                  ${a.filteredCost.toFixed(2)}
                </span>
              </div>
            </div>
          ))}
        </div>
      </div>

      <div className="bg-white dark:bg-zinc-900/80 border border-zinc-200 dark:border-zinc-800/60 rounded-xl p-5">
        <h2 className="text-sm font-semibold text-zinc-800 dark:text-zinc-200 mb-3">Cost by Model</h2>
        <div className="space-y-2">
          {(() => {
            const byModel: Record<string, { tokens: number; cost: number; count: number }> = {};
            for (const d of filteredModelDaily) {
              const key = d.model;
              if (!byModel[key]) byModel[key] = { tokens: 0, cost: 0, count: 0 };
              byModel[key].tokens += d.tokens;
              byModel[key].cost += d.cost;
              byModel[key].count += d.count;
            }
            return Object.entries(byModel)
              .sort((a, b) => b[1].cost - a[1].cost)
              .map(([model, m]) => (
                <div key={model} className="flex items-center justify-between">
                  <div className="min-w-0">
                    <span className="text-sm text-zinc-700 dark:text-zinc-300 font-medium">{model}</span>
                    <span className="text-[11px] text-zinc-400 ml-1.5">{m.count} calls</span>
                  </div>
                  <div className="flex items-center gap-3 shrink-0">
                    <span className="text-xs text-zinc-400">{(m.tokens / 1_000_000).toFixed(1)}M</span>
                    <span className="text-sm font-semibold text-zinc-800 dark:text-zinc-200">${m.cost.toFixed(2)}</span>
                  </div>
                </div>
              ));
          })()}
        </div>
      </div>

      <div className="bg-white dark:bg-zinc-900/80 border border-zinc-200 dark:border-zinc-800/60 rounded-xl p-5">
        <h2 className="text-sm font-semibold text-zinc-800 dark:text-zinc-200 mb-3">Cost Breakdown</h2>
        <div className="space-y-1.5">
          {(() => {
            const ratio = totalCost > 0 ? totalCost / (data.totals.totalCost || 1) : 0;
            const items = [
              { label: "Cache Write", value: data.totals.cacheWriteCost * ratio, color: "bg-red-400" },
              { label: "Cache Read", value: data.totals.cacheReadCost * ratio, color: "bg-blue-400" },
              { label: "Output", value: data.totals.outputCost * ratio, color: "bg-green-400" },
              { label: "Input", value: data.totals.inputCost * ratio, color: "bg-amber-400" },
            ];
            return items.map((item) => (
              <div key={item.label} className="flex items-center gap-3">
                <div className={`w-2.5 h-2.5 rounded-full ${item.color} shrink-0`} />
                <span className="text-sm text-zinc-600 dark:text-zinc-400 flex-1">{item.label}</span>
                <span className="text-sm font-medium text-zinc-800 dark:text-zinc-200">${item.value.toFixed(2)}</span>
                <span className="text-[11px] text-zinc-400 w-12 text-right">
                  {totalCost > 0 ? ((item.value / totalCost) * 100).toFixed(0) : 0}%
                </span>
              </div>
            ));
          })()}
        </div>
      </div>

      <div className="bg-white dark:bg-zinc-900/80 border border-zinc-200 dark:border-zinc-800/60 rounded-xl p-5">
        <h2 className="text-sm font-semibold text-zinc-800 dark:text-zinc-200 mb-3">Tool Usage</h2>
        <div className="flex flex-wrap gap-2">
          {(data.aggregates.tools.tools || []).map((t: any) => (
            <span
              key={t.name}
              className="text-xs px-2.5 py-1 rounded-lg border border-zinc-200 dark:border-zinc-700/40 text-zinc-600 dark:text-zinc-400"
            >
              {t.name} <span className="text-zinc-400 dark:text-zinc-500 font-mono">{t.count}</span>
            </span>
          ))}
        </div>
      </div>

      <div className="bg-white dark:bg-zinc-900/80 border border-zinc-200 dark:border-zinc-800/60 rounded-xl p-5">
        <h2 className="text-sm font-semibold text-zinc-800 dark:text-zinc-200 mb-3">Response Latency</h2>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          {[
            { label: "Average", value: `${(data.aggregates.latency.avgMs / 1000).toFixed(1)}s` },
            { label: "p95", value: `${(data.aggregates.latency.p95Ms / 1000).toFixed(1)}s` },
            { label: "Min", value: `${(data.aggregates.latency.minMs / 1000).toFixed(1)}s` },
            { label: "Max", value: `${(data.aggregates.latency.maxMs / 1000).toFixed(1)}s` },
          ].map((l) => (
            <div key={l.label} className="text-center">
              <div className="text-[11px] text-zinc-400 uppercase tracking-wider">{l.label}</div>
              <div className="text-lg font-semibold text-zinc-800 dark:text-zinc-200">{l.value}</div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
