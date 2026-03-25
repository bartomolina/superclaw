# SuperClaw Agent Install Runbook

Use this when an OpenClaw agent is asked to install SuperClaw.

## Scope

- fresh install only
- user already has OpenClaw working
- install inside `~/.openclaw/workspace/apps/superclaw/`
- run locally
- run in dev mode
- manage processes with pm2

## Fixed defaults

Paths:
- `~/.openclaw/workspace/apps/superclaw/dashboard`
- `~/.openclaw/workspace/apps/superclaw/kanban`
- `~/.openclaw/workspace/apps/superclaw/extension`

Ports:
- Dashboard: `4000`
- Kanban: `4100`

pm2 names:
- `superclaw-dashboard`
- `convex`
- `superclaw-kanban`

Host:
- `127.0.0.1`

## What the install agent should do

1. check prerequisites
2. detect existing config where possible
3. ask the user only for missing required values
4. install dashboard
5. install kanban
6. connect/init Convex
7. set Convex env vars
8. start pm2 processes
9. sync the bundled SuperClaw skills into `~/.openclaw/skills/`
10. build the extension
11. report final URLs and any manual follow-up

## Rules

### Ask only when needed

Reuse existing values if they are already available.

Typical values to ask for:
- `SUPERUSER_EMAIL`
- `RESEND_API_KEY`
- `AUTH_FROM_EMAIL`
- Convex login/project selection if the CLI needs user interaction

### Do not improvise

Do not change:
- install path
- ports
- pm2 names
- dev-mode runtime

Do not switch to Docker or production mode unless the user explicitly asks.

## Prerequisite checks

Verify:
- OpenClaw is installed and working
- `pnpm` exists
- `pm2` exists
- code exists under `~/.openclaw/workspace/apps/superclaw/`

If OpenClaw itself is not working, stop and tell the user SuperClaw depends on it.

## Dashboard install

```bash
cd ~/.openclaw/workspace/apps/superclaw/dashboard
pnpm install
cp .env.example .env
```

Required env:
- `GATEWAY_TOKEN`

Start it with:

```bash
pm2 start bash --name superclaw-dashboard --cwd ~/.openclaw/workspace/apps/superclaw/dashboard -- -lc 'pnpm exec next dev --hostname 127.0.0.1 --port 4000'
```

## Kanban install

```bash
cd ~/.openclaw/workspace/apps/superclaw/kanban
pnpm install
cp .env.local.example .env.local
```

Required local env in `.env.local`:
- `CONVEX_DEPLOYMENT`
- `NEXT_PUBLIC_CONVEX_URL`
- `NEXT_PUBLIC_CONVEX_SITE_URL`
- `NEXT_PUBLIC_SITE_URL=http://127.0.0.1:4100`
- `GATEWAY_TOKEN`

### Convex notes

- a fresh Convex deployment is fine
- schema/functions are created from repo code when sync runs
- no manual SQL setup is needed
- user still needs a valid Convex deployment and required env vars

Required Convex env vars:
- `BETTER_AUTH_SECRET`
- `SITE_URL=http://127.0.0.1:4100`
- `SUPERUSER_EMAIL`
- `RESEND_API_KEY`
- `AUTH_FROM_EMAIL`
- `KANBAN_AGENT_SHARED_TOKEN`

Start Convex sync:

```bash
pm2 start bash --name convex --cwd ~/.openclaw/workspace/apps/superclaw/kanban -- -lc 'pnpm exec convex dev'
```

Start Kanban:

```bash
pm2 start bash --name superclaw-kanban --cwd ~/.openclaw/workspace/apps/superclaw/kanban -- -lc 'pnpm exec next dev --hostname 127.0.0.1 --port 4100'
```

## Skill sync

Sync the repo copies of the SuperClaw skills into the active OpenClaw skills directory:

```bash
mkdir -p ~/.openclaw/skills
rsync -a ~/.openclaw/workspace/apps/superclaw/skills/ ~/.openclaw/skills/
```

Expected active skill copies:
- `~/.openclaw/skills/superclaw/`
- `~/.openclaw/skills/kanban/`

## Extension build

```bash
cd ~/.openclaw/workspace/apps/superclaw/extension
pnpm install
pnpm build
```

Optional:

```bash
pnpm zip
```

Expected output:
- `.output/chrome-mv3/`

Do not try to install the extension into the browser unless the user explicitly asks.

## Finish

Run:

```bash
pm2 save
pm2 status
```

Report back:
- what was installed
- pm2 process names
- local URLs
- whether Convex setup worked
- where the extension build is
- any manual next step still needed
