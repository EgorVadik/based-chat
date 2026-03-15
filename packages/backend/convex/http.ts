import { httpRouter } from "convex/server";

import { authComponent, createAuth } from "./auth";
import {
  streamAssistantReply,
  streamAssistantReplyOptions,
  streamTemporaryAssistantReply,
} from "./messages";

const http = httpRouter();

authComponent.registerRoutes(http, createAuth, { cors: true });
http.route({
  path: "/messages/stream",
  method: "POST",
  handler: streamAssistantReply,
});
http.route({
  path: "/messages/stream",
  method: "OPTIONS",
  handler: streamAssistantReplyOptions,
});
http.route({
  path: "/messages/temp-stream",
  method: "POST",
  handler: streamTemporaryAssistantReply,
});
http.route({
  path: "/messages/temp-stream",
  method: "OPTIONS",
  handler: streamAssistantReplyOptions,
});

export default http;
