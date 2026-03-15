import { Button } from "@based-chat/ui/components/button";
import { Textarea } from "@based-chat/ui/components/textarea";
import { cn } from "@based-chat/ui/lib/utils";
import { ArrowUp, Paperclip, Square } from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";
import { toast } from "sonner";

import type {
  AttachmentUploadHandlers,
  DraftAttachment,
} from "@/lib/attachments";
import {
  MAX_ATTACHMENTS,
  prepareDraftAttachments,
  revokeComposerAttachmentPreview,
} from "@/lib/attachments";
import type { Model } from "@/lib/models";

import ChatAttachmentStrip from "./chat-attachment-strip";
import ModelSelector from "./model-selector";

const MIN_TEXTAREA_HEIGHT = 96;
const MAX_TEXTAREA_HEIGHT = 240;

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
  className,
  resetKey,
}: {
  model: Model;
  onModelChange: (model: Model) => void;
  onSend?: (
    message: string,
    attachments: DraftAttachment[],
    uploadHandlers?: AttachmentUploadHandlers,
  ) => void | Promise<void>;
  onAbort?: () => void;
  value?: string;
  onValueChange?: (value: string) => void;
  disabled?: boolean;
  isStreaming?: boolean;
  className?: string;
  resetKey?: string;
}) {
  const [internalValue, setInternalValue] = useState("");
  const [attachments, setAttachments] = useState<DraftAttachment[]>([]);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [uploadProgressById, setUploadProgressById] = useState<
    Record<string, number>
  >({});
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const attachmentsRef = useRef<DraftAttachment[]>([]);
  const currentValue = value ?? internalValue;
  const canSend = currentValue.trim().length > 0 || attachments.length > 0;
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

    setAttachments((currentAttachments) => [
      ...currentAttachments,
      ...result.attachments,
    ]);
  }, []);

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
    currentValue,
    disabled,
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

      if (pastedFiles.length === 0) {
        return;
      }

      event.preventDefault();
      addAttachmentFiles(pastedFiles);
    },
    [addAttachmentFiles],
  );

  return (
    <div className={cn("w-full shrink-0", className)}>
      <div className="mx-auto max-w-3xl px-4 pb-4">
        <div className="rounded-2xl border border-border/60 bg-card/50 backdrop-blur-sm transition-colors focus-within:border-primary/30 focus-within:bg-card">
          <input
            ref={fileInputRef}
            type="file"
            multiple
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
          <div className="flex items-center justify-between border-t border-border/40 px-3 py-2.5">
            <div className="flex items-center gap-2">
              <Button
                type="button"
                variant="ghost"
                size="icon-sm"
                className="text-muted-foreground hover:text-foreground"
                onClick={() => fileInputRef.current?.click()}
                disabled={isSubmitting || isStreaming}
              >
                <Paperclip className="size-4" />
              </Button>
              <ModelSelector model={model} onModelChange={onModelChange} />
              {isSubmitting && attachments.length > 0 ? (
                <div className="rounded-full border border-border/50 bg-muted/40 px-2.5 py-1 text-[11px] text-muted-foreground">
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
                "transition-all",
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
        <p className="mt-2 text-center text-[11px] text-muted-foreground/50">
          Based Chat may produce inaccurate information. Verify important details.
        </p>
      </div>

    </div>
  );
}
