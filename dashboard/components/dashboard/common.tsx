import { Circle } from "lucide-react";

export function StatusDot({ active }: { active: boolean }) {
  return (
    <Circle
      size={8}
      className={active ? "fill-green-500 text-green-500" : "fill-zinc-400 dark:fill-zinc-600 text-zinc-400 dark:text-zinc-600"}
    />
  );
}

export function ComingSoon({ title }: { title: string }) {
  return (
    <div className="text-center py-24">
      <div className="text-zinc-300 dark:text-zinc-600 text-4xl mb-4">🚧</div>
      <h2 className="text-lg font-semibold text-zinc-700 dark:text-zinc-300 mb-1">{title}</h2>
      <p className="text-sm text-zinc-400 dark:text-zinc-500">Coming soon</p>
    </div>
  );
}
