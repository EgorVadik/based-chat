import type { Model } from "@/lib/models";

export type ChatMessage = {
  id: string;
  role: "user" | "assistant";
  content: string;
  model?: Model;
  createdAt: Date;
  isStreaming?: boolean;
};
