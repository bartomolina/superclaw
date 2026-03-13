/* eslint-disable @typescript-eslint/no-explicit-any */
"use client";

import { useState } from "react";
import { X } from "lucide-react";
import { toast } from "sonner";

export interface ViewingFile {
  name: string;
  content: string;
  path: string;
}

interface FileViewerModalProps {
  file: ViewingFile;
  onClose: () => void;
  editable?: boolean;
  onSave?: (content: string) => Promise<void>;
  saveLabel?: string;
  successMessage?: string;
}

export function FileViewerModal({ file, onClose, editable, onSave, saveLabel, successMessage }: FileViewerModalProps) {
  const [content, setContent] = useState(file.content);
  const [dirty, setDirty] = useState(false);
  const [saving, setSaving] = useState(false);

  async function handleSave() {
    if (!onSave) return;
    setSaving(true);
    try {
      await onSave(content);
      toast.success(successMessage || `Saved ${file.name}`);
      onClose();
    } catch (e: any) {
      toast.error(e?.message || `Failed to save ${file.name}`);
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50" onClick={onClose}>
      <div
        className={`bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-xl shadow-xl w-full max-w-2xl flex flex-col m-4 ${editable ? "h-[80vh]" : "max-h-[80vh]"}`}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between px-5 py-3 border-b border-zinc-200 dark:border-zinc-800">
          <div>
            <h3 className="text-sm font-semibold text-zinc-800 dark:text-zinc-200">{file.name}</h3>
            <p className="text-[11px] text-zinc-400 font-mono">{file.path}</p>
          </div>
          <div className="flex items-center gap-2">
            {editable && dirty && (
              <button
                onClick={handleSave}
                disabled={saving}
                className="px-3 py-1 text-xs font-medium bg-zinc-900 dark:bg-zinc-100 text-white dark:text-zinc-900 rounded-md hover:bg-zinc-800 dark:hover:bg-zinc-200 transition-colors disabled:opacity-50"
              >
                {saving ? "Saving..." : saveLabel || "Save"}
              </button>
            )}
            <button
              onClick={onClose}
              className="p-1 rounded-md hover:bg-zinc-100 dark:hover:bg-zinc-800 text-zinc-400 hover:text-zinc-600 dark:hover:text-zinc-300"
            >
              <X size={16} />
            </button>
          </div>
        </div>
        {editable ? (
          <textarea
            value={content}
            onChange={(e) => {
              setContent(e.target.value);
              setDirty(true);
            }}
            spellCheck={false}
            className="flex-1 overflow-auto mx-5 my-4 p-0 bg-transparent text-xs font-mono text-zinc-700 dark:text-zinc-300 whitespace-pre resize-none focus:outline-none"
          />
        ) : (
          <pre className="flex-1 overflow-auto px-5 py-4 text-xs font-mono text-zinc-700 dark:text-zinc-300 whitespace-pre-wrap">
            {file.content}
          </pre>
        )}
      </div>
    </div>
  );
}
