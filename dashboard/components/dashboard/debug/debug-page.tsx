/* eslint-disable @typescript-eslint/no-explicit-any */
"use client";

import { useState } from "react";
import { Check, Copy, Play, Terminal } from "lucide-react";

import { authHeaders } from "@/components/dashboard/auth";
import { WS_METHODS } from "./utils";

export function DebugPage() {
  const [method, setMethod] = useState(WS_METHODS[0].method);
  const [params, setParams] = useState(WS_METHODS[0].params);
  const [result, setResult] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  function handleMethodChange(m: string) {
    setMethod(m);
    const preset = WS_METHODS.find((w) => w.method === m);
    if (preset) setParams(preset.params);
    setResult(null);
    setError(null);
  }

  async function handleSend() {
    setLoading(true);
    setError(null);
    setResult(null);
    try {
      let parsedParams = {};
      try {
        parsedParams = JSON.parse(params);
      } catch {
        throw new Error("Invalid JSON params");
      }
      const res = await fetch("/api/debug/ws", {
        method: "POST",
        headers: { "Content-Type": "application/json", ...authHeaders() },
        body: JSON.stringify({ method, params: parsedParams }),
      });
      const data = await res.json();
      if (data.ok) {
        setResult(JSON.stringify(data.result, null, 2));
      } else {
        setError(data.error || "Request failed");
      }
    } catch (e: any) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  }

  function handleCopy() {
    if (result) {
      navigator.clipboard.writeText(result);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    }
  }

  return (
    <div className="space-y-4">
      <div className="bg-white dark:bg-zinc-900/80 border border-zinc-200 dark:border-zinc-800/60 rounded-xl overflow-hidden shadow-sm dark:shadow-none">
        <div className="p-5 space-y-3">
          <h2 className="text-sm font-semibold text-zinc-700 dark:text-zinc-300 flex items-center gap-2">
            <Terminal size={14} /> Gateway WS Explorer
          </h2>
          <div className="flex gap-2">
            <select
              value={method}
              onChange={(e) => handleMethodChange(e.target.value)}
              className="flex-1 px-3 py-2 bg-zinc-50 dark:bg-zinc-950 border border-zinc-200 dark:border-zinc-800 rounded-lg text-sm text-zinc-900 dark:text-zinc-200 focus:outline-none focus:ring-2 focus:ring-zinc-300 dark:focus:ring-zinc-700"
            >
              {WS_METHODS.map((w) => (
                <option key={w.method} value={w.method}>
                  {w.method}
                </option>
              ))}
            </select>
            <button
              onClick={handleSend}
              disabled={loading || !method.trim()}
              className="px-4 py-2 bg-zinc-900 dark:bg-zinc-100 text-white dark:text-zinc-900 text-sm font-medium rounded-lg hover:bg-zinc-800 dark:hover:bg-zinc-200 transition-colors disabled:opacity-50 flex items-center gap-1.5"
            >
              <Play size={12} />
              {loading ? "Sending..." : "Send"}
            </button>
          </div>
          <div>
            <label className="text-[11px] text-zinc-400 uppercase tracking-wider font-medium mb-1 block">
              Params (JSON)
            </label>
            <textarea
              value={params}
              onChange={(e) => setParams(e.target.value)}
              rows={2}
              className="w-full px-3 py-2 bg-zinc-50 dark:bg-zinc-950 border border-zinc-200 dark:border-zinc-800 rounded-lg text-sm font-mono text-zinc-900 dark:text-zinc-200 focus:outline-none focus:ring-2 focus:ring-zinc-300 dark:focus:ring-zinc-700 resize-y"
            />
          </div>
          {error && (
            <div className="px-3 py-2 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800/40 rounded-lg text-sm text-red-600 dark:text-red-400">
              {error}
            </div>
          )}
          {result && (
            <div className="relative">
              <button
                onClick={handleCopy}
                className="absolute top-2 right-2 p-1.5 rounded-md bg-zinc-200 dark:bg-zinc-800 text-zinc-500 hover:text-zinc-700 dark:hover:text-zinc-300 transition-colors"
                title="Copy"
              >
                {copied ? <Check size={12} /> : <Copy size={12} />}
              </button>
              <pre className="px-4 py-3 bg-zinc-50 dark:bg-zinc-950 border border-zinc-200 dark:border-zinc-800 rounded-lg text-xs font-mono text-zinc-700 dark:text-zinc-300 overflow-auto max-h-[60vh] whitespace-pre-wrap">
                {result}
              </pre>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
