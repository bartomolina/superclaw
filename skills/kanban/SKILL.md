---
name: kanban
description: Work assigned SuperClaw Kanban tasks for autonomous agents. Use when an agent should pick up its assigned Kanban work, leave progress or blocker comments, move cards through TODO/In Progress/Review according to policy, or run a scheduled or manual Kanban worker pass.
---

# SuperClaw Kanban worker

Read `references/worker-policy.md` before acting.

Use the broader `superclaw` skill when the task is about suite architecture, install conventions, app layout, Dashboard, Extension, or repo-wide SuperClaw changes.

## Required behavior

1. Determine the current agent id from the running agent/session context, not from env probing.
2. Load runtime config and auth exactly as described in `references/worker-policy.md`.
3. Fetch the current agent inbox from the SuperClaw Kanban agent API.
4. Work only on cards returned for the current agent.
5. Follow the transition, comment, and finish rules exactly.
6. If nothing actionable exists, reply `NO_REPLY`.
7. If auth or API setup fails, report the concrete missing step or failing endpoint.
8. When the card work targets a git repo, work directly in the checked-out repo unless explicitly told otherwise.
9. Avoid creating worktrees, side clones, or PR-based flows unless explicitly requested.
10. If the task results in repo changes, commit and push them when the work is complete unless explicitly told not to.
11. Do not shell out just to inspect env or infer identity. In particular, do not run inline Python to read env vars; assume `python` may not exist.
12. Use one deterministic API flow only: validate envs once, then use `/inbox` for normal runs or `/session/targets?sessionId=...` for tracked manual runs, then call `/comment`, `/transition`, and `/session/finish` as needed. Do not improvise alternate endpoint shapes, fallback URLs, or recovery attempts.
13. If a known Kanban API call returns a client/server error, stop and report the exact failing endpoint/status instead of guessing and retrying with different paths.
