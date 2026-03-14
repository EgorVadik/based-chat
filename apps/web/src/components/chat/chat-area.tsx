import { SidebarTrigger } from "@based-chat/ui/components/sidebar";
import { Separator } from "@based-chat/ui/components/separator";
import { Sparkles } from "lucide-react";
import { useEffect, useRef } from "react";
import type { Conversation, Model } from "@/lib/fake-data";
import ChatInput from "./chat-input";
import MessageBubble from "./message-bubble";

function EmptyState({ model }: { model: Model }) {
  return (
    <div className="flex flex-1 flex-col items-center justify-center px-4">
      <div className="flex flex-col items-center gap-4 max-w-md text-center">
        <div className="flex size-12 items-center justify-center rounded-xl bg-primary/10">
          <Sparkles className="size-6 text-primary" />
        </div>
        <div>
          <h2 className="text-lg font-semibold tracking-tight">
            Start a conversation
          </h2>
          <p className="mt-1.5 text-sm text-muted-foreground leading-relaxed">
            Ask anything. Write code. Analyze data. Get creative.
            <br />
            <span className="text-primary/80 font-medium">{model.name}</span> is ready.
          </p>
        </div>
        <div className="grid grid-cols-2 gap-2 w-full mt-2">
          {[
            "Explain quantum computing",
            "Write a Python web scraper",
            "Design a database schema",
            "Debug my React component",
          ].map((prompt) => (
            <button
              key={prompt}
              className="rounded-lg border border-border/50 bg-card/30 px-3 py-2.5 text-left text-xs text-muted-foreground hover:bg-card/60 hover:text-foreground hover:border-border transition-all"
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
  conversation,
  model,
}: {
  conversation: Conversation | null;
  model: Model;
}) {
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const hasMessages = conversation && conversation.messages.length > 0;

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [conversation?.messages.length]);

  return (
    <div className="flex h-svh flex-col">
      {/* Top bar */}
      <div className="flex items-center gap-2 px-3 py-2 border-b border-border/50">
        <SidebarTrigger />
        <Separator orientation="vertical" className="h-4" />
        <span className="text-xs font-medium text-muted-foreground truncate">
          {conversation?.title || "New chat"}
        </span>
      </div>

      {/* Messages area */}
      {hasMessages ? (
        <div className="flex-1 overflow-y-auto thin-scrollbar">
          <div className="mx-auto max-w-3xl py-4">
            {conversation.messages.map((message) => (
              <MessageBubble key={message.id} message={message} />
            ))}
            <div ref={messagesEndRef} />
          </div>
        </div>
      ) : (
        <EmptyState model={model} />
      )}

      {/* Input */}
      <ChatInput model={model} />
    </div>
  );
}
