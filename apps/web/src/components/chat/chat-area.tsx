import { Button } from "@based-chat/ui/components/button";
import { Skeleton } from "@based-chat/ui/components/skeleton";
import { SidebarTrigger } from "@based-chat/ui/components/sidebar";
import { Separator } from "@based-chat/ui/components/separator";
import { ArrowDown, Sparkles } from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";

import {
  createComposerAttachmentFromMessageAttachment,
  revokeComposerAttachmentPreview,
} from "@/lib/attachments";
import type {
  AttachmentUploadHandlers,
  ComposerAttachment,
  DraftAttachment,
} from "@/lib/attachments";
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

function ThreadPendingState() {
  return (
    <div className="flex min-h-0 flex-1 items-center justify-center px-4">
      <div className="w-full max-w-3xl space-y-4 rounded-3xl border border-border/50 bg-card/30 p-6 shadow-sm backdrop-blur-sm">
        <div className="flex items-center gap-3">
          <div className="space-y-2">
            <Skeleton className="h-4 w-32 rounded-full" />
            <Skeleton className="h-3 w-24 rounded-full" />
          </div>
        </div>
        <div className="space-y-3">
          <Skeleton className="h-16 w-[82%] rounded-2xl" />
          <Skeleton className="ml-auto h-12 w-[68%] rounded-2xl" />
          <Skeleton className="h-24 w-[88%] rounded-2xl" />
        </div>
      </div>
    </div>
  );
}

export default function ChatArea({
  thread,
  messages,
  model,
  drivenStreamMessageIds,
  streamUrl,
  onModelChange,
  onMessageStreamStatusChange,
  onSendMessage,
  onEditMessage,
  onRetryMessage,
  onAbortStreaming,
  isStreaming,
  isThreadPending = false,
}: {
  thread: ThreadSummary | null;
  messages: ChatMessage[];
  model: Model;
  drivenStreamMessageIds: string[];
  streamUrl: URL;
  onModelChange: (model: Model) => void;
  onMessageStreamStatusChange: (
    threadId: ThreadSummary["_id"] | undefined,
    messageId: string,
    status: ChatMessage["streamStatus"],
  ) => void;
  onSendMessage: (
    message: string,
    attachments: DraftAttachment[],
    uploadHandlers?: AttachmentUploadHandlers,
  ) => void | Promise<void>;
  onEditMessage: (
    message: ChatMessage,
    nextContent: string,
    nextModel: Model,
    attachments: ComposerAttachment[],
  ) => void | Promise<void>;
  onRetryMessage: (message: ChatMessage) => void | Promise<void>;
  onAbortStreaming: () => void;
  isStreaming: boolean;
  isThreadPending?: boolean;
}) {
  const scrollContainerRef = useRef<HTMLDivElement>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const isAtBottomRef = useRef(true);
  const hasMessages = messages.length > 0;
  const [showScrollToBottom, setShowScrollToBottom] = useState(false);
  const [draftMessage, setDraftMessage] = useState("");
  const [editingMessageId, setEditingMessageId] = useState<string | null>(null);
  const [editingValue, setEditingValue] = useState("");
  const [editingModel, setEditingModel] = useState<Model | null>(null);
  const [editingAttachments, setEditingAttachments] = useState<ComposerAttachment[]>([]);
  const lastMessage = messages.at(-1);
  const lastMessageIsStreaming =
    lastMessage?.streamStatus === "pending" ||
    lastMessage?.streamStatus === "streaming" ||
    lastMessage?.isStreaming;

  const resetEditingState = useCallback(() => {
    setEditingAttachments((currentAttachments) => {
      currentAttachments.forEach(revokeComposerAttachmentPreview);
      return [];
    });
    setEditingMessageId(null);
    setEditingValue("");
    setEditingModel(null);
  }, []);

  const updateScrollState = useCallback(() => {
    const container = scrollContainerRef.current;
    if (!container) {
      return;
    }

    const distanceFromBottom =
      container.scrollHeight - container.scrollTop - container.clientHeight;
    const isAtBottom = distanceFromBottom <= 24;

    isAtBottomRef.current = isAtBottom;
    setShowScrollToBottom(!isAtBottom);
  }, []);

  const scrollToBottom = useCallback((behavior: ScrollBehavior = "auto") => {
    const container = scrollContainerRef.current;
    if (!container) {
      return;
    }

    container.scrollTo({
      top: container.scrollHeight,
      behavior,
    });
    isAtBottomRef.current = true;
    setShowScrollToBottom(false);
  }, []);

  useEffect(() => {
    updateScrollState();
  }, [messages.length, thread?._id, updateScrollState]);

  useEffect(() => {
    scrollToBottom("auto");
  }, [thread?._id, scrollToBottom]);

  useEffect(() => {
    setDraftMessage("");
    resetEditingState();
  }, [resetEditingState, thread?._id]);

  useEffect(() => {
    if (lastMessageIsStreaming) {
      updateScrollState();
      return;
    }

    if (isAtBottomRef.current) {
      scrollToBottom("auto");
      return;
    }

    updateScrollState();
  }, [
    lastMessage?.content,
    lastMessage?.id,
    lastMessageIsStreaming,
    messages.length,
    scrollToBottom,
    updateScrollState,
  ]);

  return (
    <div className="relative flex h-svh flex-col">
      <div className="flex shrink-0 items-center gap-2 border-b border-border/50 px-3 py-2">
        <SidebarTrigger />
        <Separator orientation="vertical" className="h-4" />
        <span className="truncate text-xs font-medium text-muted-foreground">
          {thread?.title || (isThreadPending ? "Opening chat" : "New chat")}
        </span>
      </div>

      {hasMessages ? (
        <div className="relative min-h-0 flex-1">
          <div
            ref={scrollContainerRef}
            onScroll={updateScrollState}
            className="thin-scrollbar h-full overflow-y-auto"
          >
            <div className="mx-auto max-w-3xl py-4">
              {messages.map((message) => (
                <MessageBubble
                  key={message.id}
                  message={message}
                  driveStream={drivenStreamMessageIds.includes(message.id)}
                  streamUrl={streamUrl}
                  onStreamStatusChange={(status) =>
                    onMessageStreamStatusChange(message.threadId, message.id, status)
                  }
                  onRetry={() => void onRetryMessage(message)}
                  onEdit={
                    message.role === "user"
                      ? () => {
                          editingAttachments.forEach(revokeComposerAttachmentPreview);
                          setEditingMessageId(message.id);
                          setEditingValue(message.content);
                          setEditingModel(message.model ?? model);
                          setEditingAttachments(
                            message.attachments.map(
                              createComposerAttachmentFromMessageAttachment,
                            ),
                          );
                        }
                      : undefined
                  }
                  isEditing={editingMessageId === message.id}
                  editingValue={editingValue}
                  editingModel={editingModel ?? undefined}
                  editingAttachments={editingAttachments}
                  onEditingValueChange={setEditingValue}
                  onEditingModelChange={setEditingModel}
                  onEditingAttachmentsChange={(nextAttachments) => {
                    setEditingAttachments(nextAttachments)
                  }}
                  onCancelEdit={() => {
                    resetEditingState();
                  }}
                  onSaveEdit={() => {
                    if (!editingMessageId || !editingModel) {
                      return;
                    }

                    void Promise.resolve(
                      onEditMessage(
                        message,
                        editingValue,
                        editingModel,
                        editingAttachments,
                      ),
                    ).then(() => {
                      resetEditingState();
                    });
                  }}
                />
              ))}
              <div ref={messagesEndRef} />
            </div>
          </div>
          {showScrollToBottom ? (
            <div className="pointer-events-none absolute inset-x-0 bottom-4 z-10">
              <div className="mx-auto flex max-w-3xl justify-center px-4">
                <Button
                  type="button"
                  size="icon-sm"
                  variant="outline"
                  onClick={() => scrollToBottom("auto")}
                  className="pointer-events-auto rounded-full border-border bg-card/95 text-foreground shadow-xl backdrop-blur-sm"
                >
                  <ArrowDown className="size-4" />
                </Button>
              </div>
            </div>
          ) : null}
        </div>
      ) : isThreadPending ? (
        <ThreadPendingState />
      ) : (
        <EmptyState model={model} />
      )}

      <ChatInput
        model={model}
        onModelChange={onModelChange}
        value={draftMessage}
        onValueChange={setDraftMessage}
        resetKey={thread?._id ?? "new-thread"}
        onSend={async (message, attachments, uploadHandlers) => {
          await onSendMessage(message, attachments, uploadHandlers);
          setDraftMessage("");
        }}
        isStreaming={isStreaming}
        onAbort={onAbortStreaming}
      />
    </div>
  );
}
