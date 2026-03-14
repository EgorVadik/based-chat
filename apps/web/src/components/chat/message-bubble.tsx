import { Avatar, AvatarFallback } from "@based-chat/ui/components/avatar";
import { cn } from "@based-chat/ui/lib/utils";
import { Bot, User } from "lucide-react";
import type { Message } from "@/lib/fake-data";
import MarkdownRenderer from "./markdown-renderer";

export default function MessageBubble({ message }: { message: Message }) {
  const isUser = message.role === "user";

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
          <div className="inline-block rounded-2xl bg-muted/50 px-3.5 py-2.5 text-sm text-left leading-relaxed">
            {message.content}
          </div>
        ) : (
          <MarkdownRenderer content={message.content} />
        )}
      </div>
    </div>
  );
}
