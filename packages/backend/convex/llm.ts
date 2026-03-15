type StoredAttachment = {
  fileName: string;
  contentType: string;
};

type ConversationMessage = {
  role: "user" | "system";
  content: string;
  attachments?: StoredAttachment[];
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

function summarizeAttachments(attachments: StoredAttachment[] | undefined) {
  if (!attachments || attachments.length === 0) {
    return "";
  }

  const fileList = attachments
    .map((attachment) => `${attachment.fileName} (${attachment.contentType})`)
    .join(", ");

  return `Attached files: ${fileList}`;
}

export function getOpenRouterModelId(modelId: string) {
  return OPENROUTER_MODEL_IDS[modelId] ?? modelId;
}

export function toModelMessages(
  messages: ConversationMessage[],
): { role: "user" | "assistant"; content: string }[] {
  return messages.flatMap((message) => {
    const attachmentSummary = summarizeAttachments(message.attachments);
    const parts = [message.content.trim(), attachmentSummary].filter(Boolean);

    if (parts.length === 0) {
      return [];
    }

    const role: "user" | "assistant" =
      message.role === "user" ? "user" : "assistant";
    return [{ role, content: parts.join("\n\n") }];
  });
}
