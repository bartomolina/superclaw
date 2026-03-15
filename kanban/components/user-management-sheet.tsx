"use client";

import { Trash2 } from "lucide-react";
import { useMutation, useQuery } from "convex/react";
import type { FormEvent } from "react";
import { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";

import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";

const inputClass =
  "w-full rounded-lg border border-zinc-200 bg-zinc-50 px-3 py-2 text-sm text-zinc-900 outline-none placeholder:text-zinc-400 transition focus:ring-2 focus:ring-zinc-300 dark:border-zinc-800 dark:bg-zinc-950 dark:text-zinc-200 dark:placeholder:text-zinc-600 dark:focus:ring-zinc-700";
const primaryButtonClass =
  "inline-flex items-center justify-center rounded-lg bg-zinc-900 px-3 py-2 text-sm font-medium text-white transition hover:bg-zinc-800 disabled:cursor-not-allowed disabled:opacity-50 dark:bg-zinc-100 dark:text-zinc-900 dark:hover:bg-zinc-200";

type ManagedUser = {
  _id: Id<"managedUsers">;
  name: string;
  email: string;
  createdAt: number;
  updatedAt: number;
};

type SuperuserProfile = {
  email: string;
  name: string;
  hasCustomName: boolean;
  createdAt: number;
  updatedAt: number;
};

function formatTimestamp(timestamp: number) {
  return new Date(timestamp).toLocaleString([], {
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export function UserManagementSheet({
  open,
  onClose,
}: {
  open: boolean;
  onClose: () => void;
}) {
  const users = useQuery(api.users.list, open ? {} : "skip") as ManagedUser[] | undefined;
  const superuserProfile = useQuery(api.users.superuserProfile, open ? {} : "skip") as
    | SuperuserProfile
    | undefined;
  const upsertUser = useMutation(api.users.upsert);
  const removeUser = useMutation(api.users.remove);
  const setSuperuserProfile = useMutation(api.users.setSuperuserProfile);
  const [superuserName, setSuperuserName] = useState("");
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [isSavingSuperuser, setIsSavingSuperuser] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [removingId, setRemovingId] = useState<string | null>(null);

  useEffect(() => {
    if (superuserProfile?.name) {
      setSuperuserName(superuserProfile.name);
    }
  }, [superuserProfile?.name]);

  const sortedUsers = useMemo(
    () =>
      [...(users ?? [])].sort((a, b) => {
        const byName = a.name.localeCompare(b.name, undefined, { sensitivity: "base" });
        if (byName !== 0) return byName;
        return a.email.localeCompare(b.email, undefined, { sensitivity: "base" });
      }),
    [users],
  );

  if (!open) {
    return null;
  }

  async function handleSuperuserSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (isSavingSuperuser) {
      return;
    }

    try {
      setIsSavingSuperuser(true);
      await setSuperuserProfile({ name: superuserName });
      toast.success("Superuser name saved.");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Could not save superuser name.");
    } finally {
      setIsSavingSuperuser(false);
    }
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (isSaving) {
      return;
    }

    try {
      setIsSaving(true);
      await upsertUser({ name, email });
      setName("");
      setEmail("");
      toast.success("User saved.");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Could not save user.");
    } finally {
      setIsSaving(false);
    }
  }

  async function handleRemove(userId: Id<"managedUsers">) {
    try {
      setRemovingId(String(userId));
      await removeUser({ userId });
      toast.success("User removed.");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Could not remove user.");
    } finally {
      setRemovingId(null);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex justify-end bg-zinc-950/20" onClick={onClose}>
      <div
        className="h-full w-full max-w-xl overflow-y-auto border-l border-zinc-200 bg-white p-4 dark:border-zinc-800 dark:bg-zinc-950"
        onClick={(event) => event.stopPropagation()}
      >
        <div className="mb-4 flex items-center justify-between gap-3 border-b border-zinc-200 pb-3 dark:border-zinc-800">
          <div>
            <div className="text-sm font-medium text-zinc-900 dark:text-zinc-100">Users</div>
            <div className="text-xs text-zinc-500 dark:text-zinc-400">
              Manage member access.
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="text-sm text-zinc-500 transition hover:text-zinc-700 dark:text-zinc-400 dark:hover:text-zinc-200"
          >
            Close
          </button>
        </div>

        <form
          onSubmit={handleSuperuserSubmit}
          className="border-b border-zinc-200 pb-4 dark:border-zinc-800"
        >
          <div className="mb-3">
            <div className="text-sm font-medium text-zinc-900 dark:text-zinc-100">Superuser</div>
            <div className="text-xs text-zinc-500 dark:text-zinc-400">
              Set the name shown for the superuser in the app and card discussions.
            </div>
          </div>

          <div className="grid gap-3 sm:grid-cols-[minmax(0,1fr)_minmax(0,1fr)_auto] sm:items-end">
            <label className="space-y-1.5">
              <div className="text-xs font-medium uppercase tracking-wide text-zinc-500 dark:text-zinc-400">
                Name
              </div>
              <input
                className={inputClass}
                value={superuserName}
                onChange={(event) => setSuperuserName(event.target.value)}
                placeholder="Barto"
                autoComplete="name"
              />
            </label>

            <label className="space-y-1.5">
              <div className="text-xs font-medium uppercase tracking-wide text-zinc-500 dark:text-zinc-400">
                Email
              </div>
              <input
                className={inputClass}
                value={superuserProfile?.email ?? ""}
                readOnly
                disabled
              />
            </label>

            <button
              type="submit"
              className={`${primaryButtonClass} h-10 whitespace-nowrap px-4`}
              disabled={isSavingSuperuser || !superuserProfile}
            >
              {isSavingSuperuser ? "Saving…" : "Save name"}
            </button>
          </div>
        </form>

        <form
          onSubmit={handleSubmit}
          className="border-b border-zinc-200 py-4 dark:border-zinc-800"
        >
          <div className="mb-3">
            <div className="text-sm font-medium text-zinc-900 dark:text-zinc-100">Invited members</div>
            <div className="text-xs text-zinc-500 dark:text-zinc-400">
              Add or remove people who can sign in.
            </div>
          </div>

          <div className="grid gap-3 sm:grid-cols-[minmax(0,1fr)_minmax(0,1fr)_auto] sm:items-end">
            <label className="space-y-1.5">
              <div className="text-xs font-medium uppercase tracking-wide text-zinc-500 dark:text-zinc-400">
                Name
              </div>
              <input
                className={inputClass}
                value={name}
                onChange={(event) => setName(event.target.value)}
                placeholder="Jane Doe"
                autoComplete="name"
              />
            </label>

            <label className="space-y-1.5">
              <div className="text-xs font-medium uppercase tracking-wide text-zinc-500 dark:text-zinc-400">
                Email
              </div>
              <input
                className={inputClass}
                type="email"
                value={email}
                onChange={(event) => setEmail(event.target.value)}
                placeholder="jane@example.com"
                autoComplete="email"
                required
              />
            </label>

            <button
              type="submit"
              className={`${primaryButtonClass} h-10 whitespace-nowrap px-4`}
              disabled={isSaving || !email.trim()}
            >
              {isSaving ? "Saving…" : "Invite user"}
            </button>
          </div>
        </form>

        <div className="mt-5 space-y-3">
          <div className="flex items-center justify-between gap-3">
            <div className="text-sm font-medium text-zinc-900 dark:text-zinc-100">Saved users</div>
            <div className="text-xs text-zinc-500 dark:text-zinc-400">
              {users === undefined ? "Loading…" : `${sortedUsers.length} total`}
            </div>
          </div>

          {users === undefined ? (
            <div className="text-sm text-zinc-500 dark:text-zinc-400">Loading users…</div>
          ) : sortedUsers.length === 0 ? (
            <div className="rounded-xl border border-dashed border-zinc-200 px-4 py-6 text-sm text-zinc-500 dark:border-zinc-800 dark:text-zinc-400">
              No users yet.
            </div>
          ) : (
            <div className="space-y-2">
              {sortedUsers.map((user) => {
                const isRemoving = removingId === String(user._id);

                return (
                  <div
                    key={user._id}
                    className="flex items-center justify-between gap-3 rounded-xl border border-zinc-200 bg-white px-4 py-3 dark:border-zinc-800 dark:bg-zinc-900/40"
                  >
                    <div className="min-w-0">
                      <div className="truncate text-sm font-medium text-zinc-900 dark:text-zinc-100">
                        {user.name}
                      </div>
                      <div className="truncate text-sm text-zinc-600 dark:text-zinc-300">
                        {user.email}
                      </div>
                      <div className="mt-1 text-[11px] text-zinc-500 dark:text-zinc-400">
                        Updated {formatTimestamp(user.updatedAt)}
                      </div>
                    </div>

                    <button
                      type="button"
                      onClick={() => void handleRemove(user._id)}
                      disabled={isRemoving}
                      className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-md border border-zinc-200 text-zinc-500 transition hover:border-red-200 hover:bg-red-50 hover:text-red-600 disabled:cursor-not-allowed disabled:opacity-50 dark:border-zinc-800 dark:text-zinc-400 dark:hover:border-red-900/60 dark:hover:bg-red-950/40 dark:hover:text-red-300"
                      title="Remove user"
                      aria-label={`Remove ${user.name}`}
                    >
                      <Trash2 className="h-4 w-4" />
                    </button>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
