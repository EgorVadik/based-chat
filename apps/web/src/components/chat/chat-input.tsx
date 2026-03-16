import { Button } from "@based-chat/ui/components/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuLabel,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuTrigger,
} from "@based-chat/ui/components/dropdown-menu";
import { Textarea } from "@based-chat/ui/components/textarea";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@based-chat/ui/components/tooltip";
import { cn } from "@based-chat/ui/lib/utils";
import { ArrowUp, ChevronDown, Globe, Paperclip, Square } from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";
import { toast } from "sonner";

import { useLocalStorage } from "@/hooks/use-local-storage";
import type {
  AttachmentUploadHandlers,
  DraftAttachment,
} from "@/lib/attachments";
import {
  MAX_ATTACHMENTS,
  prepareDraftAttachments,
  revokeComposerAttachmentPreview,
} from "@/lib/attachments";
import {
  getModelAttachmentInputAccept,
  modelCanAcceptAttachments,
  modelSupportsAttachment,
  modelSupportsImageGeneration,
  type Model,
} from "@/lib/models";

import ChatAttachmentStrip from "./chat-attachment-strip";
import ModelSelector from "./model-selector";

const MIN_TEXTAREA_HEIGHT = 96;
const MAX_TEXTAREA_HEIGHT = 240;
const LARGE_PASTE_TEXT_THRESHOLD = 3000;
const WEB_SEARCH_ENABLED_STORAGE_KEY = "based-chat:web-search-enabled";
const WEB_SEARCH_MAX_RESULTS_STORAGE_KEY = "based-chat:web-search-max-results";
const MIN_WEB_SEARCH_MAX_RESULTS = 1;
const MAX_WEB_SEARCH_MAX_RESULTS = 5;
const WEB_SEARCH_RESULT_OPTIONS = [1, 2, 3, 4, 5] as const;
const SEARCH_TOOLTIP_TITLE = "Enable search grounding";
const SEARCH_TOOLTIP_COPY =
  "Adds $0.004 per search request, plus your selected model's normal input-token pricing for the returned search content.";
const IMAGE_GEN_SEARCH_TOOLTIP_COPY =
  "Search grounding is disabled for image-generation models.";

function normalizeWebSearchMaxResults(value: number) {
  return Math.min(
    MAX_WEB_SEARCH_MAX_RESULTS,
    Math.max(MIN_WEB_SEARCH_MAX_RESULTS, Math.trunc(value)),
  );
}

function createPastedTextFile(text: string) {
  const timestamp = new Date()
    .toISOString()
    .replace(/[:]/g, "-")
    .replace(/\.\d{3}Z$/, "Z");

  return new File([text], `pasted-text-${timestamp}.txt`, {
    type: "text/plain",
  });
}

function resizeTextarea(textarea: HTMLTextAreaElement | null) {
  if (!textarea) {
    return;
  }

  textarea.style.height = `${MIN_TEXTAREA_HEIGHT}px`;
  const nextHeight = Math.min(
    Math.max(textarea.scrollHeight, MIN_TEXTAREA_HEIGHT),
    MAX_TEXTAREA_HEIGHT,
  );
  textarea.style.height = `${nextHeight}px`;
  textarea.style.overflowY =
    textarea.scrollHeight > MAX_TEXTAREA_HEIGHT ? "auto" : "hidden";
}

function revokeDraftAttachments(attachments: DraftAttachment[]) {
  for (const attachment of attachments) {
    revokeComposerAttachmentPreview(attachment);
  }
}

export default function ChatInput({
  model,
  onModelChange,
  onSend,
  onAbort,
  value,
  onValueChange,
  disabled = false,
  isStreaming = false,
  autoFocus = false,
  className,
  resetKey,
}: {
  model: Model;
  onModelChange: (model: Model) => void;
  onSend?: (
    message: string,
    attachments: DraftAttachment[],
    uploadHandlers?: AttachmentUploadHandlers,
    options?: {
      webSearchEnabled?: boolean;
      webSearchMaxResults?: number;
    },
  ) => void | Promise<void>;
  onAbort?: () => void;
  value?: string;
  onValueChange?: (value: string) => void;
  disabled?: boolean;
  isStreaming?: boolean;
  autoFocus?: boolean;
  className?: string;
  resetKey?: string;
}) {
  const [internalValue, setInternalValue] = useState("");
  const [attachments, setAttachments] = useState<DraftAttachment[]>([]);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isWebSearchEnabled, setIsWebSearchEnabled] = useLocalStorage(
    WEB_SEARCH_ENABLED_STORAGE_KEY,
    false,
  );
  const [webSearchMaxResults, setWebSearchMaxResults] = useLocalStorage(
    WEB_SEARCH_MAX_RESULTS_STORAGE_KEY,
    MIN_WEB_SEARCH_MAX_RESULTS,
    {
      parse: (rawValue) => {
        const parsedValue = Number.parseInt(rawValue, 10);
        return Number.isFinite(parsedValue)
          ? normalizeWebSearchMaxResults(parsedValue)
          : MIN_WEB_SEARCH_MAX_RESULTS;
      },
      serialize: (value) => String(normalizeWebSearchMaxResults(value)),
    },
  );
  const [uploadProgressById, setUploadProgressById] = useState<
    Record<string, number>
  >({});
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const attachmentsRef = useRef<DraftAttachment[]>([]);
  const currentValue = value ?? internalValue;
  const canSend = currentValue.trim().length > 0 || attachments.length > 0;
  const canAttachToCurrentModel = modelCanAcceptAttachments(model);
  const canUseWebSearch = !modelSupportsImageGeneration(model);
  const attachmentInputAccept = getModelAttachmentInputAccept(model);
  const overallUploadProgress =
    attachments.length > 0
      ? Math.round(
          attachments.reduce(
            (total, attachment) =>
              total + (uploadProgressById[attachment.id] ?? 0),
            0,
          ) / attachments.length,
        )
      : 0;

  useEffect(() => {
    attachmentsRef.current = attachments;
  }, [attachments]);

  useEffect(() => {
    return () => {
      revokeDraftAttachments(attachmentsRef.current);
    };
  }, []);

  useEffect(() => {
    resizeTextarea(textareaRef.current);
  }, [currentValue]);

  useEffect(() => {
    if (!autoFocus || disabled || isSubmitting || isStreaming) {
      return;
    }

    textareaRef.current?.focus();
  }, [autoFocus, disabled, isStreaming, isSubmitting, resetKey]);

  useEffect(() => {
    if (!canUseWebSearch && isWebSearchEnabled) {
      setIsWebSearchEnabled(false);
    }
  }, [canUseWebSearch, isWebSearchEnabled, setIsWebSearchEnabled]);

  const setValue = useCallback(
    (nextValue: string) => {
      if (onValueChange) {
        onValueChange(nextValue);
        return;
      }

      setInternalValue(nextValue);
    },
    [onValueChange],
  );

  const clearAttachments = useCallback(() => {
    setAttachments((currentAttachments) => {
      revokeDraftAttachments(currentAttachments);
      return [];
    });
  }, []);

  useEffect(() => {
    if (isSubmitting) {
      return;
    }

    clearAttachments();
    setUploadProgressById({});
  }, [clearAttachments, isSubmitting, resetKey]);

  const addAttachmentFiles = useCallback((files: File[]) => {
    const result = prepareDraftAttachments(attachmentsRef.current, files);

    if (result.blockedCount > 0) {
      toast.error("Compressed files like zip, rar, or archive bundles are not allowed.");
    }

    if (result.overLimitCount > 0) {
      toast.error(`You can attach up to ${MAX_ATTACHMENTS} files per message.`);
    }

    if (result.attachments.length === 0) {
      return;
    }

    const supportedAttachments = result.attachments.filter((attachment) =>
      modelSupportsAttachment(model, attachment),
    );
    const blockedImageAttachments = result.attachments.filter(
      (attachment) =>
        attachment.kind === "image" && !modelSupportsAttachment(model, attachment),
    ).length;
    const blockedFileAttachments = result.attachments.filter(
      (attachment) =>
        attachment.kind === "file" && !modelSupportsAttachment(model, attachment),
    ).length;

    if (blockedImageAttachments > 0) {
      toast.error("This model doesn't support image attachments.");
    }

    if (blockedFileAttachments > 0) {
      toast.error("This model doesn't support file attachments.");
    }

    if (supportedAttachments.length === 0) {
      return;
    }

    setAttachments((currentAttachments) => [
      ...currentAttachments,
      ...supportedAttachments,
    ]);
  }, [model]);

  const handleSend = useCallback(async () => {
    if (disabled || isSubmitting || !canSend) return;

    setIsSubmitting(true);
    setUploadProgressById(
      Object.fromEntries(attachments.map((attachment) => [attachment.id, 0])),
    );

    try {
      await onSend?.(currentValue.trim(), attachments, {
        onUploadProgress: (attachmentId, progress) => {
          setUploadProgressById((currentProgress) => ({
            ...currentProgress,
            [attachmentId]: progress,
          }));
        },
      }, {
        webSearchEnabled: canUseWebSearch && isWebSearchEnabled,
        webSearchMaxResults,
      });
      setValue("");
      clearAttachments();
      setUploadProgressById({});
      resizeTextarea(textareaRef.current);
    } catch (error) {
      setUploadProgressById({});
      toast.error(
        error instanceof Error ? error.message : "Failed to send message.",
      );
    } finally {
      setIsSubmitting(false);
    }
  }, [
    attachments,
    canSend,
    clearAttachments,
    canUseWebSearch,
    currentValue,
    disabled,
    isWebSearchEnabled,
    webSearchMaxResults,
    isSubmitting,
    onSend,
    setValue,
  ]);

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (e.key === "Enter" && !e.shiftKey) {
        e.preventDefault();
        void handleSend();
      }
    },
    [handleSend],
  );

  const handleInput = useCallback(() => {
    resizeTextarea(textareaRef.current);
  }, []);

  const removeAttachment = useCallback((attachmentId: string) => {
    setAttachments((currentAttachments) => {
      const attachmentToRemove = currentAttachments.find(
        (attachment) => attachment.id === attachmentId,
      );

      if (attachmentToRemove) {
        revokeComposerAttachmentPreview(attachmentToRemove);
      }

      return currentAttachments.filter(
        (attachment) => attachment.id !== attachmentId,
      );
    });
  }, []);

  const handleFileSelection = useCallback(
    (event: React.ChangeEvent<HTMLInputElement>) => {
      addAttachmentFiles(Array.from(event.target.files ?? []));
      event.target.value = "";
    },
    [addAttachmentFiles],
  );

  const handlePaste = useCallback(
    (event: React.ClipboardEvent<HTMLTextAreaElement>) => {
      const pastedFiles = Array.from(event.clipboardData.items)
        .filter((item) => item.kind === "file")
        .map((item) => item.getAsFile())
        .filter((file): file is File => file !== null);

      if (pastedFiles.length > 0) {
        event.preventDefault();
        if (!canAttachToCurrentModel) {
          toast.error("This model can't accept attachments.");
          return;
        }
        addAttachmentFiles(pastedFiles);
        return;
      }

      const pastedText = event.clipboardData.getData("text/plain");
      if (pastedText.length <= LARGE_PASTE_TEXT_THRESHOLD) {
        return;
      }

      if (!model.capabilities.includes("pdf")) {
        return;
      }

      event.preventDefault();
      addAttachmentFiles([createPastedTextFile(pastedText)]);
      toast.success("Large pasted text was added as a .txt attachment.");
    },
    [addAttachmentFiles, canAttachToCurrentModel, model.capabilities],
  );

  return (
    <div className={cn("w-full shrink-0", className)}>
      <div className="mx-auto max-w-3xl px-4 pb-4">
        <div className="rounded-2xl border border-border/60 bg-card/50 backdrop-blur-sm transition-colors focus-within:border-primary/30 focus-within:bg-card">
          <input
            ref={fileInputRef}
            type="file"
            multiple
            accept={attachmentInputAccept}
            className="hidden"
            onChange={handleFileSelection}
          />

          {attachments.length > 0 ? (
            <div className="border-b border-border/40 px-4 pt-4">
              <ChatAttachmentStrip
                attachments={attachments}
                onRemove={removeAttachment}
                isBusy={isSubmitting}
                progressById={uploadProgressById}
              />
            </div>
          ) : null}

          <div className="px-4 pt-3.5">
            <Textarea
              ref={textareaRef}
              value={currentValue}
              onChange={(e) => setValue(e.target.value)}
              onKeyDown={handleKeyDown}
              onInput={handleInput}
              onPaste={handlePaste}
              disabled={disabled || isSubmitting || isStreaming}
              placeholder="Send a message..."
              rows={1}
              className="block min-h-[96px] w-full resize-none overflow-y-hidden border-0 bg-transparent px-0 py-0 pb-3 text-sm leading-relaxed shadow-none focus-visible:ring-0 dark:bg-transparent"
            />
          </div>
          <div className="border-t border-border/40 px-3 py-2.5">
            <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
              <div className="flex min-w-0 items-center gap-2">
                <div className="min-w-0 flex-1 sm:flex-none">
                  <ModelSelector
                    model={model}
                    onModelChange={onModelChange}
                    pendingAttachments={attachments}
                  />
                </div>
                <Button
                  type="button"
                  size="icon-sm"
                  onClick={() => {
                    if (isStreaming) {
                      onAbort?.();
                      return;
                    }

                    void handleSend();
                  }}
                  disabled={disabled || isSubmitting || (!canSend && !isStreaming)}
                  className={cn(
                    "shrink-0 transition-all sm:hidden",
                    isStreaming
                      ? "bg-destructive text-destructive-foreground hover:bg-destructive/90"
                      : !disabled && !isSubmitting && canSend
                      ? "bg-primary text-primary-foreground"
                      : "bg-muted text-muted-foreground",
                  )}
                >
                  {isStreaming ? (
                    <Square className="size-3.5 fill-current" />
                  ) : (
                    <ArrowUp className="size-4" />
                  )}
                </Button>
              </div>

              <div className="flex min-w-0 flex-wrap items-center gap-2 sm:flex-1 sm:justify-end">
                <Tooltip>
                  <TooltipTrigger
                    render={
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        aria-pressed={isWebSearchEnabled}
                        className={cn(
                          "h-9 min-w-[6.25rem] flex-1 justify-center rounded-full border px-3 text-[13px] transition-all sm:h-8 sm:min-w-0 sm:flex-none",
                          isWebSearchEnabled
                            ? "border-primary/40 bg-primary/10 text-foreground shadow-[inset_0_0_0_1px_rgba(255,255,255,0.05)] hover:border-primary/50 hover:bg-primary/14"
                            : "border-border/60 bg-background/35 text-muted-foreground hover:border-border hover:bg-background/55 hover:text-foreground",
                          !canUseWebSearch && "opacity-50",
                        )}
                        onClick={() =>
                          setIsWebSearchEnabled((current) => !current)
                        }
                        disabled={
                          isSubmitting || isStreaming || !canUseWebSearch
                        }
                      >
                        <Globe
                          className={cn(
                            "size-3.5",
                            isWebSearchEnabled && "text-primary",
                          )}
                        />
                        <span>Search</span>
                      </Button>
                    }
                  />
                  <TooltipContent
                    side="top"
                    align="center"
                    className="max-w-72 rounded-2xl border border-white/8 bg-zinc-950/96 px-3.5 py-3 text-zinc-100 shadow-2xl backdrop-blur-xl"
                  >
                    <div className="space-y-1.5">
                      <p className="text-[13px] font-semibold text-zinc-50">
                        {canUseWebSearch
                          ? SEARCH_TOOLTIP_TITLE
                          : "Search unavailable"}
                      </p>
                      <p className="text-[12px] leading-relaxed text-zinc-300">
                        {canUseWebSearch
                          ? SEARCH_TOOLTIP_COPY
                          : IMAGE_GEN_SEARCH_TOOLTIP_COPY}
                      </p>
                    </div>
                  </TooltipContent>
                </Tooltip>
                {isWebSearchEnabled && canUseWebSearch ? (
                  <DropdownMenu>
                    <DropdownMenuTrigger
                      render={
                        <Button
                          type="button"
                          variant="outline"
                          size="sm"
                          className="h-9 min-w-[6.75rem] flex-1 justify-center rounded-full border-border/60 bg-background/35 px-3 text-[13px] text-muted-foreground transition-all hover:border-border hover:bg-background/55 hover:text-foreground sm:h-8 sm:min-w-0 sm:flex-none"
                          disabled={isSubmitting || isStreaming}
                        >
                          <span>
                            {webSearchMaxResults}{" "}
                            {webSearchMaxResults === 1 ? "result" : "results"}
                          </span>
                          <ChevronDown className="size-3.5 text-muted-foreground/70" />
                        </Button>
                      }
                    />
                    <DropdownMenuContent
                      align="start"
                      side="top"
                      sideOffset={10}
                      className="min-w-36 rounded-2xl border border-white/8 bg-zinc-950/96 p-1.5 text-zinc-100 shadow-2xl ring-0"
                    >
                      <DropdownMenuGroup>
                        <DropdownMenuLabel className="px-2.5 pb-1 text-[11px] uppercase tracking-[0.18em] text-zinc-500">
                          Max results
                        </DropdownMenuLabel>
                        <DropdownMenuRadioGroup
                          value={String(webSearchMaxResults)}
                          onValueChange={(value) => {
                            setWebSearchMaxResults(
                              normalizeWebSearchMaxResults(
                                Number.parseInt(value, 10),
                              ),
                            );
                          }}
                        >
                          {WEB_SEARCH_RESULT_OPTIONS.map((option) => (
                            <DropdownMenuRadioItem
                              key={option}
                              value={String(option)}
                              className="rounded-xl px-2.5 py-2 text-[13px] text-zinc-200 focus:bg-zinc-900 focus:text-zinc-50"
                            >
                              {option} {option === 1 ? "result" : "results"}
                            </DropdownMenuRadioItem>
                          ))}
                        </DropdownMenuRadioGroup>
                      </DropdownMenuGroup>
                    </DropdownMenuContent>
                  </DropdownMenu>
                ) : null}
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  className="h-9 min-w-[6rem] flex-1 justify-center rounded-full border-border/60 bg-background/35 px-3 text-[13px] text-muted-foreground transition-all hover:border-border hover:bg-background/55 hover:text-foreground disabled:opacity-40 sm:h-8 sm:min-w-0 sm:flex-none"
                  onClick={() => fileInputRef.current?.click()}
                  disabled={isSubmitting || isStreaming || !canAttachToCurrentModel}
                >
                  <Paperclip className="size-3.5" />
                  <span>Attach</span>
                </Button>
                {isSubmitting && attachments.length > 0 ? (
                  <div className="w-full rounded-full border border-border/50 bg-muted/40 px-2.5 py-1.5 text-center text-[11px] text-muted-foreground sm:w-auto sm:py-1">
                    {overallUploadProgress < 100
                      ? `Uploading ${overallUploadProgress}%`
                      : "Sending message..."}
                  </div>
                ) : null}
              </div>

              <Button
                type="button"
                size="icon-sm"
                onClick={() => {
                  if (isStreaming) {
                    onAbort?.();
                    return;
                  }

                  void handleSend();
                }}
                disabled={disabled || isSubmitting || (!canSend && !isStreaming)}
                className={cn(
                  "hidden shrink-0 transition-all sm:inline-flex",
                  isStreaming
                    ? "bg-destructive text-destructive-foreground hover:bg-destructive/90"
                    : !disabled && !isSubmitting && canSend
                    ? "bg-primary text-primary-foreground"
                    : "bg-muted text-muted-foreground",
                )}
              >
                {isStreaming ? (
                  <Square className="size-3.5 fill-current" />
                ) : (
                  <ArrowUp className="size-4" />
                )}
              </Button>
            </div>
          </div>
        </div>
        <p className="mt-2 text-center text-[11px] text-muted-foreground/50">
          Based Chat may produce inaccurate information. Verify important details.
        </p>
      </div>

    </div>
  );
}
