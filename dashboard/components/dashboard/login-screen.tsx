"use client";

import { useCallback, useState } from "react";
import { Lock } from "lucide-react";
import { toast } from "sonner";

export function LoginScreen({ onLogin }: { onLogin: (token: string) => void }) {
  const [token, setTokenInput] = useState("");
  const [loading, setLoading] = useState(false);

  const handleSubmit = useCallback(
    async (t?: string) => {
      const tokenVal = (t || token).trim();
      if (!tokenVal) return;
      setLoading(true);
      try {
        const res = await fetch("/api/auth/verify", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ token: tokenVal }),
        });
        const data = await res.json();
        if (data.ok) {
          onLogin(tokenVal);
        } else {
          toast.error("Invalid token");
        }
      } catch {
        toast.error("Connection failed");
      } finally {
        setLoading(false);
      }
    },
    [onLogin, token]
  );

  return (
    <div className="min-h-screen bg-zinc-50 dark:bg-zinc-950 flex items-center justify-center p-4">
      <div className="w-full max-w-sm">
        <div className="text-center mb-8">
          <span className="text-4xl">🦞</span>
          <h1 className="text-xl font-semibold text-zinc-900 dark:text-zinc-100 mt-3">SuperClaw Dashboard</h1>
          <p className="text-sm text-zinc-500 mt-1">Enter your gateway token to continue</p>
        </div>
        <div className="bg-white dark:bg-zinc-900/80 border border-zinc-200 dark:border-zinc-800/60 rounded-xl p-6 shadow-sm dark:shadow-none">
          <div className="flex items-center gap-2 mb-4 text-zinc-400">
            <Lock size={14} />
            <span className="text-xs font-medium uppercase tracking-wider">Gateway Token</span>
          </div>
          <input
            type="password"
            value={token}
            onChange={(e) => setTokenInput(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && handleSubmit()}
            placeholder="Paste token here..."
            className="w-full px-3 py-2.5 bg-zinc-50 dark:bg-zinc-950 border border-zinc-200 dark:border-zinc-800 rounded-lg text-sm text-zinc-900 dark:text-zinc-200 placeholder:text-zinc-400 dark:placeholder:text-zinc-600 focus:outline-none focus:ring-2 focus:ring-zinc-300 dark:focus:ring-zinc-700 font-mono"
            autoFocus
          />
          <button
            onClick={() => handleSubmit()}
            disabled={loading || !token.trim()}
            className="w-full mt-4 px-4 py-2.5 bg-zinc-900 dark:bg-zinc-100 text-white dark:text-zinc-900 text-sm font-medium rounded-lg hover:bg-zinc-800 dark:hover:bg-zinc-200 transition-colors disabled:opacity-50"
          >
            {loading ? "Verifying..." : "Connect"}
          </button>
        </div>
      </div>
    </div>
  );
}
