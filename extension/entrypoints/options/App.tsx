import { useState, useEffect } from "react";
import {
  apiUrl,
  apiToken,
  selectedBoard,
  theme,
} from "@/utils/storage";

type Theme = "light" | "dark" | "system";

export default function App() {
  const [url, setUrl] = useState("");
  const [token, setToken] = useState("");
  const [board, setBoard] = useState("");
  const [currentTheme, setCurrentTheme] = useState<Theme>("system");
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    (async () => {
      setUrl(await apiUrl.getValue());
      setToken(await apiToken.getValue());
      setBoard(await selectedBoard.getValue());
      setCurrentTheme(await theme.getValue());
    })();
  }, []);

  const handleSave = async () => {
    await apiUrl.setValue(url);
    await apiToken.setValue(token);
    await selectedBoard.setValue(board);
    await theme.setValue(currentTheme);
    setSaved(true);
    setTimeout(() => setSaved(false), 2000);
  };

  return (
    <div className="min-h-screen bg-zinc-50 text-zinc-900 flex items-start justify-center pt-16 px-4">
      <div className="w-full max-w-lg space-y-8">
        <div>
          <h1 className="text-3xl font-semibold tracking-tight">
            SuperClaw - Tagger
          </h1>
          <p className="mt-1 text-sm text-zinc-500">
            Configure your annotation backend and preferences.
          </p>
        </div>

        <div className="space-y-4">
          <Field label="API URL" id="api-url">
            <input
              id="api-url"
              type="url"
              value={url}
              onChange={(e) => setUrl(e.target.value)}
              placeholder="http://localhost:4101"
              className="w-full rounded-lg border border-zinc-300 bg-white px-3 py-2 text-sm shadow-sm outline-none transition-colors focus:border-blue-500 focus:ring-1 focus:ring-blue-500"
            />
          </Field>

          <Field label="API Token" id="api-token">
            <input
              id="api-token"
              type="password"
              value={token}
              onChange={(e) => setToken(e.target.value)}
              placeholder="Optional bearer token"
              className="w-full rounded-lg border border-zinc-300 bg-white px-3 py-2 text-sm shadow-sm outline-none transition-colors focus:border-blue-500 focus:ring-1 focus:ring-blue-500"
            />
          </Field>

          <Field label="Board ID" id="board-id">
            <input
              id="board-id"
              type="text"
              value={board}
              onChange={(e) => setBoard(e.target.value)}
              placeholder="Will be populated from backend in Phase 2"
              className="w-full rounded-lg border border-zinc-300 bg-white px-3 py-2 text-sm shadow-sm outline-none transition-colors focus:border-blue-500 focus:ring-1 focus:ring-blue-500"
            />
          </Field>

          <Field label="Theme" id="theme">
            <select
              id="theme"
              value={currentTheme}
              onChange={(e) => setCurrentTheme(e.target.value as Theme)}
              className="w-full rounded-lg border border-zinc-300 bg-white px-3 py-2 text-sm shadow-sm outline-none transition-colors focus:border-blue-500 focus:ring-1 focus:ring-blue-500"
            >
              <option value="system">System</option>
              <option value="light">Light</option>
              <option value="dark">Dark</option>
            </select>
          </Field>
        </div>

        <div className="flex items-center gap-3">
          <button
            onClick={handleSave}
            className="rounded-lg bg-zinc-900 px-4 py-2 text-sm font-medium text-white shadow-sm transition-colors hover:bg-zinc-800 disabled:opacity-50"
          >
            Save Settings
          </button>
          {saved && (
            <span className="text-sm text-green-600 font-medium">
              Saved!
            </span>
          )}
        </div>

        <p className="text-xs text-zinc-400">
          Backend integration is stubbed for now. Settings are saved to
          extension storage and will be used once the backend is wired up.
        </p>
      </div>
    </div>
  );
}

function Field({
  label,
  id,
  children,
}: {
  label: string;
  id: string;
  children: React.ReactNode;
}) {
  return (
    <div>
      <label htmlFor={id} className="block text-sm font-medium text-zinc-700 mb-1">
        {label}
      </label>
      {children}
    </div>
  );
}
