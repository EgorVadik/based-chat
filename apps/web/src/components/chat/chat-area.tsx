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
import { toast } from "sonner";

import { useTheme } from "@/components/theme-provider";
import {
  createComposerAttachmentFromMessageAttachment,
  revokeComposerAttachmentPreview,
} from "@/lib/attachments";
import type {
  AttachmentUploadHandlers,
  ComposerAttachment,
  DraftAttachment,
  MessageAttachment,
} from "@/lib/attachments";
import type { ChatMessage } from "@/lib/chat";
import { getErrorMessage } from "@/lib/errors";
import { modelSupportsAttachments, type Model } from "@/lib/models";
import type { ThreadSummary } from "@/lib/threads";

import ChatInput from "./chat-input";
import MessageBubble from "./message-bubble";

const SUGGESTED_PROMPTS = [
  "Explain quantum computing",
  "Write a Python web scraper",
  "Design a database schema",
  "Debug my React component",
];

const NO_ATTACHMENTS: MessageAttachment[] = [];

function EmptyState({
  model,
  isTemporaryChat,
  onSelectPrompt,
}: {
  model: Model;
  isTemporaryChat: boolean;
  onSelectPrompt: (prompt: string) => void;
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
          {SUGGESTED_PROMPTS.map((prompt) => (
            <Button
              key={prompt}
              type="button"
              variant="outline"
              onClick={() => onSelectPrompt(prompt)}
              className="h-auto justify-start truncate rounded-lg border-border/50 bg-card/30 px-3 py-2.5 text-left text-xs font-normal text-muted-foreground hover:border-border hover:bg-card/60 hover:text-foreground dark:border-border/50 dark:bg-card/30 dark:hover:bg-card/60"
            >
              {prompt}
            </Button>
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
  onRetryMessage: (message: ChatMessage, model?: Model) => void | Promise<void>;
  onAbortStreaming: () => void;
  onStartTemporaryChat: () => void;
  isStreaming: boolean;
  isThreadPending?: boolean;
  isTemporaryChat?: boolean;
}) {
  const scrollContainerRef = useRef<HTMLDivElement>(null);
  const scrollContentRef = useRef<HTMLDivElement>(null);
  const isAtBottomRef = useRef(true);
  const userScrollIntentRef = useRef(false);
  const isStreamingRef = useRef(isStreaming);
  const scrollFrameRef = useRef<number | null>(null);
  const hasMessages = messages.length > 0;
  const [showScrollToBottom, setShowScrollToBottom] = useState(false);
  const [draftMessage, setDraftMessage] = useState("");
  const [composerFocusSignal, setComposerFocusSignal] = useState(0);
  const [editingMessageId, setEditingMessageId] = useState<string | null>(null);
  const [editingValue, setEditingValue] = useState("");
  const [editingModel, setEditingModel] = useState<Model | null>(null);
  const [editingAttachments, setEditingAttachments] = useState<ComposerAttachment[]>([]);
  const [isSavingEdit, setIsSavingEdit] = useState(false);
  const isSavingEditRef = useRef(false);
  // Message bubbles are memoized without comparing callbacks, so handlers read
  // the latest props through this ref instead of a captured closure.
  const latestPropsRef = useRef({ model, onEditMessage, onRetryMessage });
  const drivenStreamMessageIdSet = useMemo(
    () => new Set(drivenStreamMessageIds),
    [drivenStreamMessageIds],
  );
  // Retrying resends the source user message, so gate retry models on its
  // attachments (for replies: the closest preceding user message).
  const retryAttachmentsByMessageId = useMemo(() => {
    const attachmentsByMessageId = new Map<string, MessageAttachment[]>();
    let sourceAttachments = NO_ATTACHMENTS;

    for (const message of messages) {
      if (message.role === "user") {
        sourceAttachments = message.attachments;
      }

      attachmentsByMessageId.set(message.id, sourceAttachments);
    }

    return attachmentsByMessageId;
  }, [messages]);

  useEffect(() => {
    latestPropsRef.current = { model, onEditMessage, onRetryMessage };
  }, [model, onEditMessage, onRetryMessage]);

  useEffect(() => {
    isStreamingRef.current = isStreaming;
  }, [isStreaming]);

  const resetEditingState = useCallback(() => {
    setEditingAttachments((currentAttachments) => {
      currentAttachments.forEach(revokeComposerAttachmentPreview);
      return [];
    });
    setEditingMessageId(null);
    setEditingValue("");
    setEditingModel(null);
  }, []);

  const startEditingMessage = useCallback((message: ChatMessage) => {
    setEditingAttachments((currentAttachments) => {
      currentAttachments.forEach(revokeComposerAttachmentPreview);
      return message.attachments.map(
        createComposerAttachmentFromMessageAttachment,
      );
    });
    setEditingMessageId(message.id);
    setEditingValue(message.content);
    setEditingModel(message.model ?? latestPropsRef.current.model);
  }, []);

  const handleRetry = useCallback((message: ChatMessage, retryModel?: Model) => {
    void Promise.resolve()
      .then(() => latestPropsRef.current.onRetryMessage(message, retryModel))
      .catch((error) => {
        toast.error(getErrorMessage(error, "Failed to retry the message."));
      });
  }, []);

  const handleSaveEdit = (message: ChatMessage) => {
    if (!editingMessageId || !editingModel || isSavingEditRef.current) {
      return;
    }

    if (!editingValue.trim() && editingAttachments.length === 0) {
      toast.error("Add a message or an attachment before saving.");
      return;
    }

    if (!modelSupportsAttachments(editingModel, editingAttachments)) {
      toast.error(
        `${editingModel.name} can't accept these attachments. Remove them or pick another model.`,
      );
      return;
    }

    isSavingEditRef.current = true;
    setIsSavingEdit(true);

    void Promise.resolve()
      .then(() =>
        latestPropsRef.current.onEditMessage(
          message,
          editingValue,
          editingModel,
          editingAttachments,
        ),
      )
      .then(() => {
        resetEditingState();
      })
      .catch((error) => {
        toast.error(getErrorMessage(error, "Failed to save your edit."));
      })
      .finally(() => {
        isSavingEditRef.current = false;
        setIsSavingEdit(false);
      });
  };

  const handleSelectPrompt = useCallback((prompt: string) => {
    setDraftMessage(prompt);
    setComposerFocusSignal((currentSignal) => currentSignal + 1);
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

      if (distanceFromBottom <= 24) {
        isAtBottomRef.current = true;
        userScrollIntentRef.current = false;
      } else if (userScrollIntentRef.current) {
        // Only user input unpins. Programmatic scrolls (smooth animations in
        // flight while content keeps growing) must not drop the bottom lock.
        isAtBottomRef.current = false;
      }

      const shouldShowScrollToBottom = !isAtBottomRef.current;
      setShowScrollToBottom((currentValue) =>
        currentValue === shouldShowScrollToBottom
          ? currentValue
          : shouldShowScrollToBottom,
      );
    });
  }, []);

  const markUserScrollIntent = useCallback(() => {
    userScrollIntentRef.current = true;
  }, []);

  const handleScrollKeyDown = useCallback(
    (event: React.KeyboardEvent<HTMLDivElement>) => {
      if (
        event.target instanceof HTMLTextAreaElement ||
        event.target instanceof HTMLInputElement
      ) {
        return;
      }

      if (
        ["ArrowUp", "ArrowDown", "PageUp", "PageDown", "Home", "End", " "].includes(
          event.key,
        )
      ) {
        markUserScrollIntent();
      }
    },
    [markUserScrollIntent],
  );

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
    userScrollIntentRef.current = false;
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

  // Follow content growth (streamed text, new messages, late image loads)
  // while pinned. Streaming uses instant scrolling so it never lags behind.
  useEffect(() => {
    const content = scrollContentRef.current;
    if (!content || typeof ResizeObserver === "undefined") {
      return;
    }

    // The first callback fires when the list first renders (e.g. after a
    // pending thread loads); jump there instead of animating through it.
    let isInitialObservation = true;
    const observer = new ResizeObserver(() => {
      const behavior =
        isInitialObservation || isStreamingRef.current ? "auto" : "smooth";
      isInitialObservation = false;

      if (isAtBottomRef.current) {
        scrollToBottom(behavior);
        return;
      }

      updateScrollState();
    });

    observer.observe(content);
    return () => observer.disconnect();
  }, [hasMessages, scrollToBottom, updateScrollState]);

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
            onWheel={markUserScrollIntent}
            onTouchMove={markUserScrollIntent}
            onPointerDown={markUserScrollIntent}
            onKeyDown={handleScrollKeyDown}
            className="thin-scrollbar h-full overflow-y-auto"
          >
            <div ref={scrollContentRef} className="mx-auto max-w-3xl py-4">
              {messages.map((message) => {
                const isEditingMessage = editingMessageId === message.id;

                return (
                  <MessageBubble
                    key={message.id}
                    message={message}
                    driveStream={drivenStreamMessageIdSet.has(message.id)}
                    streamUrl={streamUrl}
                    onStreamStatusChange={(status) =>
                      onMessageStreamStatusChange(message.threadId, message.id, status)
                    }
                    onRetry={(retryModel) => handleRetry(message, retryModel)}
                    retryAttachments={
                      retryAttachmentsByMessageId.get(message.id) ?? NO_ATTACHMENTS
                    }
                    onEdit={
                      message.role === "user"
                        ? () => startEditingMessage(message)
                        : undefined
                    }
                    isEditing={isEditingMessage}
                    isSavingEdit={isEditingMessage && isSavingEdit}
                    // Editing state only goes to the bubble being edited so
                    // keystrokes don't re-render every other message.
                    editingValue={isEditingMessage ? editingValue : undefined}
                    editingModel={
                      isEditingMessage ? (editingModel ?? undefined) : undefined
                    }
                    editingAttachments={
                      isEditingMessage ? editingAttachments : undefined
                    }
                    onEditingValueChange={setEditingValue}
                    onEditingModelChange={setEditingModel}
                    onEditingAttachmentsChange={setEditingAttachments}
                    onCancelEdit={resetEditingState}
                    onSaveEdit={() => handleSaveEdit(message)}
                  />
                );
              })}
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
        <EmptyState
          model={model}
          isTemporaryChat={isTemporaryChat}
          onSelectPrompt={handleSelectPrompt}
        />
      )}

      <ChatInput
        model={model}
        onModelChange={onModelChange}
        value={draftMessage}
        onValueChange={setDraftMessage}
        autoFocus={!thread && !isThreadPending}
        focusSignal={composerFocusSignal}
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
