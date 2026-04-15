---
name: kanban
description: Work assigned SuperClaw Kanban tasks for autonomous agents. Use when an agent should pick up its assigned Kanban work, leave progress or blocker comments, move cards through TODO/In Progress/Review according to policy, run a scheduled or manual Kanban worker pass, or create a new task/card in SuperClaw Kanban.
metadata:
  openclaw:
    emoji: "🦞"
---

# SuperClaw Kanban worker

Read `references/worker-policy.md` before acting.

Use the broader `superclaw` skill when the task is about suite architecture, install conventions, app layout, Dashboard, Extension, or repo-wide SuperClaw changes.

## Task authoring

This skill is primarily a worker/execution skill, but it should also handle direct requests to create a Kanban task/card.

When asked to create a task in SuperClaw Kanban:
- use the Kanban app/backend card-creation path, not the worker API flow (`/inbox`, `/comment`, `/transition`, `/session/finish`)
- create the card in the requested board and column, usually `TODO` when the user does not specify another column
- include the task metadata when provided: `title`, `description`, `agentId`, `reviewerId`, `priority`, `size`, `type`, `acp`, `model`, `skills`
- if the board or column is ambiguous, ask only for the missing piece needed to place the card correctly
- do not treat task creation as a worker pass or fabricate a tracked run/session for it

## Required behavior

1. Determine the current agent id from the running agent/session context, not from env probing.
2. Load runtime config and auth exactly as described in `references/worker-policy.md`.
3. Fetch the authoritative target list for this run from the SuperClaw Kanban agent API: `/inbox` for normal runs or `/session/targets?sessionId=...` for tracked manual runs.
4. Work only on cards returned for the current agent/run.
5. Treat `title`, `description`, and each card's full comment thread as the primary task spec. Read comments in order and act on the latest unresolved human request, blocker, or review handoff.
6. Interpret task metadata deliberately instead of ignoring it:
   - `priority`: when multiple actionable cards exist, do higher priority work first (`Critical` / `High` before `Medium` before `Low`), while preserving API order inside the same priority band.
   - `size`: use it to scope the pass; for large cards, prefer a concrete incremental step plus a useful comment over an over-ambitious half-finished attempt.
   - `type`: shape the work style (`bug` / `fix` = diagnose and verify, `docs` = update docs, `cosmetic` = minimal surface changes, `refactor` = preserve behavior, `research` = findings/comment first unless implementation is clearly requested).
   - `source`: use it as context about where the task came from, not as a replacement for the thread or description.
7. If `skills` are listed on a task and one or more are clearly relevant, load those skills before acting. If a needed skill is unavailable in the current runtime or sandbox, stop and report the exact missing skill or missing local skill path instead of silently proceeding.
8. Treat `executionHint`, `model`, and `acp` as execution guidance, not noise.
9. If `acp` requests a specific ACP harness and the task clearly calls for delegated coding-agent execution, route that work through ACP instead of silently ignoring the hint. If ACP routing is unavailable or unnecessary for the task, say so explicitly.
10. Follow the transition, comment, and finish rules exactly.
11. If nothing actionable exists, reply `NO_REPLY`.
12. If auth or API setup fails, report the concrete missing step or failing endpoint.
13. When the card work targets a git repo, work directly in the checked-out repo unless explicitly told otherwise.
14. Avoid creating worktrees, side clones, or PR-based flows unless explicitly requested.
15. If the task results in repo changes, commit and push them when the work is complete unless explicitly told not to.
16. Do not shell out just to inspect env or infer identity. In particular, do not run inline Python to read env vars; assume `python` may not exist.
17. Use one deterministic API flow only: validate envs once, then use `/inbox` for normal runs or `/session/targets?sessionId=...` for tracked manual runs, then call `/comment`, `/transition`, and `/session/finish` as needed. Do not improvise alternate endpoint shapes, fallback URLs, or recovery attempts.
18. When shelling out for Kanban API calls, prefer `bash -lc` for strict-shell snippets and build JSON payloads with `jq -nc`; never hand-roll JSON escaping with `printf | sed` or similar fragile quoting.
19. If a known Kanban API call returns a client/server error, stop and report the exact failing endpoint/status instead of guessing and retrying with different paths.
