import type { Id } from "@based-chat/backend/convex/_generated/dataModel";

import type { MessageAttachment } from "@/lib/attachments";
import { getModelById, type Model } from "@/lib/models";

export type MessageRole = "user" | "system";
export type StreamStatus = "pending" | "streaming" | "done" | "error" | "timeout";

export type ChatMessage = {
  id: string;
  threadId?: Id<"threads">;
  role: MessageRole;
  content: string;
  attachments: MessageAttachment[];
  modelId?: string;
  model?: Model;
  createdAt: number;
  updatedAt?: number;
  streamId?: string;
  streamStatus?: StreamStatus;
  errorMessage?: string;
  isStreaming?: boolean;
};

type MessageLike = {
  _id: Id<"messages">;
  threadId: Id<"threads">;
  role: MessageRole;
  content: string;
  attachments?: MessageAttachment[];
  modelId?: string;
  streamId?: string;
  streamStatus?: StreamStatus;
  errorMessage?: string;
  createdAt: number;
  updatedAt?: number;
};

export function toChatMessage(
  message: MessageLike,
): ChatMessage {
  return {
    id: message._id,
    threadId: message.threadId,
    role: message.role,
    content: message.content,
    attachments: message.attachments ?? [],
    modelId: message.modelId,
    model: message.modelId ? getModelById(message.modelId) : undefined,
    streamId: message.streamId,
    streamStatus: message.streamStatus,
    errorMessage: message.errorMessage,
    createdAt: message.createdAt,
    updatedAt: message.updatedAt,
  };
}
