import { Button } from "@based-chat/ui/components/button";
import { cn } from "@based-chat/ui/lib/utils";
import { FileCode2, FileText, X } from "lucide-react";
import { useMemo, useState } from "react";

import type { ComposerAttachment } from "@/lib/attachments";
import {
  getAttachmentPreviewUrl,
  isImageAttachment,
} from "@/lib/attachments";

import ChatAttachmentDialog from "./chat-attachment-dialog";

function getFileIcon(contentType: string) {
  if (
    contentType.startsWith("text/") ||
    contentType.includes("json") ||
    contentType.includes("javascript") ||
    contentType.includes("typescript")
  ) {
    return FileCode2;
  }

  return FileText;
}

export default function ChatAttachmentStrip({
  attachments,
  onRemove,
  isBusy = false,
  progressById = {},
  className,
}: {
  attachments: ComposerAttachment[];
  onRemove?: (attachmentId: string) => void;
  isBusy?: boolean;
  progressById?: Record<string, number>;
  className?: string;
}) {
  const [selectedAttachmentId, setSelectedAttachmentId] = useState<string | null>(null);

  const dialogImages = useMemo(
    () =>
      attachments.map((attachment) => ({
        id: attachment.id,
        kind: attachment.kind,
        fileName: attachment.fileName,
        contentType: attachment.contentType,
        size: attachment.size,
        url:
          attachment.source === "stored"
            ? attachment.url
            : getAttachmentPreviewUrl(attachment),
        file: attachment.source === "draft" ? attachment.file : undefined,
      })),
    [attachments],
  );

  if (attachments.length === 0) {
    return null;
  }

  return (
    <>
      <div className={cn("flex flex-wrap gap-3", className)}>
        {attachments.map((attachment) => {
          const previewUrl = getAttachmentPreviewUrl(attachment);
          const progress = progressById[attachment.id] ?? 0;

          if (isImageAttachment(attachment) && previewUrl) {
            return (
              <div
                key={attachment.id}
                className="group/attachment relative h-20 w-20 overflow-hidden rounded-2xl border border-border/50 bg-muted/30 shadow-sm"
              >
                <button
                  type="button"
                  onClick={() => setSelectedAttachmentId(attachment.id)}
                  className="absolute inset-0 cursor-pointer"
                >
                  <img
                    src={previewUrl}
                    alt={attachment.fileName}
                    className="h-full w-full object-cover transition-transform duration-300 group-hover/attachment:scale-105"
                  />
                </button>

                {onRemove ? (
                  <button
                    type="button"
                    onClick={() => onRemove(attachment.id)}
                    className="absolute right-1.5 top-1.5 flex size-6 items-center justify-center rounded-full bg-black/65 text-white opacity-0 transition-opacity group-hover/attachment:opacity-100"
                    disabled={isBusy}
                  >
                    <X className="size-3.5" />
                  </button>
                ) : null}

                {isBusy ? (
                  <div className="absolute inset-x-1.5 bottom-1.5 rounded-full bg-black/60 px-1.5 py-1">
                    <div className="h-1 overflow-hidden rounded-full bg-white/15">
                      <div
                        className="h-full rounded-full bg-white transition-[width] duration-150"
                        style={{ width: `${progress}%` }}
                      />
                    </div>
                    <p className="mt-1 text-center text-[9px] font-medium text-white">
                      {Math.max(0, progress)}%
                    </p>
                  </div>
                ) : null}

                <div className="pointer-events-none absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/70 to-transparent px-2 py-1.5 text-left">
                  <p className="truncate text-[10px] font-medium text-white">
                    {attachment.fileName}
                  </p>
                </div>
              </div>
            );
          }

          const FileIcon = getFileIcon(attachment.contentType);

          return (
            <button
              key={attachment.id}
              type="button"
              onClick={() => setSelectedAttachmentId(attachment.id)}
              className="group/attachment relative flex min-w-[12rem] max-w-[16rem] items-start gap-3 rounded-2xl border border-border/50 bg-muted/20 px-3 py-2.5 text-left shadow-sm"
            >
              <div className="flex size-10 shrink-0 items-center justify-center rounded-2xl bg-card/80 text-muted-foreground">
                <FileIcon className="size-4" />
              </div>
              <div className="min-w-0 flex-1">
                <p className="truncate text-xs font-medium">{attachment.fileName}</p>
                <p className="mt-1 text-[11px] text-muted-foreground/70">
                  {Math.max(1, Math.round(attachment.size / 1024))} KB
                </p>
                {isBusy ? (
                  <div className="mt-2">
                    <div className="h-1 overflow-hidden rounded-full bg-border/70">
                      <div
                        className="h-full rounded-full bg-foreground transition-[width] duration-150"
                        style={{ width: `${progress}%` }}
                      />
                    </div>
                  </div>
                ) : null}
              </div>
              {onRemove ? (
                <Button
                  type="button"
                  size="icon-xs"
                  variant="ghost"
                  onClick={(event) => {
                    event.stopPropagation();
                    onRemove(attachment.id);
                  }}
                  disabled={isBusy}
                  className="rounded-full text-muted-foreground hover:text-foreground"
                >
                  <X className="size-3.5" />
                </Button>
              ) : null}
            </button>
          );
        })}
      </div>

      <ChatAttachmentDialog
        attachments={dialogImages}
        selectedAttachmentId={selectedAttachmentId}
        onSelectAttachment={setSelectedAttachmentId}
        onClose={() => setSelectedAttachmentId(null)}
      />
    </>
  );
}
