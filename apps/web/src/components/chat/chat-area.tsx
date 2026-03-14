import { Button } from "@based-chat/ui/components/button";
import { SidebarTrigger } from "@based-chat/ui/components/sidebar";
import { Separator } from "@based-chat/ui/components/separator";
import { LoaderCircle, Sparkles, WandSparkles } from "lucide-react";
import { useEffect, useRef } from "react";

import type { ChatMessage } from "@/lib/chat";
import type { Model } from "@/lib/models";
import type { ThreadSummary } from "@/lib/threads";

import ChatInput from "./chat-input";
import MessageBubble from "./message-bubble";

function EmptyState({ model }: { model: Model }) {
  return (
    <div className="flex min-h-0 flex-1 flex-col items-center justify-center px-4">
      <div className="flex max-w-md flex-col items-center gap-4 text-center">
        <div className="flex size-12 items-center justify-center rounded-xl bg-primary/10">
          <Sparkles className="size-6 text-primary" />
        </div>
        <div>
          <h2 className="text-lg font-semibold tracking-tight">
            Start a conversation
          </h2>
          <p className="mt-1.5 text-sm leading-relaxed text-muted-foreground">
            Ask anything. Write code. Analyze data. Get creative.
            <br />
            <span className="font-medium text-primary/80">{model.name}</span> is ready.
          </p>
        </div>
        <div className="mt-2 grid w-full grid-cols-2 gap-2">
          {[
            "Explain quantum computing",
            "Write a Python web scraper",
            "Design a database schema",
            "Debug my React component",
          ].map((prompt) => (
            <button
              key={prompt}
              className="rounded-lg border border-border/50 bg-card/30 px-3 py-2.5 text-left text-xs text-muted-foreground transition-all hover:border-border hover:bg-card/60 hover:text-foreground"
            >
              {prompt}
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}

export default function ChatArea({
  thread,
  messages,
  model,
  onModelChange,
  onSimulateMessage,
  isStreaming,
}: {
  thread: ThreadSummary | null;
  messages: ChatMessage[];
  model: Model;
  onModelChange: (model: Model) => void;
  onSimulateMessage: () => void;
  isStreaming: boolean;
}) {
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const hasMessages = messages.length > 0;
  const lastMessage = messages.at(-1);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [
    messages.length,
    lastMessage?.content,
    lastMessage?.isStreaming,
  ]);

  return (
    <div className="flex h-svh flex-col">
      <div className="flex shrink-0 items-center gap-2 border-b border-border/50 px-3 py-2">
        <SidebarTrigger />
        <Separator orientation="vertical" className="h-4" />
        <span className="truncate text-xs font-medium text-muted-foreground">
          {thread?.title || "New chat"}
        </span>
        <div className="ml-auto">
          <Button
            variant="outline"
            size="sm"
            onClick={onSimulateMessage}
            disabled={!thread || isStreaming}
            className="rounded-full border-border/60 bg-background/80 px-3 backdrop-blur-sm"
          >
            {isStreaming ? (
              <LoaderCircle className="size-3.5 animate-spin" />
            ) : (
              <WandSparkles className="size-3.5" />
            )}
            <span>{isStreaming ? "Streaming..." : "Simulate Stream"}</span>
          </Button>
        </div>
      </div>

      {hasMessages ? (
        <div className="thin-scrollbar min-h-0 flex-1 overflow-y-auto">
          <div className="mx-auto max-w-3xl py-4">
            {messages.map((message) => (
              <MessageBubble key={message.id} message={message} />
            ))}
            <div ref={messagesEndRef} />
          </div>
        </div>
      ) : (
        <EmptyState model={model} />
      )}

      <ChatInput model={model} onModelChange={onModelChange} />
    </div>
  );
}
