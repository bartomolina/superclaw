# SuperClaw Dashboard

Dashboard is the local UI for inspecting and managing OpenClaw.

For suite-level setup, see:
- `../README.md`
- `../INSTALL.md`

## Basics

- path: `apps/superclaw/dashboard/`
- preferred default port if free: `19830`
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

## Local app bookmarks

The Apps page reads local bookmarks from `apps.local.json` in this directory. That file is intentionally gitignored because it can contain bespoke/private local URLs.

Create it from the example:

```bash
cp apps.example.json apps.local.json
```

Each app has these fields:

```json
[
  {
    "name": "Grafana",
    "url": "http://127.0.0.1:3000",
    "category": "Ops",
    "image": "/local-app-icons/grafana.svg",
    "icon": "G"
  }
]
```

`name`, `url`, and `category` are required. `image` is optional and can point at an SVG or other image path. Put local bookmark icons in `public/local-app-icons/`; the folder contents are intentionally gitignored except for `.gitkeep`. `icon` is optional text fallback, such as an emoji or letter, used when `image` is omitted.

## Notes

- The browser talks to the dashboard app, not directly to the Gateway WebSocket.
- Server-side OpenClaw adapters live under `lib/server/openclaw/`.
- If the OpenClaw runtime path changes, rerun `node scripts/probe-gateway-ws.mjs --device-identity --client-id gateway-client --mode backend --cap tool-events`.
