import { api } from "@based-chat/backend/convex/_generated/api";
import type { Id } from "@based-chat/backend/convex/_generated/dataModel";
import { Button } from "@based-chat/ui/components/button";
import { Checkbox } from "@based-chat/ui/components/checkbox";
import { cn } from "@based-chat/ui/lib/utils";
import { useMutation, usePaginatedQuery } from "convex/react";
import { ArrowUpDown, Trash2 } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";

type ThreadId = Id<"threads">;

const THREAD_PAGE_SIZE = 25;

function formatRelativeDate(timestamp: number) {
  const diff = Math.max(0, Date.now() - timestamp);
  const days = Math.floor(diff / (1000 * 60 * 60 * 24));

  if (days === 0) return "today";
  if (days === 1) return "yesterday";
  if (days < 7) return `${days} days ago`;
  if (days < 30) return `${Math.floor(days / 7)} weeks ago`;
  if (days < 60) return "about a month ago";
  return `about ${Math.floor(days / 30)} months ago`;
}

function formatAbsoluteDate(timestamp: number) {
  return new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  }).format(timestamp);
}

export default function ThreadHistoryTab() {
  const { results: threads, status, loadMore } = usePaginatedQuery(
    api.threads.listPaginated,
    {},
    { initialNumItems: THREAD_PAGE_SIZE },
  );
  const deleteManyThreads = useMutation(api.threads.deleteMany);
  const [selectedIds, setSelectedIds] = useState<Set<ThreadId>>(new Set());
  const [sortAsc, setSortAsc] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);

  const threadIdSet = useMemo(() => new Set(threads.map((thread) => thread._id)), [threads]);

  useEffect(() => {
    setSelectedIds((currentSelectedIds) => {
      const nextSelectedIds = new Set(
        [...currentSelectedIds].filter((threadId) => threadIdSet.has(threadId)),
      );

      return nextSelectedIds.size === currentSelectedIds.size
        ? currentSelectedIds
        : nextSelectedIds;
    });
  }, [threadIdSet]);

  const allSelected =
    threads.length > 0 && selectedIds.size === threads.length;

  const sortedThreads = useMemo(() => {
    return [...threads].sort((a, b) =>
      sortAsc ? a.updatedAt - b.updatedAt : b.updatedAt - a.updatedAt,
    );
  }, [threads, sortAsc]);

  const isLoadingFirstPage = status === "LoadingFirstPage";
  const isLoadingMore = status === "LoadingMore";
  const canLoadMore = status === "CanLoadMore";

  const toggleSelect = (id: ThreadId) => {
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

    setSelectedIds(new Set(threads.map((thread) => thread._id)));
  };

  const handleDelete = async (threadIds: ThreadId[]) => {
    if (threadIds.length === 0 || isDeleting) {
      return;
    }

    setIsDeleting(true);

    try {
      const { deletedCount } = await deleteManyThreads({ threadIds });

      setSelectedIds((currentSelectedIds) => {
        const nextSelectedIds = new Set(currentSelectedIds);

        for (const threadId of threadIds) {
          nextSelectedIds.delete(threadId);
        }

        return nextSelectedIds;
      });

      toast.success(
        `Deleted ${deletedCount} thread${deletedCount === 1 ? "" : "s"}.`,
      );
    } catch (error) {
      toast.error(
        error instanceof Error ? error.message : "Failed to delete threads.",
      );
    } finally {
      setIsDeleting(false);
    }
  };

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-xl font-semibold tracking-tight">Chat History</h2>
        <p className="mt-1 text-sm text-muted-foreground">
          Review your real conversation history, load older threads, or delete
          conversations you no longer need. Deleting a thread is permanent.
        </p>
      </div>

      <div className="overflow-hidden rounded-lg border border-border/50">
        <div className="flex items-center gap-3 border-b border-border/40 bg-muted/20 px-3 py-2">
          <Checkbox
            checked={allSelected}
            onCheckedChange={toggleSelectAll}
            className="rounded-sm"
            disabled={threads.length === 0 || isDeleting}
          />
          <span className="flex-1 text-[11px] font-medium uppercase tracking-wider text-muted-foreground">
            Title
          </span>

          {selectedIds.size > 0 && (
            <Button
              variant="destructive"
              size="xs"
              onClick={() => handleDelete([...selectedIds])}
              className="gap-1"
              disabled={isDeleting}
            >
              <Trash2 className="size-2.5" />
              Delete ({selectedIds.size})
            </Button>
          )}

          <button
            onClick={() => setSortAsc((currentSortAsc) => !currentSortAsc)}
            className="flex shrink-0 cursor-pointer items-center gap-1 text-[11px] font-medium uppercase tracking-wider text-muted-foreground transition-colors hover:text-foreground"
            disabled={isDeleting}
            type="button"
          >
            <ArrowUpDown className="size-3" />
          </button>
        </div>

        <div className="divide-y divide-border/30">
          {isLoadingFirstPage && (
            <div className="py-12 text-center">
              <p className="text-xs text-muted-foreground/60">
                Loading threads...
              </p>
            </div>
          )}

          {!isLoadingFirstPage &&
            sortedThreads.map((thread) => {
              const isSelected = selectedIds.has(thread._id);

              return (
                <div
                  key={thread._id}
                  onClick={() => toggleSelect(thread._id)}
                  className={cn(
                    "group flex cursor-pointer items-center gap-3 px-3 py-2.5 transition-colors",
                    isSelected && "bg-primary/5",
                  )}
                >
                  <Checkbox
                    checked={isSelected}
                    onCheckedChange={() => toggleSelect(thread._id)}
                    onClick={(event) => event.stopPropagation()}
                    className="rounded-sm after:hidden"
                    disabled={isDeleting}
                  />

                  <div className="min-w-0 flex-1">
                    <p className="truncate text-xs font-medium">{thread.title}</p>
                    <p className="mt-0.5 text-[11px] text-muted-foreground/60">
                      Updated {formatRelativeDate(thread.updatedAt)} on{" "}
                      {formatAbsoluteDate(thread.updatedAt)}
                    </p>
                  </div>

                  <span
                    className="shrink-0 text-xs text-muted-foreground/60"
                    title={formatAbsoluteDate(thread.updatedAt)}
                  >
                    {formatRelativeDate(thread.updatedAt)}
                  </span>

                  <button
                    onClick={(event) => {
                      event.stopPropagation();
                      handleDelete([thread._id]);
                    }}
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

        {!isLoadingFirstPage && sortedThreads.length === 0 && (
          <div className="py-12 text-center">
            <p className="text-xs text-muted-foreground/50">No threads.</p>
          </div>
        )}

        {(canLoadMore || isLoadingMore) && (
          <div className="border-t border-border/30 px-3 py-3">
            <Button
              variant="outline"
              size="xs"
              onClick={() => loadMore(THREAD_PAGE_SIZE)}
              disabled={isLoadingMore || isDeleting}
            >
              {isLoadingMore ? "Loading more..." : "Load more threads"}
            </Button>
          </div>
        )}
      </div>
    </div>
  );
}
