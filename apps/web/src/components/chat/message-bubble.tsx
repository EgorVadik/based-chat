import { Avatar, AvatarFallback } from "@based-chat/ui/components/avatar";
import { cn } from "@based-chat/ui/lib/utils";
import { Bot, User } from "lucide-react";

import type { ChatMessage } from "@/lib/chat";

import MarkdownRenderer from "./markdown-renderer";

export default function MessageBubble({ message }: { message: ChatMessage }) {
  const isUser = message.role === "user";
  const isStreaming = !isUser && message.isStreaming;

  return (
    <div
      className={cn(
        "group flex gap-3 px-4 py-4",
        isUser ? "flex-row-reverse" : "flex-row",
      )}
    >
      <Avatar
        size="sm"
        className={cn(
          "mt-0.5 shrink-0",
          isUser
            ? "bg-primary/10"
            : "bg-gradient-to-br from-primary/20 to-chart-5/20",
        )}
      >
        <AvatarFallback
          className={cn(
            "text-xs",
            isUser
              ? "bg-primary/10 text-primary"
              : "bg-gradient-to-br from-primary/10 to-chart-5/10 text-primary",
          )}
        >
          {isUser ? <User className="size-3.5" /> : <Bot className="size-3.5" />}
        </AvatarFallback>
      </Avatar>
      <div
        className={cn(
          "min-w-0 max-w-[85%]",
          isUser ? "text-right" : "text-left",
        )}
      >
        <div className="mb-1 flex items-center gap-2">
          <span
            className={cn(
              "text-xs font-medium",
              isUser ? "ml-auto" : "",
            )}
          >
            {isUser ? "You" : message.model?.name || "Assistant"}
          </span>
        </div>
        {isUser ? (
          <div className="inline-block rounded-2xl bg-muted/50 px-3.5 py-2.5 text-left text-sm leading-relaxed">
            {message.content}
          </div>
        ) : (
          <div>
            {message.content ? (
              <MarkdownRenderer content={message.content} />
            ) : (
              <div className="inline-flex items-center gap-2 rounded-full border border-border/60 bg-card/60 px-3 py-1.5 text-xs text-muted-foreground">
                <span className="size-1.5 animate-pulse rounded-full bg-primary/70" />
                <span>Thinking</span>
              </div>
            )}
            {isStreaming ? (
              <div className="mt-2 inline-flex items-center gap-2 rounded-full border border-primary/15 bg-primary/5 px-2.5 py-1 text-[11px] text-primary/80">
                <span className="size-1.5 animate-pulse rounded-full bg-primary" />
                <span>Streaming reply</span>
              </div>
            ) : null}
          </div>
        )}
      </div>
    </div>
  );
}
