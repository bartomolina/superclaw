import assert from "node:assert/strict";
import test from "node:test";

import { buildAnnotationSubmissionPayload } from "./annotation-payload.ts";

test("buildAnnotationSubmissionPayload creates the extension -> kanban payload shape", () => {
  const payload = buildAnnotationSubmissionPayload({
    pageUrl: "https://example.com/page",
    pageTitle: "Example Page",
    boardId: "board-1",
    columnId: "todo",
    agentId: "main",
    note: "Fix button spacing",
    meta: {
      tag: "button",
      id: "cta",
      classes: ["btn", "btn-primary"],
      text: "Sign up",
      selector: "#cta",
      component: "HeroButton",
      rect: { x: 10, y: 20, width: 30, height: 40 },
      styles: { color: "red" },
    },
  });

  assert.deepEqual(payload, {
    url: "https://example.com/page",
    title: "Example Page",
    boardId: "board-1",
    columnId: "todo",
    agentId: "main",
    annotations: [
      {
        selector: "#cta",
        component: "HeroButton",
        text: "Sign up",
        tag: "button",
        classes: "btn btn-primary",
        rect: { x: 10, y: 20, width: 30, height: 40 },
        styles: { color: "red" },
        note: "Fix button spacing",
        priority: null,
      },
    ],
  });
});
