# SuperClaw Kanban worker policy + API contract

## 1) Runtime setup

Use the current SuperClaw Kanban app only.

Determine the current agent id from the running agent context (`main`, `life`, `gepeto`, `stallman`, etc.). Kanban workers now use exactly one runtime contract everywhere:
- `KANBAN_BASE_URL`
- `KANBAN_AGENT_TOKEN`

Behavior:
- Base URL: `${KANBAN_BASE_URL}`
- Auth token: `${KANBAN_AGENT_TOKEN}`
- Determine the agent id from the running agent/session context, not from `OPENCLAW_AGENT_ID`, `AGENT_ID`, or other env probing.
- Do **not** try to read local repo files or run `convex env get ...` at runtime.
- Do **not** shell out just to inspect env values; if validation is needed, use direct runtime env access or a minimal portable shell check.
- Do **not** use inline Python for env checks; `python` may not exist.
- Do **not** print the token.

Sandboxed-agent note:
- if the agent runtime is sandboxed, the kanban skill must be available inside the agent workspace too
- expected path: `<agent-workspace>/skills/kanban/`
- do **not** assume a sandboxed agent can read host skill paths like `~/.openclaw/skills/kanban/` or `/usr/lib/node_modules/openclaw/skills/kanban/`
- sandboxed agents should receive `KANBAN_BASE_URL` / `KANBAN_AGENT_TOKEN` explicitly per agent when needed; do not assume global sandbox defaults
- dedicated per-agent Kanban credentials are preferred for sandboxed agents; if a dedicated credential exists for this agent id, the shared token will not work for it
- the normal provisioning helper for dedicated credentials lives at `kanban/scripts/provision-agent-credential.mjs`

### Validation / failure rules

- If either `KANBAN_BASE_URL` or `KANBAN_AGENT_TOKEN` is missing or empty, stop and report the exact missing env.
- Treat `KANBAN_BASE_URL` as the full Kanban API base. It already points at `/agent/kanban`.
- Never append another `/agent/kanban` segment or invent fallback hosts, ports, URLs, or auth schemes.
- If a known Kanban endpoint returns `404`, treat that as a path-construction bug and stop immediately instead of trying alternate URLs.
- If a known Kanban endpoint returns any non-2xx response, stop and report the exact endpoint + status instead of guessing and retrying with other paths.
- If a shell snippet relies on `pipefail`, arrays, or strict bash behavior, run it via `bash -lc '...'`; do not assume the default shell is bash.
- Never build JSON request bodies with `printf | sed` or ad-hoc quote escaping. Use `jq -nc` (preferred) or write a temp JSON file and send it with `--data @file`.
- If `jq` is unavailable when you need to POST JSON, stop and report that concrete missing prerequisite instead of improvising brittle escaping.

Required headers for agent API calls:
- `X-Agent-Id: <agentId>`
- `X-Agent-Token: <resolved token>`

Deterministic worker call sequence:
1. Resolve `agentId` from the running agent/session context.
2. Validate `KANBAN_BASE_URL` and `KANBAN_AGENT_TOKEN` once.
3. Set `BASE="${KANBAN_BASE_URL}"` exactly.
4. For normal scheduled runs, fetch `GET ${BASE}/inbox` with the required headers and use only cards returned by `/inbox`.
5. For tracked manual runs with an explicit `sessionId`, fetch `GET ${BASE}/session/targets?sessionId=<sessionId>` and use that response as the authoritative target list. Do **not** treat a live `/inbox` fetch as the source of truth for a tracked manual run.
6. Use the tracked/manual target list only for that manual run.
7. Use the provided `sessionId` with the normal tracked writes (`/comment`, `/transition`, `/session/finish`).
8. Do not call `/tasks` during normal worker execution unless the user explicitly asks for debugging/raw inspection.

Comment-thread interpretation:
- Treat each card's comments as one chronological task thread, read oldest to newest.
- A card may contain normal back-and-forth between the human and the agent; treat that as one ongoing task conversation, not as separate tasks.
- Prioritize the latest unresolved human request, blocker, or review handoff.
- If a newer comment clearly supersedes an older request, follow the newer request and address any still-open earlier point only if it remains relevant.
- For tracked manual runs, if `targets[].comments` is present, treat that thread as the authoritative conversation context for that run.
- If a card appears in `ideas` or `review` because the agent was not the last commenter, interpret that as the ball being back in the agent's court.

## 2) API endpoints

Base URL: `https://<deployment>.convex.site/agent/kanban`

- `GET /inbox`
  - Preferred worker endpoint for normal scheduled runs.
  - Returns grouped actionable items for the current agent, by board.
  - Includes:
    - `ideas`: cards where the agent is involved and was not the last commenter
    - `todos`: assignee cards in `TODO`
    - `review`: cards in `Review` where the agent is involved and was not the last commenter
- `GET /session/targets?sessionId=<sessionId>`
  - Preferred target source for tracked manual runs.
  - Returns the authoritative card list for that run.
  - If `targets[].comments` is present, treat it as the authoritative comment thread for the card during that run.
- `GET /tasks?includeDone=1`
  - Raw/debug endpoint.
  - Returns tasks where the current agent is involved, with role and last-comment metadata.
- `POST /comment`
  - Body: `{ cardId: string, body: string }`
- `POST /transition`
  - Body: `{ cardId: string, toColumn: string }`
- `POST /session/finish`
  - Body: `{ sessionId: string, status: "done" | "failed" | "aborted" }`

Canonical shell pattern for tracked POSTs:

```bash
bash -lc '
set -euo pipefail
agentId="sandbox"
sessionId="<session-id>"
payload=$(jq -nc --arg cardId "$cardId" --arg body "$commentBody" \
  '{cardId:$cardId, body:$body}')

curl -sS \
  -X POST "$KANBAN_BASE_URL/comment" \
  -H "Content-Type: application/json" \
  -H "X-Agent-Id: $agentId" \
  -H "X-Agent-Token: $KANBAN_AGENT_TOKEN" \
  -H "X-Kanban-Session-Id: $sessionId" \
  --data "$payload"
'
```

Use the same `jq -nc` pattern for `/transition` and `/session/finish` bodies.

## 3) Scheduled worker policy

Use these rules for autonomous cron-style runs:

1. Fetch `/inbox`.
2. Never touch unassigned cards or cards omitted from the inbox.
3. If the inbox is empty: `NO_REPLY`.
4. Handle lightweight comment/reply work conservatively.
5. For TODO cards, the agent may pick up multiple actionable cards in one run, up to a hard cap of 4.
6. Process picked TODO cards deterministically in inbox order.
7. After selecting TODO cards, claim them first by transitioning them to `In Progress` before implementation work begins.

### Ideas

- Comment only.
- Leave one concise kickoff or clarification comment.
- Do not transition the card.

### TODO

- Pick up to 4 actionable TODO cards in one run.
- Process them in deterministic inbox order.
- In the manual worker run path, picked TODO cards are auto-claimed from `TODO -> In Progress` by the backend before implementation work begins.
- Once the selected cards have been claimed into `In Progress`, do the requested work for each card in order.
- For each picked card:
  - do the requested work
  - leave a concise progress/result comment
  - transition `In Progress -> Review` when ready
- Do not pick more than 4 TODO cards in a single run.

### Review

- The inbox only includes these when someone else commented last.
- Read the thread in order before acting, then respond to the latest unresolved human request or review handoff.
- If the right move is a reply, leave one concise reply.
- If the right move is implementation follow-up, transition `Review -> In Progress`, do the work, and return to `Review` when ready.
- Keep review follow-up conservative even when multiple TODO cards are allowed in the same run.

### If work is blocked or unclear

- Leave a concise blocker comment.
- If work was started, leave the card in `In Progress`.
- Do not pretend the task is complete.

### Finish discipline for tracked manual runs

When a manual run includes an explicit `sessionId` for run tracking:
- Treat `POST /agent/kanban/session/finish` as a required finalization step.
- As soon as the selected card work, comments, and transitions are complete, call `/session/finish` immediately.
- Do not do extra analysis, repo inspection, status summaries, or exploratory commands after the finish call.
- Keep final assistant text minimal after finishing the session.
- If there is nothing actionable, still call `/session/finish` with `status: "done"` before stopping.
- If the run cannot complete normally, call `/session/finish` with `status: "failed"` or `"aborted"` as appropriate before stopping.

## 4) Transition guardrails

Assignee transitions allowed:
- `TODO -> In Progress`
- `In Progress -> Review`
- `Review -> In Progress`

Reviewer transitions allowed:
- none

Human transitions allowed:
- any

## 5) Comment style

Keep comments concise and useful. Include only what matters:
- what changed
- blocker or question
- next expected human or reviewer action

## 6) Operating principles

- Be deterministic and conservative.
- Do not add backward-compat behavior for removed Kanban implementations.
- Do not invent fallback hosts, ports, or auth schemes.
- If the API contract changes, report it instead of guessing.
- When a card requires work inside a git repo, work directly in the existing checked-out repo unless explicitly told otherwise.
- Avoid creating worktrees, side clones, or PR workflows unless explicitly requested.
- If the task changes a repo, commit and push the changes when complete unless explicitly told not to.
- Do not default to opening PRs for normal Kanban work.
