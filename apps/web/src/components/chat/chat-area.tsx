import { Button } from "@based-chat/ui/components/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@based-chat/ui/components/dropdown-menu";
import { Skeleton } from "@based-chat/ui/components/skeleton";
import { SidebarTrigger } from "@based-chat/ui/components/sidebar";
import { Separator } from "@based-chat/ui/components/separator";
import {
  ArrowDown,
  Clock3,
  Monitor,
  Moon,
  Settings2,
  Sparkles,
  Sun,
} from "lucide-react";
import { useNavigate } from "@tanstack/react-router";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import { useTheme } from "@/components/theme-provider";
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

function EmptyState({
  model,
  isTemporaryChat,
}: {
  model: Model;
  isTemporaryChat: boolean;
}) {
  return (
    <div className="flex min-h-0 flex-1 flex-col items-center justify-center px-4">
      <div className="flex max-w-md flex-col items-center gap-4 text-center">
        <div className="flex size-12 items-center justify-center rounded-xl bg-primary/10">
          {isTemporaryChat ? (
            <Clock3 className="size-6 text-primary" />
          ) : (
            <Sparkles className="size-6 text-primary" />
          )}
        </div>
        <div>
          <h2 className="text-lg font-semibold tracking-tight">
            {isTemporaryChat ? "Temporary chat" : "Start a conversation"}
          </h2>
          <p className="mt-1.5 text-sm leading-relaxed text-muted-foreground">
            {isTemporaryChat ? (
              <>
                Messages stay in this browser session and will not be saved to your
                account history.
              </>
            ) : (
              <>
                Ask anything. Write code. Analyze data. Get creative.
                <br />
                <span className="font-medium text-primary/80">{model.name}</span> is ready.
              </>
            )}
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

function SettingsDropdown() {
  const navigate = useNavigate();
  const { theme, setTheme } = useTheme();
  const selectedTheme = theme ?? "system";

  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        render={
          <Button
            type="button"
            variant="ghost"
            size="icon-sm"
            className="text-muted-foreground hover:text-foreground"
          />
        }
      >
        <Settings2 className="size-4" />
        <span className="sr-only">Open chat settings</span>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" sideOffset={10} className="w-52">
        <DropdownMenuGroup>
          <DropdownMenuLabel>Theme</DropdownMenuLabel>
          <DropdownMenuRadioGroup
            value={selectedTheme}
            onValueChange={(value) =>
              setTheme(value as "light" | "dark" | "system")
            }
          >
            <DropdownMenuRadioItem value="light">
              <Sun className="size-3.5" />
              <span>Light</span>
            </DropdownMenuRadioItem>
            <DropdownMenuRadioItem value="dark">
              <Moon className="size-3.5" />
              <span>Dark</span>
            </DropdownMenuRadioItem>
            <DropdownMenuRadioItem value="system">
              <Monitor className="size-3.5" />
              <span>System</span>
            </DropdownMenuRadioItem>
          </DropdownMenuRadioGroup>
        </DropdownMenuGroup>
        <DropdownMenuSeparator />
        <DropdownMenuItem
          onClick={() =>
            void navigate({
              to: "/settings",
              search: { tab: "profile" },
            })
          }
        >
          <Settings2 className="size-3.5" />
          <span>Open settings</span>
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
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
  onStartTemporaryChat,
  isStreaming,
  isThreadPending = false,
  isTemporaryChat = false,
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
    options?: {
      webSearchEnabled?: boolean;
      webSearchMaxResults?: number;
    },
  ) => void | Promise<void>;
  onEditMessage: (
    message: ChatMessage,
    nextContent: string,
    nextModel: Model,
    attachments: ComposerAttachment[],
  ) => void | Promise<void>;
  onRetryMessage: (message: ChatMessage) => void | Promise<void>;
  onAbortStreaming: () => void;
  onStartTemporaryChat: () => void;
  isStreaming: boolean;
  isThreadPending?: boolean;
  isTemporaryChat?: boolean;
}) {
  const scrollContainerRef = useRef<HTMLDivElement>(null);
  const isAtBottomRef = useRef(true);
  const scrollFrameRef = useRef<number | null>(null);
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
  const drivenStreamMessageIdSet = useMemo(
    () => new Set(drivenStreamMessageIds),
    [drivenStreamMessageIds],
  );

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
    if (scrollFrameRef.current !== null) {
      return;
    }

    scrollFrameRef.current = window.requestAnimationFrame(() => {
      scrollFrameRef.current = null;
      const container = scrollContainerRef.current;
      if (!container) {
        return;
      }

      const distanceFromBottom =
        container.scrollHeight - container.scrollTop - container.clientHeight;
      const isAtBottom = distanceFromBottom <= 24;

      isAtBottomRef.current = isAtBottom;
      setShowScrollToBottom((currentValue) =>
        currentValue === !isAtBottom ? currentValue : !isAtBottom,
      );
    });
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
    return () => {
      if (scrollFrameRef.current !== null) {
        window.cancelAnimationFrame(scrollFrameRef.current);
      }
    };
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
    if (isAtBottomRef.current) {
      scrollToBottom("smooth");
      return;
    }

    updateScrollState();
  }, [
    lastMessage?.content,
    lastMessage?.id,
    messages.length,
    scrollToBottom,
    updateScrollState,
  ]);

  return (
    <div className="relative flex h-svh flex-col">
      <div className="flex shrink-0 items-center gap-2 border-b border-border/50 px-3 py-2">
        <SidebarTrigger />
        <Separator orientation="vertical" className="h-4" />
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <span className="truncate text-xs font-medium text-muted-foreground">
              {thread?.title || (isThreadPending ? "Opening chat" : "New chat")}
            </span>
            {isTemporaryChat ? (
              <span className="rounded-full border border-primary/20 bg-primary/10 px-2 py-0.5 text-[10px] font-mono uppercase tracking-[0.18em] text-primary">
                Temporary
              </span>
            ) : null}
          </div>
        </div>
        <Button
          type="button"
          variant={isTemporaryChat ? "secondary" : "ghost"}
          size="icon-sm"
          onClick={onStartTemporaryChat}
          className="text-muted-foreground hover:text-foreground"
        >
          <Clock3 className="size-4" />
          <span className="sr-only">Start temporary chat</span>
        </Button>
        <SettingsDropdown />
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
                  driveStream={drivenStreamMessageIdSet.has(message.id)}
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
            </div>
          </div>
          {showScrollToBottom ? (
            <div className="pointer-events-none absolute inset-x-0 bottom-4 z-10">
              <div className="mx-auto flex max-w-3xl justify-center px-4">
                <Button
                  type="button"
                  size="icon-sm"
                  variant="outline"
                  onClick={() => scrollToBottom("smooth")}
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
        <EmptyState model={model} isTemporaryChat={isTemporaryChat} />
      )}

      <ChatInput
        model={model}
        onModelChange={onModelChange}
        value={draftMessage}
        onValueChange={setDraftMessage}
        autoFocus={!thread && !isThreadPending}
        resetKey={thread?._id ?? "new-thread"}
        onSend={async (message, attachments, uploadHandlers, options) => {
          await onSendMessage(message, attachments, uploadHandlers, options);
          setDraftMessage("");
        }}
        isStreaming={isStreaming}
        onAbort={onAbortStreaming}
      />
    </div>
  );
}
