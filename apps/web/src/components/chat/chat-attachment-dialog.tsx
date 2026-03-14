import { Button } from "@based-chat/ui/components/button";
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogTitle,
} from "@based-chat/ui/components/dialog";
import { cn } from "@based-chat/ui/lib/utils";
import { ExternalLink, FileText, X } from "lucide-react";
import { useEffect, useMemo, useState } from "react";

import {
  canRenderTextAttachment,
  isImageAttachment,
  isPdfAttachment,
} from "@/lib/attachments";

type DialogAttachment = {
  id: string;
  kind: "image" | "file";
  fileName: string;
  contentType: string;
  size: number;
  url: string | null;
  file?: File;
};

export default function ChatAttachmentDialog({
  attachments,
  selectedAttachmentId,
  onSelectAttachment,
  onClose,
}: {
  attachments: DialogAttachment[];
  selectedAttachmentId: string | null;
  onSelectAttachment: (attachmentId: string) => void;
  onClose: () => void;
}) {
  const selectedIndex = attachments.findIndex(
    (attachment) => attachment.id === selectedAttachmentId,
  );
  const selectedAttachment =
    selectedIndex >= 0 ? attachments[selectedIndex] : null;
  const isOpen = selectedIndex >= 0;
  const [textContent, setTextContent] = useState<string | null>(null);
  const [isLoadingText, setIsLoadingText] = useState(false);
  const [textError, setTextError] = useState<string | null>(null);

  const objectUrl = useMemo(() => {
    if (!selectedAttachment?.file) {
      return null;
    }

    return URL.createObjectURL(selectedAttachment.file);
  }, [selectedAttachment]);

  useEffect(() => {
    return () => {
      if (objectUrl) {
        URL.revokeObjectURL(objectUrl);
      }
    };
  }, [objectUrl]);

  useEffect(() => {
    if (!selectedAttachment || !canRenderTextAttachment(selectedAttachment)) {
      setTextContent(null);
      setTextError(null);
      setIsLoadingText(false);
      return;
    }

    let cancelled = false;
    setIsLoadingText(true);
    setTextError(null);

    const loadText = async () => {
      try {
        const content = selectedAttachment.file
          ? await selectedAttachment.file.text()
          : selectedAttachment.url
            ? await fetch(selectedAttachment.url).then((response) => {
                if (!response.ok) {
                  throw new Error("Unable to load file preview.");
                }

                return response.text();
              })
            : null;

        if (!cancelled) {
          setTextContent(content);
        }
      } catch (error) {
        if (!cancelled) {
          setTextError(
            error instanceof Error ? error.message : "Unable to load file preview.",
          );
          setTextContent(null);
        }
      } finally {
        if (!cancelled) {
          setIsLoadingText(false);
        }
      }
    };

    void loadText();

    return () => {
      cancelled = true;
    };
  }, [selectedAttachment]);

  const previewUrl = objectUrl ?? selectedAttachment?.url ?? null;
  const hasMultiple = attachments.length > 1;

  return (
    <Dialog open={isOpen} onOpenChange={(open) => !open && onClose()}>
      {selectedAttachment ? (
        <DialogContent
          showCloseButton={false}
          className="flex max-h-[calc(100vh-2rem)] w-[min(calc(100vw-2rem),72rem)] flex-col gap-0 overflow-hidden rounded-[28px] border border-white/10 bg-black/80 p-0 text-white shadow-2xl shadow-black/50"
        >
          <div className="flex items-center justify-between border-b border-white/10 px-4 py-3">
            <div className="min-w-0">
              <DialogTitle className="truncate text-sm font-medium text-white">
                {selectedAttachment.fileName}
              </DialogTitle>
              <DialogDescription className="mt-0.5 truncate text-xs text-white/60">
                {selectedAttachment.contentType || "Unknown type"} •{" "}
                {Math.max(1, Math.round(selectedAttachment.size / 1024))} KB
              </DialogDescription>
            </div>
            <div className="flex items-center gap-2">
              {previewUrl ? (
                <a
                  href={previewUrl}
                  target="_blank"
                  rel="noreferrer"
                  className="inline-flex h-8 items-center gap-1 rounded-full border border-white/10 px-3 text-xs text-white/70 transition-colors hover:bg-white/10 hover:text-white"
                >
                  <ExternalLink className="size-3.5" />
                  Open
                </a>
              ) : null}
              <DialogClose
                render={
                  <Button
                    type="button"
                    size="icon-sm"
                    variant="ghost"
                    className="rounded-full text-white/70 hover:bg-white/10 hover:text-white"
                  />
                }
              >
                <X className="size-4" />
                <span className="sr-only">Close attachment preview</span>
              </DialogClose>
            </div>
          </div>

          <div className="min-h-0 flex-1 bg-[radial-gradient(circle_at_top,rgba(255,255,255,0.1),transparent_45%),linear-gradient(180deg,rgba(255,255,255,0.03),rgba(255,255,255,0))]">
            {isImageAttachment(selectedAttachment) && previewUrl ? (
              <div className="flex h-full min-h-[50vh] items-center justify-center overflow-auto p-6">
                <img
                  src={previewUrl}
                  alt={selectedAttachment.fileName}
                  className="max-h-[70vh] w-auto max-w-full rounded-2xl object-contain shadow-[0_30px_80px_rgba(0,0,0,0.45)]"
                />
              </div>
            ) : isPdfAttachment(selectedAttachment) && previewUrl ? (
              <iframe
                src={previewUrl}
                title={selectedAttachment.fileName}
                className="h-[70vh] w-full bg-white"
              />
            ) : canRenderTextAttachment(selectedAttachment) ? (
              <div className="h-full p-6">
                <div
                  className="h-[70vh] overflow-hidden rounded-2xl border border-white/10 bg-black/60"
                  style={{ contain: "strict" }}
                >
                  {isLoadingText ? (
                    <div className="p-6 text-sm text-white/70">Loading preview...</div>
                  ) : textError ? (
                    <div className="p-6 text-sm text-red-300">{textError}</div>
                  ) : (
                    <textarea
                      value={textContent ?? ""}
                      readOnly
                      spellCheck={false}
                      wrap="off"
                      className="block h-full w-full resize-none overflow-auto border-0 bg-transparent p-6 font-mono text-[13px] leading-6 text-white/90 outline-none [tab-size:2]"
                    />
                  )}
                </div>
              </div>
            ) : (
              <div className="flex h-full min-h-[50vh] flex-col items-center justify-center gap-4 p-6 text-center text-white/70">
                <div className="flex size-14 items-center justify-center rounded-2xl border border-white/10 bg-white/5">
                  <FileText className="size-6" />
                </div>
                <div>
                  <p className="text-sm font-medium text-white">
                    Preview unavailable
                  </p>
                  <p className="mt-1 text-xs text-white/60">
                    This file type can be opened in a new tab.
                  </p>
                </div>
              </div>
            )}
          </div>

          {hasMultiple ? (
            <div className="flex gap-2 overflow-x-auto border-t border-white/10 px-4 py-3">
              {attachments.map((attachment) => (
                <button
                  key={attachment.id}
                  type="button"
                  onClick={() => onSelectAttachment(attachment.id)}
                  className={cn(
                    "flex min-w-[10rem] items-center gap-3 rounded-2xl border px-3 py-2 text-left transition-all",
                    attachment.id === selectedAttachment.id
                      ? "border-white/70 bg-white/10 text-white"
                      : "border-white/10 text-white/70 hover:bg-white/5 hover:text-white",
                  )}
                >
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-xs font-medium">
                      {attachment.fileName}
                    </p>
                    <p className="mt-0.5 text-[11px] text-white/55">
                      {attachment.contentType || "Unknown type"}
                    </p>
                  </div>
                </button>
              ))}
            </div>
          ) : null}
        </DialogContent>
      ) : null}
    </Dialog>
  );
}
