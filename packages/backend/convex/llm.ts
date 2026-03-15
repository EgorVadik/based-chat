import type { ModelMessage, UserModelMessage } from "ai";

type ResolvedAttachment = {
  kind: "image" | "file";
  fileName: string;
  contentType: string;
  dataUrl: string;
};

type ConversationMessage = {
  role: "user" | "system";
  content: string;
  attachments?: ResolvedAttachment[];
};

const OPENROUTER_MODEL_IDS: Record<string, string> = {
  "claude-opus-4-6": "anthropic/claude-opus-4.6",
  "claude-sonnet-4-6": "anthropic/claude-sonnet-4.6",
  "claude-haiku-4-5": "anthropic/claude-haiku-4.5",
  "gpt-5.4": "openai/gpt-5.4",
  "gpt-4o": "openai/gpt-4o",
  "gpt-oss-20b": "openai/gpt-oss-20b",
  "gpt-oss-120b": "openai/gpt-oss-120b",
  "gemini-2.5-pro": "google/gemini-2.5-pro",
  "gemini-2.5-flash": "google/gemini-2.5-flash",
  "llama-4-maverick": "meta-llama/llama-4-maverick",
  "deepseek-r1": "deepseek/deepseek-r1",
  "deepseek-v3": "deepseek/deepseek-chat",
};

export function getOpenRouterModelId(modelId: string) {
  return OPENROUTER_MODEL_IDS[modelId] ?? modelId;
}

function toUserContentParts(message: ConversationMessage) {
  const contentParts: Exclude<UserModelMessage["content"], string> = [];
  const trimmedContent = message.content.trim();

  if (trimmedContent) {
    contentParts.push({
      type: "text",
      text: trimmedContent,
    });
  }

  for (const attachment of message.attachments ?? []) {
    if (
      attachment.kind === "image" ||
      attachment.contentType.startsWith("image/")
    ) {
      contentParts.push({
        type: "image",
        image: attachment.dataUrl,
        mediaType: attachment.contentType,
      });
      continue;
    }

    contentParts.push({
      type: "file",
      data: attachment.dataUrl,
      filename: attachment.fileName,
      mediaType: attachment.contentType,
    });
  }

  return contentParts;
}

export function toModelMessages(messages: ConversationMessage[]): ModelMessage[] {
  const modelMessages: ModelMessage[] = [];

  for (const message of messages) {
    if (message.role === "user") {
      const contentParts = toUserContentParts(message);

      if (contentParts.length === 0) {
        continue;
      }

      modelMessages.push({
        role: "user",
        content: contentParts,
      });
      continue;
    }

    const trimmedContent = message.content.trim();
    if (!trimmedContent) {
      continue;
    }

    modelMessages.push({
      role: "assistant",
      content: trimmedContent,
    });
  }

  return modelMessages;
}
