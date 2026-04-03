# SuperClaw Dashboard

Dashboard is the local UI for inspecting and managing OpenClaw.

For suite-level setup, see:
- `../README.md`
- `../INSTALL.md`

## Basics

- path: `apps/superclaw/dashboard/`
- port: `4000`
- service: `superclaw-dashboard.service`

## Commands

```bash
pnpm install
cp .env.example .env
pnpm dev
```

Other commands:

```bash
pnpm lint
pnpm build
pnpm start
```

## Environment

Required:
- `GATEWAY_TOKEN`

Optional:
- `OPENCLAW_HOME`
- `OPENCLAW_PACKAGE_JSON`
- `GEMINI_API_KEY`
- `DEBUG_RPC_ENABLED`

## Notes

- The browser talks to the dashboard app, not directly to the Gateway WebSocket.
- Server-side OpenClaw adapters live under `lib/server/openclaw/`.
- If the OpenClaw runtime path changes, rerun `node scripts/probe-gateway-ws.mjs --device-identity --client-id gateway-client --mode backend --cap tool-events`.
