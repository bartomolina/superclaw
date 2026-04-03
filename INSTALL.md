# SuperClaw Install Runbook

Use this when an OpenClaw agent is asked to install SuperClaw.

## Scope

- fresh install only
- user already has OpenClaw working
- install inside `~/.openclaw/workspace/apps/superclaw/`
- run locally
- run in dev mode
- manage long-running services with systemd

Recommended systemd unit names:
- `superclaw-dashboard.service`
- `superclaw-convex.service`
- `superclaw-kanban.service`

## Fixed defaults

Paths:
- `~/.openclaw/workspace/apps/superclaw/dashboard`
- `~/.openclaw/workspace/apps/superclaw/kanban`
- `~/.openclaw/workspace/apps/superclaw/extension`

Ports:
- Dashboard: `4000`
- Kanban: `4100`

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
8. create and start systemd services
9. sync the bundled SuperClaw skills into `~/.openclaw/skills/`
10. build the extension
11. report final URLs and any manual follow-up

## Rules

### Ask only when needed

Reuse existing values if they are already available.

Typical values to ask for:
- `SUPERUSER_EMAIL`
- `RESEND_API_KEY`
- `AUTH_FROM_EMAIL` (required for real/shared email delivery; optional for self-email testing fallback)
- `GEMINI_API_KEY` (optional, for dashboard avatar generation during agent creation)
- Convex login/project selection if the CLI needs user interaction

### Do not improvise

Do not change:
- install path
- ports
- systemd unit names
- dev-mode runtime

If public exposure is needed later, prefer **Cloudflare Tunnel** via `cloudflared.service`.

Do not switch to Docker or production mode unless the user explicitly asks.

## Prerequisite checks

Verify:
- OpenClaw is installed and working
- `pnpm` exists
- `systemctl` exists
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

Optional env:
- `OPENCLAW_HOME`
- `GEMINI_API_KEY` (or `GOOGLE_API_KEY`) for dashboard avatar generation during agent creation
- `DEBUG_RPC_ENABLED`

If the user wants dashboard avatar generation, set the Gemini/Google API key in `dashboard/.env` before starting `superclaw-dashboard.service`.

Create the service with:

```bash
sudo tee /etc/systemd/system/superclaw-dashboard.service >/dev/null <<'EOF'
[Unit]
Description=SuperClaw Dashboard
After=network.target

[Service]
Type=simple
WorkingDirectory=%h/.openclaw/workspace/apps/superclaw/dashboard
Environment=HOME=%h
Environment=PATH=/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin:/sbin:/bin:%h/.local/bin:%h/.local/share/pnpm
ExecStart=/usr/bin/pnpm exec next dev --hostname 127.0.0.1 --port 4000
Restart=always
RestartSec=5
User=%u

[Install]
WantedBy=multi-user.target
EOF
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
- `NEXT_PUBLIC_SITE_URL=http://127.0.0.1:4100` for single-machine local-only setup, or your private/internal host/IP for non-public access from other devices
- `GATEWAY_TOKEN`

### Convex notes

- a fresh Convex deployment is fine
- schema/functions are created from repo code when sync runs
- no manual SQL setup is needed
- user still needs a valid Convex deployment and required env vars

Required Convex env vars:
- `BETTER_AUTH_SECRET`
- `SITE_URL=http://127.0.0.1:4100` for single-machine local-only setup, or your canonical private/internal/public origin in other modes
- `SUPERUSER_EMAIL`
- `RESEND_API_KEY`
- `KANBAN_AGENT_SHARED_TOKEN`

Strongly recommended for real/shared email delivery:
- `AUTH_FROM_EMAIL`

If `AUTH_FROM_EMAIL` is omitted, Kanban falls back to `SuperClaw <onboarding@resend.dev>`, which Resend only allows for limited self-email testing.

`SITE_URL` is the canonical auth origin used in magic-link emails.
Leave `TRUSTED_ORIGINS` unset by default.
If you intentionally want alternate private/internal origins (for example `http://my-host:4100` or `http://100.x.y.z:4100`) to work too, add only those extras to `TRUSTED_ORIGINS`.

Create the Convex sync service:

```bash
sudo tee /etc/systemd/system/superclaw-convex.service >/dev/null <<'EOF'
[Unit]
Description=SuperClaw Convex Sync
After=network.target

[Service]
Type=simple
WorkingDirectory=%h/.openclaw/workspace/apps/superclaw/kanban
Environment=HOME=%h
Environment=PATH=/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin:/sbin:/bin:%h/.local/bin:%h/.local/share/pnpm
ExecStart=/usr/bin/pnpm exec convex dev
Restart=always
RestartSec=5
User=%u

[Install]
WantedBy=multi-user.target
EOF
```

Create the Kanban service:

```bash
sudo tee /etc/systemd/system/superclaw-kanban.service >/dev/null <<'EOF'
[Unit]
Description=SuperClaw Kanban
After=network.target

[Service]
Type=simple
WorkingDirectory=%h/.openclaw/workspace/apps/superclaw/kanban
Environment=HOME=%h
Environment=PATH=/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin:/sbin:/bin:%h/.local/bin:%h/.local/share/pnpm
ExecStart=/usr/bin/pnpm exec next dev --hostname 127.0.0.1 --port 4100
Restart=always
RestartSec=5
User=%u

[Install]
WantedBy=multi-user.target
EOF
```

Kanban exposure modes:
- **single-machine local dev:** keep `ExecStart ... --hostname 127.0.0.1 --port 4100`, keep tunnel ingress off, and keep `NEXT_PUBLIC_SITE_URL` / `SITE_URL` on the same local origin
- **private internal/Tailscale access:** bind Kanban to your internal IP instead of `127.0.0.1`, keep tunnel ingress off, and set both `NEXT_PUBLIC_SITE_URL` and `SITE_URL` to that internal origin
- **shared/public mode:** add Cloudflare Tunnel ingress for the public hostname and set both `NEXT_PUBLIC_SITE_URL` and `SITE_URL` to that public URL so magic-link emails point to the right place

Changing only the service bind host or only the tunnel is not enough when magic-link auth is enabled; the canonical URL env vars must match the intended access mode too.
If you want multiple private/internal ways to reach the same private Kanban, keep one canonical `SITE_URL` and put only the extra allowed internal origins in `TRUSTED_ORIGINS`. Otherwise leave it unset.

Enable and start the services:

```bash
sudo systemctl daemon-reload
sudo systemctl enable --now superclaw-dashboard.service superclaw-convex.service superclaw-kanban.service
sudo systemctl status superclaw-dashboard.service superclaw-convex.service superclaw-kanban.service
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

### Kanban worker runtime env

Derive the canonical Kanban worker env from the local Kanban + Convex setup:

```bash
cd ~/.openclaw/workspace/apps/superclaw/kanban
./scripts/resolve-worker-env.sh
# or emit shell exports:
./scripts/resolve-worker-env.sh --exports
```

Persist these two values for the OpenClaw runtime:
- `KANBAN_BASE_URL`
- `KANBAN_AGENT_TOKEN`

Rules:
- unsandboxed/local agents should read them from the OpenClaw gateway service environment
- do **not** auto-mirror them into `agents.defaults.sandbox.docker.env`
- sandboxed Kanban access should be configured manually per agent when needed under `agents.list[].sandbox.docker.env`
- `KANBAN_AGENT_SHARED_TOKEN` remains the default shared credential for trusted/local agents
- dedicated per-agent Kanban credentials are supported for isolation; when present for an agent id, that agent must use its dedicated token instead of the shared one

If an agent will run Kanban worker passes inside a sandboxed agent workspace, also copy the required SuperClaw skills into that agent workspace so the sandbox can read them locally:

```bash
mkdir -p ~/.openclaw/workspace-<agent>/skills
rsync -a ~/.openclaw/skills/kanban/ ~/.openclaw/workspace-<agent>/skills/kanban/
rsync -a ~/.openclaw/skills/superclaw/ ~/.openclaw/workspace-<agent>/skills/superclaw/
```

To provision a dedicated Kanban credential for a sandboxed agent and get the exact env payload to inject into `agents.list[].sandbox.docker.env`:

```bash
cd ~/.openclaw/workspace/apps/superclaw/kanban
./scripts/provision-agent-credential.mjs <agent-id> --json
```

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

Report back:
- what was installed
- systemd unit names
- local URLs
- whether Convex setup worked
- where the extension build is
- any manual next step still needed
