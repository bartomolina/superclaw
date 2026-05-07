"use client";

import { useEffect, useMemo, useState } from "react";
import { ExternalLink } from "lucide-react";

import { authFetch } from "@/components/dashboard/auth";

type AppBookmark = {
  name: string;
  url: string;
  category: string;
  image?: string;
  icon?: string;
};

function appFallbackIcon(app: AppBookmark) {
  return app.icon || app.name.trim().slice(0, 1).toUpperCase() || "•";
}

export function AppsPage() {
  const [apps, setApps] = useState<AppBookmark[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;

    authFetch("/api/apps")
      .then((data) => {
        if (!cancelled) setApps(Array.isArray(data.apps) ? data.apps : []);
      })
      .catch((error) => {
        console.warn("Failed to load dashboard apps", error);
        if (!cancelled) setApps([]);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, []);

  const categories = useMemo(() => {
    const grouped = new Map<string, AppBookmark[]>();
    for (const app of apps) {
      const category = app.category.trim() || "Apps";
      grouped.set(category, [...(grouped.get(category) || []), app]);
    }
    return Array.from(grouped.entries()).map(([category, categoryApps]) => ({ category, apps: categoryApps }));
  }, [apps]);

  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-lg font-semibold text-zinc-800 dark:text-zinc-200">Apps</h1>
      </div>

      {loading ? (
        <div className="rounded-2xl border border-zinc-200 bg-white p-6 text-sm text-zinc-400 dark:border-zinc-800 dark:bg-zinc-950 dark:text-zinc-500">
          Loading apps...
        </div>
      ) : apps.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-zinc-200 bg-white p-8 text-center dark:border-zinc-800 dark:bg-zinc-950">
          <div className="text-sm font-medium text-zinc-700 dark:text-zinc-300">No apps yet</div>
          <div className="mt-1 text-sm text-zinc-400 dark:text-zinc-500">Add local bookmarks in dashboard/apps.local.json.</div>
        </div>
      ) : (
        <div className="space-y-8">
          {categories.map(({ category, apps: categoryApps }) => (
            <section key={category} className="space-y-3">
              <h2 className="text-sm font-semibold text-zinc-500 dark:text-zinc-400">{category}</h2>
              <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                {categoryApps.map((app) => (
                  <a
                    key={`${app.name}-${app.url}`}
                    href={app.url}
                    target="_blank"
                    rel="noreferrer"
                    className="group flex items-center gap-3 rounded-2xl border border-zinc-200 bg-white p-4 transition-colors hover:border-zinc-300 hover:bg-zinc-50 dark:border-zinc-800 dark:bg-zinc-950 dark:hover:border-zinc-700 dark:hover:bg-zinc-900/60"
                  >
                    <div className="flex h-10 w-10 shrink-0 items-center justify-center overflow-hidden rounded-xl bg-zinc-100 text-xl font-semibold text-zinc-700 dark:bg-zinc-900 dark:text-zinc-200">
                      {app.image ? (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img src={app.image} alt="" className="h-full w-full object-cover" aria-hidden="true" />
                      ) : (
                        appFallbackIcon(app)
                      )}
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className="truncate text-sm font-semibold text-zinc-800 dark:text-zinc-200">{app.name}</div>
                      <div className="truncate text-xs text-zinc-400 dark:text-zinc-500">{app.url}</div>
                    </div>
                    <ExternalLink className="h-4 w-4 shrink-0 text-zinc-300 transition-colors group-hover:text-zinc-500 dark:text-zinc-600 dark:group-hover:text-zinc-400" />
                  </a>
                ))}
              </div>
            </section>
          ))}
        </div>
      )}
    </div>
  );
}
