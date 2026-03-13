"use client";

type ActivityEvent = {
  _id: string;
  actorId?: string;
  message: string;
  details?: string;
  createdAt: number;
};

function formatTime(timestamp: number) {
  return new Date(timestamp).toLocaleString([], {
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export function ActivitySheet({
  open,
  onClose,
  boardName,
  events,
  loading,
}: {
  open: boolean;
  onClose: () => void;
  boardName: string;
  events?: ActivityEvent[];
  loading?: boolean;
}) {
  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex justify-end bg-zinc-950/20" onClick={onClose}>
      <div
        className="h-full w-full max-w-2xl overflow-y-auto border-l border-zinc-200 bg-white p-4 dark:border-zinc-800 dark:bg-zinc-950"
        onClick={(event) => event.stopPropagation()}
      >
        <div className="mb-4 flex items-center justify-between gap-3 border-b border-zinc-200 pb-3 dark:border-zinc-800">
          <div>
            <div className="text-sm font-medium text-zinc-900 dark:text-zinc-100">Activity</div>
            <div className="text-xs text-zinc-500 dark:text-zinc-400">{boardName}</div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="text-sm text-zinc-500 transition hover:text-zinc-700 dark:text-zinc-400 dark:hover:text-zinc-200"
          >
            Close
          </button>
        </div>

        {loading ? (
          <div className="text-sm text-zinc-500 dark:text-zinc-400">Loading…</div>
        ) : !events || events.length === 0 ? (
          <div className="text-sm text-zinc-500 dark:text-zinc-400">No activity yet.</div>
        ) : (
          <div className="space-y-3">
            {events.map((event) => (
              <div key={event._id} className="border-b border-zinc-200 pb-3 last:border-b-0 dark:border-zinc-800">
                <div className="text-sm text-zinc-900 dark:text-zinc-100">{event.message}</div>
                {event.details ? (
                  <div className="mt-1 text-xs text-zinc-500 dark:text-zinc-400">{event.details}</div>
                ) : null}
                <div className="mt-1 text-[11px] text-zinc-500 dark:text-zinc-400">
                  {event.actorId ? `${event.actorId} · ` : ""}
                  {formatTime(event.createdAt)}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
