import { httpRouter } from "convex/server";

import { authComponent, createAuth } from "./auth";
import { commentOnCard, listInbox, listTasks, transitionCard } from "./agent_http";

const http = httpRouter();

authComponent.registerRoutes(http, createAuth);

http.route({
  path: "/agent/kanban/tasks",
  method: "GET",
  handler: listTasks,
});

http.route({
  path: "/agent/kanban/inbox",
  method: "GET",
  handler: listInbox,
});

http.route({
  path: "/agent/kanban/comment",
  method: "POST",
  handler: commentOnCard,
});

http.route({
  path: "/agent/kanban/transition",
  method: "POST",
  handler: transitionCard,
});

export default http;
