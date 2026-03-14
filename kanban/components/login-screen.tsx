"use client";

import { useCallback, useState } from "react";

import { authClient } from "@/lib/auth-client";

export function LoginScreen({ errorMessage }: { errorMessage?: string }) {
  const [email, setEmail] = useState("");
  const [error, setError] = useState(errorMessage || "");
  const [loading, setLoading] = useState(false);
  const [sent, setSent] = useState(false);

  const handleSubmit = useCallback(async () => {
    const normalizedEmail = email.trim().toLowerCase();
    if (!normalizedEmail) return;

    setLoading(true);
    setError("");

    try {
      const { error: signInError } = await authClient.signIn.magicLink({
        email: normalizedEmail,
        callbackURL: "/",
      });

      if (signInError) {
        setError(signInError.message || "Could not send magic link");
        setSent(false);
        return;
      }

      setSent(true);
    } catch {
      setError("Connection failed");
      setSent(false);
    } finally {
      setLoading(false);
    }
  }, [email]);

  return (
    <div className="flex min-h-screen items-center justify-center bg-zinc-50 p-4 dark:bg-zinc-950">
      <div className="w-full max-w-sm">
        <div className="mb-8 text-center">
          <span className="text-4xl">🦞</span>
          <h1 className="mt-3 text-xl font-semibold text-zinc-900 dark:text-zinc-100">SuperClaw - Kanban</h1>
          <p className="mt-1 text-sm text-zinc-500">Sign in with a magic link</p>
        </div>

        <div className="rounded-xl border border-zinc-200 bg-white p-6 shadow-sm dark:border-zinc-800/60 dark:bg-zinc-900/80 dark:shadow-none">
          <div className="mb-4 text-xs font-medium uppercase tracking-wider text-zinc-400">Email</div>

          <input
            type="email"
            value={email}
            onChange={(event) => setEmail(event.target.value)}
            onKeyDown={(event) => event.key === "Enter" && void handleSubmit()}
            placeholder="you@domain.com"
            className="w-full rounded-lg border border-zinc-200 bg-zinc-50 px-3 py-2.5 text-sm text-zinc-900 outline-none placeholder:text-zinc-400 focus:ring-2 focus:ring-zinc-300 dark:border-zinc-800 dark:bg-zinc-950 dark:text-zinc-200 dark:placeholder:text-zinc-600 dark:focus:ring-zinc-700"
            autoFocus
          />

          {error ? <p className="mt-2 text-xs text-red-500">{error}</p> : null}
          {sent ? (
            <p className="mt-2 text-xs text-emerald-600 dark:text-emerald-400">
              If your email is allowed, you&apos;ll receive a sign-in link.
            </p>
          ) : null}

          <button
            onClick={() => void handleSubmit()}
            disabled={loading || !email.trim()}
            className="mt-4 w-full rounded-lg bg-zinc-900 px-4 py-2.5 text-sm font-medium text-white transition-colors hover:bg-zinc-800 disabled:opacity-50 dark:bg-zinc-100 dark:text-zinc-900 dark:hover:bg-zinc-200"
          >
            {loading ? "Sending..." : "Send magic link"}
          </button>
        </div>
      </div>
    </div>
  );
}
