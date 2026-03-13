# Kanban Refactor Steps

_Created: 2026-03-13_
_Status: implemented on 2026-03-13; this file is now a record of what was changed and what patterns to preserve._

## Goal

Make the kanban app resilient to OpenClaw upgrades by removing its custom Gateway WebSocket coupling and using stable server-side adapters instead.

## Current fragile areas

1. `kanban/lib/server/gateway.ts`
   - Custom WebSocket client
   - Hardcoded handshake/protocol/scopes
   - Same class of breakage the dashboard had before refactor

2. `kanban/lib/server/options-api.ts`
   - Uses gateway RPC for:
     - `agents.list`
     - `config.get`
     - `agent.identity.get`
     - `agents.files.get`
     - `skills.status`
   - Parses config with `JSON.parse` instead of JSON5

3. `kanban/app/api/agents/[agentId]/avatar/route.ts`
   - Reads `IDENTITY.md` through gateway RPC
   - Parses config with `JSON.parse`

## Target pattern

- Browser talks only to kanban `/api/*`
- One adapter layer owns OpenClaw integration
- Prefer CLI or filesystem where natural
- Use gateway RPC only when runtime-only data is required

## Recommended adapter layout

Create:

```txt
kanban/lib/server/openclaw/
  cli.ts
  config.ts
  agents.ts
  files.ts
  skills.ts
  types.ts
```

## Refactor order

### Phase 1: Replace transport coupling

1. Add `kanban/lib/server/openclaw/cli.ts`
   - Wrap `openclaw ...`
   - Wrap `openclaw gateway call ... --token ...` only as fallback
   - Reuse command helpers instead of raw `ws`

2. Remove `kanban/lib/server/gateway.ts`
   - Delete custom WebSocket client
   - Remove `ws` and `@types/ws` from `kanban/package.json`

### Phase 2: Stabilize agent options

3. Rewrite `kanban/lib/server/options-api.ts`
   - Agent list source:
     - `openclaw agents list --json`
   - Config source:
     - local `~/.openclaw/openclaw.json`
     - parse with JSON5, not `JSON.parse`
   - Identity/avatar source:
     - workspace filesystem directly
     - read `IDENTITY.md` locally
   - Skills source:
     - `skills.status` may remain gateway-backed for now

4. Keep response shape stable
   - `GET /api/agents` should still return:
     - `[{ id, name, emoji?, avatarUrl? }]`
   - `GET /api/skills` should still return:
     - `[{ name, emoji?, eligible? }]`

### Phase 3: Stabilize avatar loading

5. Rewrite `kanban/app/api/agents/[agentId]/avatar/route.ts`
   - Read workspace path from local config
   - Read `IDENTITY.md` from filesystem
   - Resolve avatar path with workspace confinement
   - Do not depend on gateway for local files

### Phase 4: Cleanup and docs

6. Update docs and env files
   - `kanban/README.md`
   - `kanban/.env.local.example`
   - Remove `GATEWAY_URL` references if no longer needed

7. Verify no stale imports remain
   - No imports from `@/lib/server/gateway`
   - No `ws` usage
   - No JSON config parsing with raw `JSON.parse` for OpenClaw config

## Acceptance criteria

- `pnpm lint` passes in `kanban/`
- `pnpm build` passes in `kanban/`
- `/api/agents` still populates kanban agent pickers/sidebar
- `/api/skills` still populates skill pickers
- `/api/agents/[agentId]/avatar` still serves agent avatars
- Kanban no longer depends on a custom Gateway WebSocket client

## Nice-to-have follow-up

- Share small helper patterns with the dashboard implementation, but do not couple the apps directly.
- Consider mirroring the dashboard adapter API design for consistency.
