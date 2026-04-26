import { httpRouter } from "convex/server";

import { authComponent, createAuth } from "./auth";
import {
  streamAssistantReply,
  streamAssistantReplyOptions,
  streamTemporaryAssistantReply,
} from "./messages";
import { transcribeAudio, transcribeAudioOptions } from "./transcribe";

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
http.route({
  path: "/audio/transcribe",
  method: "POST",
  handler: transcribeAudio,
});
http.route({
  path: "/audio/transcribe",
  method: "OPTIONS",
  handler: transcribeAudioOptions,
});

export default http;
