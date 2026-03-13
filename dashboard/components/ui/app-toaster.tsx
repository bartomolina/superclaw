"use client";

import { CheckCircle2, CircleAlert, Info, LoaderCircle, XCircle } from "lucide-react";
import { Toaster } from "sonner";

const toastClassNames = {
  toast:
    "group pointer-events-auto flex w-full items-center gap-3 rounded-2xl border border-zinc-200/80 bg-white/92 p-4 text-zinc-950 shadow-[0_20px_60px_-28px_rgba(15,23,42,0.45)] backdrop-blur supports-[backdrop-filter]:bg-white/85 dark:border-white/10 dark:bg-zinc-950/88 dark:text-zinc-50",
  content: "flex min-w-0 flex-1 flex-col gap-1",
  title: "text-sm font-semibold tracking-[-0.01em]",
  description: "text-sm leading-5 text-zinc-600 dark:text-zinc-400",
  icon: "flex h-5 w-5 shrink-0 items-center justify-center text-zinc-500 dark:text-zinc-400 [&_svg]:h-4 [&_svg]:w-4",
  loader: "flex h-5 w-5 shrink-0 items-center justify-center text-zinc-500 dark:text-zinc-400 [&_svg]:h-4 [&_svg]:w-4",
  success:
    "border-emerald-500/20 bg-emerald-50/88 text-emerald-950 dark:border-emerald-500/25 dark:bg-emerald-950/55 dark:text-emerald-50",
  error:
    "border-rose-500/25 bg-rose-50/88 text-rose-950 dark:border-rose-500/30 dark:bg-rose-950/55 dark:text-rose-50",
  warning:
    "border-amber-500/25 bg-amber-50/88 text-amber-950 dark:border-amber-500/30 dark:bg-amber-950/55 dark:text-amber-50",
  info:
    "border-sky-500/25 bg-sky-50/88 text-sky-950 dark:border-sky-500/30 dark:bg-sky-950/55 dark:text-sky-50",
  loading: "border-zinc-300/80 dark:border-white/10",
  default: "border-zinc-200/80 dark:border-white/10",
  closeButton:
    "rounded-full border border-zinc-200/80 bg-white/80 text-zinc-500 transition hover:bg-zinc-100 hover:text-zinc-900 dark:border-white/10 dark:bg-zinc-900/80 dark:text-zinc-400 dark:hover:bg-zinc-800 dark:hover:text-zinc-50",
  actionButton:
    "inline-flex h-8 items-center justify-center rounded-full bg-zinc-950 px-3 text-xs font-medium text-white transition hover:bg-zinc-800 dark:bg-zinc-100 dark:text-zinc-950 dark:hover:bg-zinc-200",
  cancelButton:
    "inline-flex h-8 items-center justify-center rounded-full border border-zinc-200 bg-white px-3 text-xs font-medium text-zinc-700 transition hover:bg-zinc-100 dark:border-white/10 dark:bg-zinc-900 dark:text-zinc-300 dark:hover:bg-zinc-800",
} as const;

export function AppToaster() {
  return (
    <Toaster
      theme="system"
      position="bottom-right"
      closeButton
      expand
      offset={16}
      visibleToasts={4}
      icons={{
        success: <CheckCircle2 />,
        error: <XCircle />,
        warning: <CircleAlert />,
        info: <Info />,
        loading: <LoaderCircle className="animate-spin" />,
      }}
      toastOptions={{
        unstyled: true,
        classNames: toastClassNames,
      }}
    />
  );
}
