---
name: kanban
description: Work assigned SuperClaw Kanban tasks for autonomous agents. Use when an agent should pick up its assigned Kanban work, leave progress or blocker comments, move cards through TODO/In Progress/Review according to policy, or run a scheduled or manual Kanban worker pass.
metadata:
  openclaw:
    emoji: "🦞"
---

# SuperClaw Kanban worker

Read `references/worker-policy.md` before acting.

Use the broader `superclaw` skill when the task is about suite architecture, install conventions, app layout, Dashboard, Extension, or repo-wide SuperClaw changes.

## Required behavior

1. Determine the current agent id from the running agent/session context, not from env probing.
2. Load runtime config and auth exactly as described in `references/worker-policy.md`.
3. Fetch the authoritative target list for this run from the SuperClaw Kanban agent API: `/inbox` for normal runs or `/session/targets?sessionId=...` for tracked manual runs.
4. Work only on cards returned for the current agent/run.
5. Treat each card's comments as one chronological task thread. Read them in order and act on the latest unresolved human request, blocker, or review handoff.
6. Follow the transition, comment, and finish rules exactly.
7. If nothing actionable exists, reply `NO_REPLY`.
8. If auth or API setup fails, report the concrete missing step or failing endpoint.
9. When the card work targets a git repo, work directly in the checked-out repo unless explicitly told otherwise.
10. Avoid creating worktrees, side clones, or PR-based flows unless explicitly requested.
11. If the task results in repo changes, commit and push them when the work is complete unless explicitly told not to.
12. Do not shell out just to inspect env or infer identity. In particular, do not run inline Python to read env vars; assume `python` may not exist.
13. Use one deterministic API flow only: validate envs once, then use `/inbox` for normal runs or `/session/targets?sessionId=...` for tracked manual runs, then call `/comment`, `/transition`, and `/session/finish` as needed. Do not improvise alternate endpoint shapes, fallback URLs, or recovery attempts.
14. When shelling out for Kanban API calls, prefer `bash -lc` for strict-shell snippets and build JSON payloads with `jq -nc`; never hand-roll JSON escaping with `printf | sed` or similar fragile quoting.
15. If a known Kanban API call returns a client/server error, stop and report the exact failing endpoint/status instead of guessing and retrying with different paths.
