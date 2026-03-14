import type { Doc, Id } from "@based-chat/backend/convex/_generated/dataModel";

import { getModelById, type Model } from "@/lib/models";

export type MessageRole = "user" | "system";

export type ChatMessage = {
  id: string;
  threadId?: Id<"threads">;
  role: MessageRole;
  content: string;
  modelId?: string;
  model?: Model;
  createdAt: number;
  updatedAt?: number;
  isStreaming?: boolean;
};

export function toChatMessage(message: Doc<"messages">): ChatMessage {
  return {
    id: message._id,
    threadId: message.threadId,
    role: message.role,
    content: message.content,
    modelId: message.modelId,
    model: getModelById(message.modelId),
    createdAt: message.createdAt,
    updatedAt: message.updatedAt,
  };
}
