import type { ReactNode } from "react";

export function StateMessage({
  children,
  tone = "muted",
}: {
  children: ReactNode;
  tone?: "muted" | "error";
}) {
  return (
    <div
      className={
        tone === "error"
          ? "py-24 text-center text-sm text-amber-500 dark:text-amber-400"
          : "py-24 text-center text-sm text-zinc-400 dark:text-zinc-500"
      }
    >
      {children}
    </div>
  );
}
