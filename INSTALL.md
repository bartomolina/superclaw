# SuperClaw Install Guide

This guide is for people who already have **OpenClaw working**.

Install location:
- `~/.openclaw/workspace/apps/superclaw/`

Default local URLs:
- Dashboard: `http://127.0.0.1:4000`
- Kanban: `http://127.0.0.1:4100`

Recommended systemd unit names:
- `superclaw-dashboard.service`
- `superclaw-convex.service`
- `superclaw-kanban.service`

## Prerequisites

You should already have:
- OpenClaw
- Node.js + pnpm
- systemd
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

Create the service:

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
- `NEXT_PUBLIC_SITE_URL=http://127.0.0.1:4100` for single-machine local-only setup, or your private/internal host/IP for non-public access from other devices
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

`AUTH_FROM_EMAIL` is strongly recommended for any real/shared install. If omitted, Kanban falls back to `SuperClaw <onboarding@resend.dev>`, which Resend only allows for limited self-email testing.

Optional:

```bash
pnpm exec convex env set MAGIC_LINK_EMAIL_COOLDOWN_MS 120000
pnpm exec convex env set MAGIC_LINK_GLOBAL_COOLDOWN_MS 5000
```

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

## 3) Enable and start services

```bash
sudo systemctl daemon-reload
sudo systemctl enable --now superclaw-dashboard.service superclaw-convex.service superclaw-kanban.service
sudo systemctl status superclaw-dashboard.service superclaw-convex.service superclaw-kanban.service
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

Derive the canonical Kanban worker runtime env once from the local Kanban + Convex setup:

```bash
cd ~/.openclaw/workspace/apps/superclaw/kanban
./scripts/resolve-worker-env.sh
# or emit shell exports:
./scripts/resolve-worker-env.sh --exports
```

Persist those two values in the OpenClaw runtime:
- `KANBAN_BASE_URL`
- `KANBAN_AGENT_TOKEN`

Rules:
- unsandboxed/local agents should read them from the OpenClaw gateway service environment
- do **not** auto-mirror them into `agents.defaults.sandbox.docker.env`
- sandboxed Kanban access should be configured manually per agent when needed under `agents.list[].sandbox.docker.env`
- `KANBAN_AGENT_SHARED_TOKEN` remains the default shared credential for trusted/local agents
- dedicated per-agent Kanban credentials are supported for isolation; when present for an agent id, that agent must use its dedicated token instead of the shared one

If you will run Kanban worker passes from sandboxed/isolated agent workspaces, copy the required SuperClaw skills into each target agent workspace:

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
- If you need public exposure later, prefer **Cloudflare Tunnel** via `cloudflared.service`.
- If you want an agent to do the install, use [`AGENT_INSTALL.md`](./AGENT_INSTALL.md).
