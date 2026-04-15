"use client";

import type { Id } from "@/convex/_generated/dataModel";

type ArchivedCard = {
  _id: Id<"cards">;
  title: string;
  description?: string;
  updatedAt?: number;
};

function formatTime(timestamp?: number) {
  if (!timestamp) return null;

  return new Date(timestamp).toLocaleString([], {
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export function ArchiveSheet({
  open,
  onClose,
  boardName,
  cards,
  onOpenCard,
}: {
  open: boolean;
  onClose: () => void;
  boardName: string;
  cards: ArchivedCard[];
  onOpenCard: (cardId: Id<"cards">) => void;
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
            <div className="text-sm font-medium text-zinc-900 dark:text-zinc-100">Archive</div>
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

        {cards.length === 0 ? (
          <div className="text-sm text-zinc-500 dark:text-zinc-400">No archived cards.</div>
        ) : (
          <div className="space-y-3">
            {cards.map((card) => (
              <button
                key={card._id}
                type="button"
                onClick={() => {
                  onOpenCard(card._id);
                  onClose();
                }}
                className="block w-full rounded-xl border border-zinc-200 p-3 text-left transition hover:border-zinc-300 hover:bg-zinc-50 dark:border-zinc-800 dark:hover:border-zinc-700 dark:hover:bg-zinc-900"
              >
                <div className="text-sm font-medium text-zinc-900 dark:text-zinc-100">{card.title}</div>
                {card.description ? (
                  <div className="mt-1 whitespace-pre-line text-xs text-zinc-500 dark:text-zinc-400">
                    {card.description}
                  </div>
                ) : null}
                {formatTime(card.updatedAt) ? (
                  <div className="mt-2 text-[11px] text-zinc-500 dark:text-zinc-400">
                    Last updated {formatTime(card.updatedAt)}
                  </div>
                ) : null}
              </button>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
