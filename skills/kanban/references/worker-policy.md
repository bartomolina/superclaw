# SuperClaw Kanban worker policy + API contract

## 1) Runtime setup

Use the current SuperClaw Kanban app only.

Determine the current agent id from the running agent context (`main`, `life`, `gepeto`, `stallman`, etc.). Kanban workers now use exactly one runtime contract everywhere:
- `KANBAN_BASE_URL`
- `KANBAN_AGENT_TOKEN`

Behavior:
- Base URL: `${KANBAN_BASE_URL}`
- Auth token: `${KANBAN_AGENT_TOKEN}`
- Do **not** try to read local repo files or run `convex env get ...` at runtime.
- Do **not** print the token.

Sandboxed-agent note:
- if the agent runtime is sandboxed, the kanban skill must be available inside the agent workspace too
- expected path: `<agent-workspace>/skills/kanban/`
- do **not** assume a sandboxed agent can read host skill paths like `~/.openclaw/skills/kanban/` or `/usr/lib/node_modules/openclaw/skills/kanban/`
- sandboxed agents should receive `KANBAN_BASE_URL` / `KANBAN_AGENT_TOKEN` explicitly per agent when needed; do not assume global sandbox defaults

### Validation / failure rules

- If either `KANBAN_BASE_URL` or `KANBAN_AGENT_TOKEN` is missing or empty, stop and report the exact missing env.
- Never invent fallback hosts, ports, URLs, or auth schemes.

Required headers for agent API calls:
- `X-Agent-Id: <agentId>`
- `X-Agent-Token: <resolved token>`

## 2) API endpoints

Base URL: `https://<deployment>.convex.site/agent/kanban`

- `GET /inbox`
  - Preferred worker endpoint.
  - Returns grouped actionable items for the current agent, by board.
  - Includes:
    - `ideas`: cards where the agent is involved and was not the last commenter
    - `todos`: assignee cards in `TODO`
    - `review`: cards in `Review` where the agent is involved and was not the last commenter
- `GET /tasks?includeDone=1`
  - Raw/debug endpoint.
  - Returns tasks where the current agent is involved, with role and last-comment metadata.
- `POST /comment`
  - Body: `{ cardId: string, body: string }`
- `POST /transition`
  - Body: `{ cardId: string, toColumn: string }`
- `POST /session/finish`
  - Body: `{ sessionId: string, status: "done" | "failed" | "aborted" }`

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
- Read the latest context before acting.
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
