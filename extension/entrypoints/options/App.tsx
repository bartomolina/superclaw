import { useEffect, useState } from "react";
import {
  extensionCredential,
  kanbanBaseUrl,
  selectedBoard,
  theme,
} from "@/utils/storage";
import { verifyExtensionConnection } from "@/utils/kanban";

type Theme = "light" | "dark" | "system";
type ConnectionState =
  | { status: "idle" }
  | { status: "verifying" }
  | {
      status: "success";
      user: {
        email: string;
        name?: string | null;
      };
      verifiedAt: number;
    }
  | {
      status: "error";
      message: string;
    };

export default function App() {
  const [url, setUrl] = useState("");
  const [token, setToken] = useState("");
  const [board, setBoard] = useState("");
  const [currentTheme, setCurrentTheme] = useState<Theme>("system");
  const [saved, setSaved] = useState(false);
  const [connection, setConnection] = useState<ConnectionState>({ status: "idle" });

  useEffect(() => {
    (async () => {
      setUrl(await kanbanBaseUrl.getValue());
      setToken(await extensionCredential.getValue());
      setBoard(await selectedBoard.getValue());
      setCurrentTheme(await theme.getValue());
    })();
  }, []);

  async function persistSettings(nextValues?: {
    url?: string;
    token?: string;
    board?: string;
    theme?: Theme;
  }) {
    await kanbanBaseUrl.setValue(nextValues?.url ?? url);
    await extensionCredential.setValue(nextValues?.token ?? token);
    await selectedBoard.setValue(nextValues?.board ?? board);
    await theme.setValue(nextValues?.theme ?? currentTheme);
  }

  const handleSave = async () => {
    await persistSettings();
    setSaved(true);
    setTimeout(() => setSaved(false), 2000);
  };

  const handleVerifyConnection = async () => {
    try {
      setConnection({ status: "verifying" });
      const result = await verifyExtensionConnection(url, token);
      setUrl(result.baseUrl);
      setToken(result.credential);
      await persistSettings({
        url: result.baseUrl,
        token: result.credential,
      });
      setConnection({
        status: "success",
        user: result.user,
        verifiedAt: result.verifiedAt,
      });
      setSaved(true);
      setTimeout(() => setSaved(false), 2000);
    } catch (error) {
      setConnection({
        status: "error",
        message: error instanceof Error ? error.message : "Connection failed",
      });
    }
  };

  return (
    <div className="min-h-screen bg-zinc-50 text-zinc-900 flex items-start justify-center pt-16 px-4">
      <div className="w-full max-w-lg space-y-8">
        <div>
          <h1 className="text-3xl font-semibold tracking-tight">
            SuperClaw - Tagger
          </h1>
          <p className="mt-1 text-sm text-zinc-500">
            Connect the extension to your Kanban app and save local preferences.
          </p>
        </div>

        <div className="rounded-xl border border-zinc-200 bg-white p-4 shadow-sm">
          <div className="text-sm font-medium text-zinc-900">
            Kanban connection
          </div>
          <p className="mt-1 text-xs text-zinc-500">
            Generate a credential from the Kanban app's Add Extension panel,
            then paste it here and verify the connection.
          </p>

          <div className="mt-4 space-y-4">
            <Field label="Kanban Base URL" id="kanban-base-url">
              <input
                id="kanban-base-url"
                type="url"
                value={url}
                onChange={(e) => {
                  setUrl(e.target.value);
                  if (connection.status !== "idle") {
                    setConnection({ status: "idle" });
                  }
                }}
                placeholder="http://localhost:3000"
                className="w-full rounded-lg border border-zinc-300 bg-white px-3 py-2 text-sm shadow-sm outline-none transition-colors focus:border-blue-500 focus:ring-1 focus:ring-blue-500"
              />
            </Field>

            <Field label="Extension Credential" id="extension-credential">
              <input
                id="extension-credential"
                type="password"
                value={token}
                onChange={(e) => {
                  setToken(e.target.value);
                  if (connection.status !== "idle") {
                    setConnection({ status: "idle" });
                  }
                }}
                placeholder="Paste the credential from Kanban"
                className="w-full rounded-lg border border-zinc-300 bg-white px-3 py-2 text-sm shadow-sm outline-none transition-colors focus:border-blue-500 focus:ring-1 focus:ring-blue-500"
              />
            </Field>

            <div className="flex items-center gap-3">
              <button
                onClick={handleVerifyConnection}
                className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white shadow-sm transition-colors hover:bg-blue-500 disabled:opacity-50"
                disabled={connection.status === "verifying"}
              >
                {connection.status === "verifying" ? "Verifying..." : "Verify Connection"}
              </button>

              {connection.status === "success" ? (
                <span className="text-sm font-medium text-green-600">
                  Connected as {connection.user.name || connection.user.email}
                </span>
              ) : null}
            </div>

            {connection.status === "success" ? (
              <p className="rounded-lg border border-green-200 bg-green-50 px-3 py-2 text-sm text-green-700">
                Verified at {new Date(connection.verifiedAt).toLocaleString()} for{" "}
                {connection.user.email}.
              </p>
            ) : null}

            {connection.status === "error" ? (
              <p className="rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-700">
                {connection.message}
              </p>
            ) : null}
          </div>
        </div>

        <div className="space-y-4">
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
          Phase 1 only verifies and stores the Kanban connection. Card
          submission and board syncing will be added later.
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
