"use client";

import { Copy, Eye, EyeOff, PlugZap, RefreshCw, Trash2 } from "lucide-react";
import { useMutation, useQuery } from "convex/react";
import { useEffect, useState } from "react";
import { toast } from "sonner";

import { api } from "@/convex/_generated/api";

const inputClass =
  "w-full rounded-lg border border-zinc-200 bg-zinc-50 px-3 py-2 text-sm text-zinc-900 outline-none placeholder:text-zinc-400 transition focus:ring-2 focus:ring-zinc-300 dark:border-zinc-800 dark:bg-zinc-950 dark:text-zinc-200 dark:placeholder:text-zinc-600 dark:focus:ring-zinc-700";
const primaryButtonClass =
  "inline-flex items-center justify-center rounded-lg bg-zinc-900 px-3 py-2 text-sm font-medium text-white transition hover:bg-zinc-800 disabled:cursor-not-allowed disabled:opacity-50 dark:bg-zinc-100 dark:text-zinc-900 dark:hover:bg-zinc-200";

type ExtensionCredentialStatus = {
  hasCredential: boolean;
  preview: string | null;
  createdAt: number | null;
  updatedAt: number | null;
  lastVerifiedAt: number | null;
};

function formatTimestamp(timestamp: number | null) {
  if (!timestamp) {
    return "Never";
  }

  return new Date(timestamp).toLocaleString([], {
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function createExtensionCredential() {
  const bytes = new Uint8Array(24);
  crypto.getRandomValues(bytes);

  return `scx_${Array.from(bytes, (value) => value.toString(16).padStart(2, "0")).join("")}`;
}

export function ExtensionAccessSheet({
  open,
  onClose,
}: {
  open: boolean;
  onClose: () => void;
}) {
  const status = useQuery(api.extension_auth.status, open ? {} : "skip") as
    | ExtensionCredentialStatus
    | undefined;
  const saveCredential = useMutation(api.extension_auth.saveCredential);
  const revokeCredential = useMutation(api.extension_auth.revokeCredential);
  const [baseUrl, setBaseUrl] = useState("");
  const [generatedCredential, setGeneratedCredential] = useState("");
  const [showCredential, setShowCredential] = useState(true);
  const [isGenerating, setIsGenerating] = useState(false);
  const [isRevoking, setIsRevoking] = useState(false);
  const [copiedValue, setCopiedValue] = useState<"base" | "credential" | null>(null);

  useEffect(() => {
    if (typeof window !== "undefined") {
      setBaseUrl(window.location.origin);
    }
  }, []);

  useEffect(() => {
    if (!open) {
      setGeneratedCredential("");
      setShowCredential(true);
      setCopiedValue(null);
    }
  }, [open]);

  if (!open) {
    return null;
  }

  async function copyValue(value: string, label: "base" | "credential") {
    try {
      await navigator.clipboard.writeText(value);
      setCopiedValue(label);
      window.setTimeout(() => {
        setCopiedValue((current) => (current === label ? null : current));
      }, 1_500);
    } catch {
      toast.error("Could not copy to clipboard.");
    }
  }

  async function handleGenerate() {
    if (isGenerating) {
      return;
    }

    try {
      setIsGenerating(true);
      const nextCredential = createExtensionCredential();
      await saveCredential({ token: nextCredential });
      setGeneratedCredential(nextCredential);
      setShowCredential(true);
      toast.success(status?.hasCredential ? "Extension credential replaced." : "Extension credential created.");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Could not save extension credential.");
    } finally {
      setIsGenerating(false);
    }
  }

  async function handleRevoke() {
    if (isRevoking) {
      return;
    }

    if (!window.confirm("Revoke the current extension credential? The extension will stop connecting until you generate a new one.")) {
      return;
    }

    try {
      setIsRevoking(true);
      await revokeCredential({});
      setGeneratedCredential("");
      setCopiedValue(null);
      toast.success("Extension credential revoked.");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Could not revoke extension credential.");
    } finally {
      setIsRevoking(false);
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
            <div className="text-sm font-medium text-zinc-900 dark:text-zinc-100">Connect Extension</div>
            <div className="text-xs text-zinc-500 dark:text-zinc-400">
              Generate a per-user credential for the browser extension.
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

        <div className="rounded-xl border border-zinc-200 bg-zinc-50/70 p-4 dark:border-zinc-800 dark:bg-zinc-900/60">
          <div className="flex items-start gap-3">
            <div className="rounded-lg bg-white p-2 text-zinc-700 shadow-sm dark:bg-zinc-950 dark:text-zinc-200">
              <PlugZap className="h-4 w-4" />
            </div>
            <div className="min-w-0 flex-1">
              <div className="text-sm font-medium text-zinc-900 dark:text-zinc-100">
                {status === undefined ? "Checking credential..." : status.hasCredential ? "Credential active" : "No credential yet"}
              </div>
              <div className="mt-1 text-xs text-zinc-500 dark:text-zinc-400">
                {status?.hasCredential
                  ? `Stored as ${status.preview}. Last verified ${formatTimestamp(status.lastVerifiedAt)}.`
                  : "Generate a credential, copy it once, then paste it into the extension settings page."}
              </div>
            </div>
          </div>

          {status?.hasCredential ? (
            <div className="mt-3 grid gap-2 text-xs text-zinc-500 dark:text-zinc-400 sm:grid-cols-3">
              <div>
                <div className="font-medium uppercase tracking-wide">Created</div>
                <div className="mt-1">{formatTimestamp(status.createdAt)}</div>
              </div>
              <div>
                <div className="font-medium uppercase tracking-wide">Last replaced</div>
                <div className="mt-1">{formatTimestamp(status.updatedAt)}</div>
              </div>
              <div>
                <div className="font-medium uppercase tracking-wide">Last verified</div>
                <div className="mt-1">{formatTimestamp(status.lastVerifiedAt)}</div>
              </div>
            </div>
          ) : null}
        </div>

        <div className="mt-4 rounded-xl border border-amber-200 bg-amber-50 p-4 dark:border-amber-900/70 dark:bg-amber-950/30">
          <div className="text-sm font-medium text-amber-950 dark:text-amber-200">Shown once after generation</div>
          <div className="mt-1 text-xs text-amber-800 dark:text-amber-300">
            The full credential is never shown again after you close this panel. If you lose it, generate a new one.
          </div>

          {generatedCredential ? (
            <div className="mt-3 space-y-3">
              <label className="block space-y-1.5">
                <div className="text-xs font-medium uppercase tracking-wide text-amber-900 dark:text-amber-200">
                  Extension credential
                </div>
                <div className="flex gap-2">
                  <input
                    className={inputClass}
                    type={showCredential ? "text" : "password"}
                    readOnly
                    value={generatedCredential}
                  />
                  <button
                    type="button"
                    onClick={() => setShowCredential((current) => !current)}
                    className="inline-flex h-10 w-10 items-center justify-center rounded-lg border border-amber-200 text-amber-900 transition hover:bg-amber-100 dark:border-amber-900/70 dark:text-amber-200 dark:hover:bg-amber-900/30"
                    aria-label={showCredential ? "Hide extension credential" : "Show extension credential"}
                  >
                    {showCredential ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                  </button>
                  <button
                    type="button"
                    onClick={() => void copyValue(generatedCredential, "credential")}
                    className="inline-flex h-10 items-center gap-2 rounded-lg border border-amber-200 px-3 text-sm font-medium text-amber-900 transition hover:bg-amber-100 dark:border-amber-900/70 dark:text-amber-200 dark:hover:bg-amber-900/30"
                  >
                    <Copy className="h-4 w-4" />
                    {copiedValue === "credential" ? "Copied" : "Copy"}
                  </button>
                </div>
              </label>
            </div>
          ) : null}
        </div>

        <div className="mt-4 rounded-xl border border-zinc-200 p-4 dark:border-zinc-800">
          <div className="text-sm font-medium text-zinc-900 dark:text-zinc-100">Extension settings</div>
          <div className="mt-1 text-xs text-zinc-500 dark:text-zinc-400">
            Paste this base URL and the generated credential into the extension settings page, then use Verify connection there.
          </div>

          <label className="mt-3 block space-y-1.5">
            <div className="text-xs font-medium uppercase tracking-wide text-zinc-500 dark:text-zinc-400">
              Kanban base URL
            </div>
            <div className="flex gap-2">
              <input className={inputClass} readOnly value={baseUrl} />
              <button
                type="button"
                onClick={() => void copyValue(baseUrl, "base")}
                className="inline-flex h-10 items-center gap-2 rounded-lg border border-zinc-200 px-3 text-sm font-medium text-zinc-700 transition hover:bg-zinc-100 dark:border-zinc-800 dark:text-zinc-200 dark:hover:bg-zinc-900"
              >
                <Copy className="h-4 w-4" />
                {copiedValue === "base" ? "Copied" : "Copy"}
              </button>
            </div>
          </label>
        </div>

        <div className="mt-4 flex flex-wrap items-center gap-3">
          <button
            type="button"
            onClick={() => void handleGenerate()}
            className={primaryButtonClass}
            disabled={isGenerating}
          >
            {isGenerating ? (
              <>
                <RefreshCw className="mr-2 h-4 w-4 animate-spin" />
                Saving...
              </>
            ) : status?.hasCredential ? (
              "Replace credential"
            ) : (
              "Generate credential"
            )}
          </button>

          <button
            type="button"
            onClick={() => void handleRevoke()}
            className="inline-flex items-center justify-center gap-2 rounded-lg border border-rose-200 px-3 py-2 text-sm font-medium text-rose-700 transition hover:bg-rose-50 disabled:cursor-not-allowed disabled:opacity-50 dark:border-rose-900/60 dark:text-rose-300 dark:hover:bg-rose-950/30"
            disabled={isRevoking || !status?.hasCredential}
          >
            <Trash2 className="h-4 w-4" />
            {isRevoking ? "Revoking..." : "Revoke credential"}
          </button>
        </div>
      </div>
    </div>
  );
}
