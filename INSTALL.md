# SuperClaw Install Guide

This guide is for people who already have **OpenClaw working**.

Install location:
- `~/.openclaw/workspace/apps/superclaw/`

Default local URLs:
- Dashboard: `http://127.0.0.1:4000`
- Kanban: `http://127.0.0.1:4100`

Default pm2 names:
- `superclaw-dashboard`
- `convex`
- `superclaw-kanban`

## Prerequisites

You should already have:
- OpenClaw
- Node.js + pnpm
- pm2
- a Convex project/deployment for Kanban
- a Resend API key for Kanban magic-link email

## 1) Dashboard

```bash
cd ~/.openclaw/workspace/apps/superclaw/dashboard
pnpm install
cp .env.example .env
```

Set at least:
- `GATEWAY_TOKEN`

Start it:

```bash
pm2 start bash --name superclaw-dashboard --cwd ~/.openclaw/workspace/apps/superclaw/dashboard -- -lc 'pnpm exec next dev --hostname 127.0.0.1 --port 4000'
```

## 2) Kanban

```bash
cd ~/.openclaw/workspace/apps/superclaw/kanban
pnpm install
cp .env.local.example .env.local
```

Set local env values in `.env.local`:
- `CONVEX_DEPLOYMENT`
- `NEXT_PUBLIC_CONVEX_URL`
- `NEXT_PUBLIC_CONVEX_SITE_URL`
- `NEXT_PUBLIC_SITE_URL=http://127.0.0.1:4100`
- `GATEWAY_TOKEN`

### Convex

You do **not** create tables manually.
A fresh Convex deployment is fine — schema/functions are created from the repo when Convex sync runs.

Set the required Convex env vars:

```bash
pnpm exec convex env set BETTER_AUTH_SECRET "$(openssl rand -base64 32)"
pnpm exec convex env set SITE_URL http://127.0.0.1:4100
pnpm exec convex env set SUPERUSER_EMAIL you@example.com
pnpm exec convex env set RESEND_API_KEY <your_resend_api_key>
pnpm exec convex env set AUTH_FROM_EMAIL "SuperClaw <noreply@mail.your-domain.com>"
pnpm exec convex env set KANBAN_AGENT_SHARED_TOKEN "$(openssl rand -hex 24)"
```

Optional:

```bash
pnpm exec convex env set TRUSTED_ORIGINS "http://127.0.0.1:4100,http://localhost:4100"
pnpm exec convex env set MAGIC_LINK_EMAIL_COOLDOWN_MS 120000
pnpm exec convex env set MAGIC_LINK_GLOBAL_COOLDOWN_MS 5000
```

Start Convex sync:

```bash
pm2 start bash --name convex --cwd ~/.openclaw/workspace/apps/superclaw/kanban -- -lc 'pnpm exec convex dev'
```

Start Kanban:

```bash
pm2 start bash --name superclaw-kanban --cwd ~/.openclaw/workspace/apps/superclaw/kanban -- -lc 'pnpm exec next dev --hostname 127.0.0.1 --port 4100'
```

## 3) Save pm2 state

```bash
pm2 save
pm2 status
```

Then open:
- `http://127.0.0.1:4000`
- `http://127.0.0.1:4100`

## 4) Install the accompanying agent skills

SuperClaw keeps repo copies of its OpenClaw skills under `skills/`.
Sync them into your active OpenClaw skills directory:

```bash
mkdir -p ~/.openclaw/skills
rsync -a ~/.openclaw/workspace/apps/superclaw/skills/ ~/.openclaw/skills/
```

Installed skill copies:
- `~/.openclaw/skills/superclaw/`
- `~/.openclaw/skills/kanban/`

## 5) Extension

```bash
cd ~/.openclaw/workspace/apps/superclaw/extension
pnpm install
pnpm build
```

Build output:
- `.output/chrome-mv3/`

Optional zip:

```bash
pnpm zip
```

## Notes

- This guide is for **fresh installs only**.
- Default setup is local-only.
- Reverse proxy / public URLs can come later.
- If you want an agent to do the install, use [`AGENT_INSTALL.md`](./AGENT_INSTALL.md).
