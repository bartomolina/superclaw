"use client";

import { Loader2 } from "lucide-react";

import { type RestartOperationState } from "@/components/dashboard/types";

export function PendingOperationOverlay({ operation }: { operation: RestartOperationState | null }) {
  if (!operation) return null;

  return (
    <div className="fixed inset-0 z-[70] flex items-center justify-center bg-zinc-950/35 px-4 backdrop-blur-sm">
      <div className="w-full max-w-md rounded-2xl border border-zinc-200/80 bg-white/95 p-5 shadow-2xl shadow-zinc-950/10 dark:border-zinc-800/80 dark:bg-zinc-900/95 dark:shadow-black/40">
        <div className="flex items-start gap-4">
          <div className="mt-0.5 flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-zinc-900 text-white dark:bg-zinc-100 dark:text-zinc-900">
            <Loader2 size={18} className="animate-spin" />
          </div>
          <div className="min-w-0 flex-1">
            <p className="text-[11px] font-semibold uppercase tracking-[0.22em] text-zinc-400 dark:text-zinc-500">
              Please wait
            </p>
            <h2 className="mt-1 text-base font-semibold text-zinc-900 dark:text-zinc-100">{operation.title}</h2>
            <p className="mt-2 text-sm leading-6 text-zinc-500 dark:text-zinc-400">{operation.message}</p>
            <div className="mt-4 inline-flex items-center gap-2 rounded-full border border-zinc-200 bg-zinc-50 px-3 py-1 text-xs font-medium text-zinc-600 dark:border-zinc-800 dark:bg-zinc-950 dark:text-zinc-300">
              <span className="h-1.5 w-1.5 rounded-full bg-emerald-500" />
              {operation.phaseLabel}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
