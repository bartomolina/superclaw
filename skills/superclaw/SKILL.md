---
name: superclaw
description: Work on the SuperClaw companion suite for OpenClaw. Use when modifying or extending the repo under `apps/superclaw/`, creating new suite-level apps or features, adjusting shared install/runtime conventions, deciding whether a requested app belongs in SuperClaw or should live as a separate per-user or per-agent app, or working on the Dashboard, Kanban, Extension, or their cross-cutting architecture.
metadata:
  openclaw:
    emoji: "🦞"
---

# SuperClaw

Read `references/architecture.md` first.

Then read only the references that match the task:
- `references/app-patterns.md` for new apps, app placement, port selection, install flow, or shared conventions.
- `references/dashboard.md` for dashboard work.
- `references/kanban.md` for Kanban product/runtime/API work.
- `references/extension.md` for browser extension work.

## Rules

1. Treat `apps/superclaw/` as one companion suite, not unrelated projects.
2. Keep root docs (`README.md`, `INSTALL.md`) in sync when architecture, install flow, runtime, ports, or service names change.
3. Keep repo skill copies under `apps/superclaw/skills/` aligned with active copies under `~/.openclaw/skills/` when skill behavior changes.
4. Prefer editing the checked-out repo directly; do not create worktrees, side clones, or alternate repos unless explicitly asked.
5. If the task is a narrow Kanban worker run (pick up inbox work, leave comments, transition cards), prefer the dedicated `kanban` skill.
