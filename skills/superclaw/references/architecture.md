# SuperClaw architecture

## What SuperClaw is

SuperClaw is the local companion suite for OpenClaw.

It currently has three coordinated parts:
- Dashboard
- Kanban
- Extension

These parts should be treated as one product family with shared install/runtime conventions.

## Canonical location

- Repo path: `~/.openclaw/workspace/apps/superclaw/`
- Default install target on a machine with OpenClaw: `~/.openclaw/workspace/apps/superclaw/`

This is the canonical location for the SuperClaw suite itself, not the generic default for unrelated apps. Separate apps should usually live under `~/.openclaw/apps/` or an agent workspace's `apps/` directory.

## Canonical runtime model

Default assumptions unless the user explicitly asks otherwise:
- run on the same machine as OpenClaw
- local-first
- dev mode is acceptable and often preferred
- long-running services managed by `systemd`
- when external exposure is needed, prefer `cloudflared.service` / Cloudflare Tunnel
- for new public hostnames, treat `cloudflared tunnel route dns <tunnel> <hostname>` as convenient but not authoritative. If the local `cloudflared` cert is zone-scoped or stale, it can create records under the wrong zone. Prefer one of these:
  - re-run `cloudflared tunnel login` for the intended zone before using `route dns`
  - keep per-zone cert files and pass `--origincert` (or `TUNNEL_ORIGIN_CERT`)
  - create the DNS record directly with the Cloudflare API/dashboard, pointing the hostname at `<tunnel-id>.cfargotunnel.com`
- preferred default ports if free:
  - Dashboard: `19830`
  - Kanban: `19831`
- if those ports are already in use, choose nearby free ports and keep the service, env, tunnel, and docs aligned
- canonical service names:
  - `superclaw-dashboard.service`
  - `superclaw-convex.service`
  - `superclaw-kanban.service`

## Repo layout

```text
apps/superclaw/
├── README.md
├── INSTALL.md
├── dashboard/
├── kanban/
├── extension/
└── skills/
```

Use the root docs for suite-wide behavior and the per-app READMEs for local details.

## Skill distribution model

SuperClaw keeps repo copies of its skills under:
- `apps/superclaw/skills/superclaw/`
- `apps/superclaw/skills/kanban/`

Those repo copies are for versioning, sharing, and installer workflows.

Active OpenClaw skill copies should live under:
- `~/.openclaw/skills/superclaw/`
- `~/.openclaw/skills/kanban/`

When changing skill behavior, keep the repo copies and the active copies in sync.

## Documentation contract

If you change any of these, update the root docs too:
- install path
- ports
- service names
- required env vars
- skill sync/install steps
- public/local access assumptions

Root docs to keep aligned:
- `README.md`
- `INSTALL.md`
