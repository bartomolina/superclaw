# SuperClaw app patterns

## When something belongs in SuperClaw

Put work inside `apps/superclaw/` when it is part of the OpenClaw companion suite and shares one or more of these traits:
- same install story as Dashboard / Kanban / Extension
- same operator audience
- same machine/runtime assumptions as OpenClaw
- shared docs, auth, or workflow conventions

Examples:
- new dashboard surfaces
- new Kanban-adjacent tooling
- extension-related features
- suite-level install automation or companion utilities

## When something should be a separate app

Prefer a separate app under `apps/<app-name>/` when it is:
- not tightly coupled to the SuperClaw suite
- a standalone product or experiment
- agent-specific or domain-specific enough that it should not inherit the whole SuperClaw install/runtime contract

Do not put agent identity files, per-agent memory, or unrelated utilities into the SuperClaw repo just because they interact with OpenClaw.

## Default technical conventions

Follow local workspace defaults unless the user says otherwise:
- package manager: `pnpm`
- web apps: Next.js App Router
- styling: Tailwind CSS
- components: shadcn/ui
- local-first runtime
- no Docker by default

## Repo structure conventions

For SuperClaw web apps, prefer one app directory per product area.

Current pattern:
- `dashboard/` — Next.js app
- `kanban/` — Next.js app + Convex backend config/code
- `extension/` — browser extension
- `skills/` — repo copies of SuperClaw-related skills

Keep shared product-level docs at the repo root. Keep implementation details close to each app.

## Runtime conventions

- Document fixed ports centrally before adding/changing them.
- Document pm2 process names centrally before adding/changing them.
- Keep env examples checked in (`.env.example`, `.env.local.example`) when relevant.
- Prefer server-side OpenClaw/Gateway integration over exposing secrets to the browser.
- Avoid adding new infrastructure/services unless the user explicitly wants them.

## Skills and automation

If a SuperClaw workflow deserves an agent skill:
- keep a repo copy under `apps/superclaw/skills/`
- keep the active OpenClaw copy under `~/.openclaw/skills/`
- update install docs if the sync/install process changes
