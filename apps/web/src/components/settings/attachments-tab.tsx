import { api } from "@based-chat/backend/convex/_generated/api";
import type { Id } from "@based-chat/backend/convex/_generated/dataModel";
import { Button } from "@based-chat/ui/components/button";
import { Checkbox } from "@based-chat/ui/components/checkbox";
import { cn } from "@based-chat/ui/lib/utils";
import { useMutation, useQuery } from "convex/react";
import {
  ArrowUpDown,
  ExternalLink,
  File,
  FileCode,
  FileImage,
  FileText,
  Trash2,
} from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";

type StorageId = Id<"_storage">;

type SettingsAttachment = {
  id: StorageId;
  storageId: StorageId;
  messageId: Id<"messages">;
  threadId: Id<"threads">;
  threadTitle: string;
  kind: "image" | "file";
  fileName: string;
  contentType: string;
  size: number;
  createdAt: number;
  updatedAt: number;
  url: string | null;
};

function getFileIcon(contentType: string) {
  if (contentType.startsWith("image/")) return FileImage;
  if (contentType.includes("pdf")) return FileText;
  if (
    contentType.includes("typescript") ||
    contentType.includes("javascript") ||
    contentType.includes("json")
  )
    return FileCode;
  return File;
}

function getFileColor(contentType: string) {
  if (contentType.startsWith("image/")) return "text-blue-400/70";
  if (contentType.includes("pdf")) return "text-red-400/70";
  if (
    contentType.includes("typescript") ||
    contentType.includes("javascript") ||
    contentType.includes("json")
  )
    return "text-green-400/70";
  return "text-muted-foreground";
}

function formatDate(timestamp: number) {
  return new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  }).format(timestamp);
}

function formatSize(size: number) {
  if (size >= 1024 * 1024) {
    return `${(size / (1024 * 1024)).toFixed(1)} MB`;
  }

  return `${Math.max(1, Math.round(size / 1024))} KB`;
}

export default function AttachmentsTab() {
  const attachmentResults = useQuery(
    (api.messages as { listUserAttachments: any }).listUserAttachments,
    {},
  ) as SettingsAttachment[] | undefined;
  const attachments = attachmentResults ?? [];
  const deleteManyAttachments = useMutation(
    (api.messages as { deleteManyAttachments: any }).deleteManyAttachments,
  );

  const [selectedIds, setSelectedIds] = useState<Set<StorageId>>(new Set());
  const [sortAsc, setSortAsc] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);

  const attachmentIdSet = useMemo(
    () => new Set(attachments.map((attachment) => attachment.storageId)),
    [attachments],
  );

  useEffect(() => {
    setSelectedIds((currentSelectedIds) => {
      const nextSelectedIds = new Set(
        [...currentSelectedIds].filter((storageId) => attachmentIdSet.has(storageId)),
      );

      return nextSelectedIds.size === currentSelectedIds.size
        ? currentSelectedIds
        : nextSelectedIds;
    });
  }, [attachmentIdSet]);

  const allSelected =
    attachments.length > 0 && selectedIds.size === attachments.length;

  const sortedAttachments = useMemo(() => {
    return [...attachments].sort((a, b) =>
      sortAsc ? a.createdAt - b.createdAt : b.createdAt - a.createdAt,
    );
  }, [attachments, sortAsc]);

  const toggleSelect = (id: StorageId) => {
    setSelectedIds((currentSelectedIds) => {
      const nextSelectedIds = new Set(currentSelectedIds);

      if (nextSelectedIds.has(id)) {
        nextSelectedIds.delete(id);
      } else {
        nextSelectedIds.add(id);
      }

      return nextSelectedIds;
    });
  };

  const toggleSelectAll = () => {
    if (allSelected) {
      setSelectedIds(new Set());
      return;
    }

    setSelectedIds(new Set(attachments.map((attachment) => attachment.storageId)));
  };

  const handleDelete = async (storageIds: StorageId[]) => {
    if (storageIds.length === 0 || isDeleting) {
      return;
    }

    setIsDeleting(true);

    try {
      const { deletedCount } = await deleteManyAttachments({ storageIds });

      setSelectedIds((currentSelectedIds) => {
        const nextSelectedIds = new Set(currentSelectedIds);

        for (const storageId of storageIds) {
          nextSelectedIds.delete(storageId);
        }

        return nextSelectedIds;
      });

      toast.success(
        `Deleted ${deletedCount} attachment${deletedCount === 1 ? "" : "s"}.`,
      );
    } catch (error) {
      toast.error(
        error instanceof Error
          ? error.message
          : "Failed to delete attachments.",
      );
    } finally {
      setIsDeleting(false);
    }
  };

  const isLoading = attachmentResults === undefined;

  return (
    <>
      <div className="space-y-6">
        <div>
          <h2 className="text-xl font-semibold tracking-tight">Attachments</h2>
          <p className="mt-1 text-sm text-muted-foreground">
            Browse your real uploaded files and select one or many for
            deletion. Clicking a file row now selects it instead of opening a
            preview.
          </p>
        </div>

        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <span className="text-xs text-muted-foreground">
              {attachments.length} file{attachments.length !== 1 ? "s" : ""}
            </span>
          </div>
          {selectedIds.size > 0 ? (
            <Button
              variant="destructive"
              size="sm"
              onClick={() => handleDelete([...selectedIds])}
              className="gap-1.5"
              disabled={isDeleting}
            >
              <Trash2 className="size-3" />
              Delete ({selectedIds.size})
            </Button>
          ) : null}
        </div>

        <div className="overflow-hidden rounded-lg border border-border/50">
          <div className="flex items-center gap-3 border-b border-border/40 bg-muted/20 px-3 py-2">
            <Checkbox
              checked={allSelected}
              onCheckedChange={toggleSelectAll}
              className="rounded-sm after:hidden"
              disabled={attachments.length === 0 || isDeleting}
            />
            <span className="flex-1 text-[11px] font-medium uppercase tracking-wider text-muted-foreground">
              Name
            </span>
            <button
              onClick={() => setSortAsc((currentSortAsc) => !currentSortAsc)}
              className="flex shrink-0 cursor-pointer items-center gap-1 text-[11px] font-medium uppercase tracking-wider text-muted-foreground transition-colors hover:text-foreground"
              disabled={isDeleting}
              type="button"
            >
              Created
              <ArrowUpDown className="size-3" />
            </button>
            <div className="w-7 shrink-0" />
          </div>

          <div className="divide-y divide-border/30">
            {isLoading ? (
              <div className="py-12 text-center">
                <p className="text-xs text-muted-foreground/60">
                  Loading attachments...
                </p>
              </div>
            ) : null}

            {!isLoading &&
              sortedAttachments.map((attachment) => {
                const Icon = getFileIcon(attachment.contentType);
                const colorClass = getFileColor(attachment.contentType);
                const isSelected = selectedIds.has(attachment.storageId);

                return (
                  <div
                    key={attachment.storageId}
                    className={cn(
                      "group flex items-center gap-3 px-3 py-2.5 transition-colors",
                      isSelected && "bg-primary/5",
                    )}
                  >
                    <Checkbox
                      checked={isSelected}
                      onCheckedChange={() => toggleSelect(attachment.storageId)}
                      className="rounded-sm after:hidden"
                      disabled={isDeleting}
                    />

                    <button
                      type="button"
                      onClick={() => toggleSelect(attachment.storageId)}
                      className="flex min-w-0 flex-1 cursor-pointer items-center gap-3 text-left"
                      disabled={isDeleting}
                    >
                      {attachment.kind === "image" && attachment.url ? (
                        <div className="flex size-9 shrink-0 overflow-hidden rounded-md border border-border/30 bg-muted/30">
                          <img
                            src={attachment.url}
                            alt={attachment.fileName}
                            className="h-full w-full object-cover"
                          />
                        </div>
                      ) : (
                        <div
                          className={cn(
                            "flex size-9 shrink-0 items-center justify-center rounded-md border border-border/30 bg-muted/30",
                            colorClass,
                          )}
                        >
                          <Icon className="size-4" />
                        </div>
                      )}

                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-1.5">
                          <p className="truncate text-xs font-medium">
                            {attachment.fileName}
                          </p>
                          <ExternalLink className="size-2.5 shrink-0 text-muted-foreground/25" />
                        </div>
                        <p className="mt-0.5 truncate text-[10px] text-muted-foreground/60">
                          {attachment.threadTitle} • {attachment.contentType} •{" "}
                          {formatSize(attachment.size)}
                        </p>
                      </div>
                    </button>

                    <span className="shrink-0 text-xs text-muted-foreground/60">
                      {formatDate(attachment.createdAt)}
                    </span>

                    <button
                      onClick={() => handleDelete([attachment.storageId])}
                      className="shrink-0 cursor-pointer rounded p-1 text-muted-foreground/20 opacity-0 transition-colors group-hover:opacity-100 hover:text-destructive disabled:cursor-not-allowed disabled:opacity-40"
                      disabled={isDeleting}
                      type="button"
                    >
                      <Trash2 className="size-3.5" />
                    </button>
                  </div>
                );
              })}
          </div>

          {!isLoading && sortedAttachments.length === 0 ? (
            <div className="py-12 text-center">
              <p className="text-xs text-muted-foreground/50">
                No attachments.
              </p>
            </div>
          ) : null}
        </div>
      </div>
    </>
  );
}
