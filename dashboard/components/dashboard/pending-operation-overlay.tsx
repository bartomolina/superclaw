"use client";

import { type RestartOperationState } from "@/components/dashboard/types";

export function PendingOperationOverlay({ operation }: { operation: RestartOperationState | null }) {
  if (!operation) return null;

  return (
    <>
      <div className="fixed inset-0 z-[70] flex items-center justify-center bg-zinc-950/35 px-4 backdrop-blur-sm">
        <div className="w-full max-w-md rounded-[28px] border border-zinc-200/80 bg-white/95 p-5 shadow-2xl shadow-zinc-950/10 dark:border-zinc-800/80 dark:bg-zinc-900/95 dark:shadow-black/40">
          <div className="flex items-start gap-4">
            <div className="mt-0.5 flex h-12 w-12 shrink-0 items-center justify-center text-[31px] leading-none">
              <span className="pending-operation-lobster" role="img" aria-label="Spinning lobster">
                🦞
              </span>
            </div>
            <div className="min-w-0 flex-1">
              <p className="text-[11px] font-semibold uppercase tracking-[0.22em] text-zinc-400 dark:text-zinc-500">
                Please wait
              </p>
              <h2 className="mt-1 text-base font-semibold text-zinc-900 dark:text-zinc-100">{operation.title}</h2>
              <p className="mt-2 text-sm leading-6 text-zinc-500 dark:text-zinc-400">{operation.message}</p>

              <div className="mt-5 border-t border-zinc-200/80 pt-3 dark:border-zinc-800/80">
                <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-zinc-400 dark:text-zinc-500">
                  Current stage
                </p>
                <p className="mt-1.5 text-sm font-medium text-zinc-700 dark:text-zinc-300">{operation.phaseLabel}</p>
              </div>
            </div>
          </div>
        </div>
      </div>

      <style jsx>{`
        .pending-operation-lobster {
          display: inline-block;
          transform-origin: 50% 50%;
          animation: lobster-spin 1.6s linear infinite;
        }

        @keyframes lobster-spin {
          from {
            transform: rotate(0deg);
          }
          to {
            transform: rotate(360deg);
          }
        }
      `}</style>
    </>
  );
}
