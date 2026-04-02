import assert from "node:assert/strict";
import test from "node:test";

import {
  buildSessionChatUrl,
  buildSessionKey,
  cardMatchesSearch,
  describeCardRunState,
  formatColumnName,
  formatRunStatusLabel,
  getColumnTone,
  maskEmail,
  summarize,
} from "./card-formatting.ts";

test("formatting helpers cover canonical kanban display cases", () => {
  assert.equal(formatColumnName("todo"), "TODO");
  assert.equal(formatColumnName("ideas"), "Ideas");
  assert.equal(formatColumnName("inprogress"), "In Progress");
  assert.match(getColumnTone("Review"), /amber/);
  assert.equal(summarize("  hello world  "), "hello world");
  assert.equal(maskEmail("person@example.com"), "••••••••");
  assert.equal(cardMatchesSearch({ title: "Ship dashboard", description: "Refactor shared adapters" }, "adapter"), true);
  assert.equal(cardMatchesSearch({ title: "Ship dashboard", description: "Refactor shared adapters" }, "Dashboard"), true);
  assert.equal(cardMatchesSearch({ title: "Ship dashboard" }, "kanban"), false);
});

test("session helpers build stable chat links only for manual session ids", () => {
  assert.equal(buildSessionKey("kanban-manual-main-1234", "main"), "agent:main:kanban-manual:1234");
  assert.match(buildSessionChatUrl("kanban-manual-main-1234", "main") ?? "", /session=agent%3Amain%3Akanban-manual%3A1234/);
  assert.equal(buildSessionKey("random-session", "main"), null);
});

test("run state helpers produce readable summaries", () => {
  assert.equal(formatRunStatusLabel("failed"), "Failed");
  const summary = describeCardRunState({
    lastRunStatus: "done",
    lastSessionId: "kanban-manual-main-1234",
    lastSessionAgentId: "main",
    lastSessionUpdatedAt: Date.now() - 61_000,
  });

  assert.match(summary, /^Done · main · \d+m ago · kanban-manual-main-1234$/);
});
