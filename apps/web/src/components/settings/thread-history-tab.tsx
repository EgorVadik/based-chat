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

const THREAD_PAGE_SIZE = 10;

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
  const [currentPage, setCurrentPage] = useState(0);
  const [pendingPage, setPendingPage] = useState<number | null>(null);

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

  const sortedThreads = useMemo(() => {
    return [...threads].sort((a, b) =>
      sortAsc ? a.updatedAt - b.updatedAt : b.updatedAt - a.updatedAt,
    );
  }, [threads, sortAsc]);

  const totalPages =
    sortedThreads.length > 0
      ? Math.ceil(sortedThreads.length / THREAD_PAGE_SIZE)
      : 1;
  const pageStart = currentPage * THREAD_PAGE_SIZE;
  const visibleThreads = sortedThreads.slice(
    pageStart,
    pageStart + THREAD_PAGE_SIZE,
  );
  const allSelected =
    visibleThreads.length > 0 &&
    visibleThreads.every((thread) => selectedIds.has(thread._id));

  const isLoadingFirstPage = status === "LoadingFirstPage";
  const isLoadingMore = status === "LoadingMore";
  const canLoadMore = status === "CanLoadMore";
  const hasLoadedNextPage = currentPage < totalPages - 1;
  const canGoPrev = currentPage > 0;
  const canGoNext = hasLoadedNextPage || canLoadMore;

  useEffect(() => {
    setCurrentPage((currentValue) => Math.min(currentValue, totalPages - 1));
  }, [totalPages]);

  useEffect(() => {
    if (pendingPage === null) {
      return;
    }

    if (totalPages > pendingPage) {
      setCurrentPage(pendingPage);
      setPendingPage(null);
      return;
    }

    if (!isLoadingMore && !canLoadMore) {
      setPendingPage(null);
    }
  }, [canLoadMore, isLoadingMore, pendingPage, totalPages]);

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
      setSelectedIds((currentSelectedIds) => {
        const nextSelectedIds = new Set(currentSelectedIds);

        for (const thread of visibleThreads) {
          nextSelectedIds.delete(thread._id);
        }

        return nextSelectedIds;
      });
      return;
    }

    setSelectedIds((currentSelectedIds) => {
      const nextSelectedIds = new Set(currentSelectedIds);

      for (const thread of visibleThreads) {
        nextSelectedIds.add(thread._id);
      }

      return nextSelectedIds;
    });
  };

  const handlePrevPage = () => {
    setPendingPage(null);
    setCurrentPage((currentValue) => Math.max(0, currentValue - 1));
  };

  const handleNextPage = () => {
    if (hasLoadedNextPage) {
      setCurrentPage((currentValue) => currentValue + 1);
      return;
    }

    if (!canLoadMore || isLoadingMore) {
      return;
    }

    setPendingPage(currentPage + 1);
    loadMore(THREAD_PAGE_SIZE);
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
          Review your real conversation history, browse older threads, or delete
          conversations you no longer need. Deleting a thread is permanent.
        </p>
      </div>

      <div className="overflow-hidden rounded-lg border border-border/50">
        <div className="flex items-center gap-3 border-b border-border/40 bg-muted/20 px-3 py-2">
          <Checkbox
            checked={allSelected}
            onCheckedChange={toggleSelectAll}
            className="rounded-sm"
            disabled={visibleThreads.length === 0 || isDeleting}
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
            visibleThreads.map((thread) => {
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

        {!isLoadingFirstPage && sortedThreads.length > 0 && (
          <div className="flex justify-end border-t border-border/30 px-3 py-3">
            <div className="flex items-center gap-2">
              <Button
                variant="outline"
                size="xs"
                onClick={handlePrevPage}
                disabled={!canGoPrev || isDeleting || isLoadingMore}
              >
                Prev
              </Button>
              <Button
                variant="outline"
                size="xs"
                onClick={handleNextPage}
                disabled={!canGoNext || isDeleting || isLoadingMore}
              >
                {isLoadingMore ? "Loading..." : "Next"}
              </Button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
