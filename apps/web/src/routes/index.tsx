import { api } from "@based-chat/backend/convex/_generated/api";
import type { Id } from "@based-chat/backend/convex/_generated/dataModel";
import { SidebarInset, SidebarProvider } from "@based-chat/ui/components/sidebar";
import { Navigate, createFileRoute } from "@tanstack/react-router";
import {
  useConvex,
  useConvexAuth,
  useMutation,
  usePaginatedQuery,
  useQuery,
} from "convex/react";
import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";

import AppSidebar from "@/components/chat/app-sidebar";
import ChatArea from "@/components/chat/chat-area";
import Loader from "@/components/loader";
import { toChatMessage, type ChatMessage } from "@/lib/chat";
import { DEFAULT_MODEL, getModelById, type Model } from "@/lib/models";
import type { ThreadSummary } from "@/lib/threads";

export const Route = createFileRoute("/")({
  component: HomeComponent,
});

const THREAD_PAGE_SIZE = 20;
const STREAM_INTERVAL_MS = 90;
const STREAM_TARGET_CHUNKS = 100;
const FULL_SYSTEM_RESPONSE = `Absolutely. Here is a realistic rollout response we can stream into the UI.

## Rollout plan

Ship this API in three phases. Start with internal traffic, move to a limited beta cohort, and only open it broadly after latency and error rates stay stable for a full monitoring window.

## Guardrails

- Apply per-user and per-IP rate limits.
- Add structured logs with request ids.
- Emit metrics for latency, retries, and 5xx responses.
- Separate validation failures from unexpected server errors.

## Deployment checklist

1. Verify smoke tests and health checks in staging.
2. Turn on dashboards and tracing before traffic shifts.
3. Release behind a flag for the first cohort.
4. Watch p95 latency, throughput, and error spikes.
5. Keep rollback steps and owner handoff notes ready.

## Notes

This streamed mock is local-only for now, but it behaves like an actual assistant response so we can test incremental rendering on real backend threads.`;

function deriveThreadTitle(content: string) {
  const normalized = content.trim().replace(/\s+/g, " ");

  if (normalized.length <= 60) {
    return normalized;
  }

  return `${normalized.slice(0, 57).trimEnd()}...`;
}

function HomeComponent() {
  const convex = useConvex();
  const { isAuthenticated, isLoading } = useConvexAuth();
  const user = useQuery(api.auth.getCurrentUser, isAuthenticated ? {} : "skip");
  const {
    results: threads,
    status: threadPaginationStatus,
    loadMore,
  } = usePaginatedQuery(
    api.threads.listPaginated,
    isAuthenticated ? {} : "skip",
    { initialNumItems: THREAD_PAGE_SIZE },
  );
  const createThread = useMutation(api.threads.create);
  const createMessage = useMutation(api.messages.create);
  const editMessage = useMutation(api.messages.edit);
  const createSystemReply = useMutation(api.messages.createSystemReply);
  const [activeThreadId, setActiveThreadId] = useState<ThreadSummary["_id"] | null>(
    null,
  );
  const [streamingThreadIds, setStreamingThreadIds] = useState<
    ThreadSummary["_id"][]
  >([]);
  const [messageCache, setMessageCache] = useState<
    Record<string, ChatMessage[] | undefined>
  >({});
  const [streamingDrafts, setStreamingDrafts] = useState<
    Record<string, ChatMessage | undefined>
  >({});
  const [selectedModel, setSelectedModel] = useState<Model>(DEFAULT_MODEL);
  const persistedMessages = useQuery(
    api.messages.listByThread,
    isAuthenticated && activeThreadId ? { threadId: activeThreadId } : "skip",
  );
  const streamingTimersRef = useRef(
    new Map<ThreadSummary["_id"], ReturnType<typeof setInterval>>(),
  );
  const prefetchedThreadIdsRef = useRef(new Set<ThreadSummary["_id"]>());
  const prefetchPromisesRef = useRef(
    new Map<ThreadSummary["_id"], Promise<void>>(),
  );

  const activeThread = useMemo(
    () =>
      threads?.find((thread) => thread._id === activeThreadId) ?? null,
    [activeThreadId, threads],
  );
  const currentModel = selectedModel;

  useEffect(() => {
    if (!activeThreadId || persistedMessages === undefined) {
      return;
    }

    setMessageCache((currentCache) => ({
      ...currentCache,
      [activeThreadId]: persistedMessages.map(toChatMessage),
    }));
  }, [activeThreadId, persistedMessages]);

  const activeMessages = useMemo(() => {
    const messages =
      (activeThreadId ? messageCache[activeThreadId] : undefined) ??
      (persistedMessages ? persistedMessages.map(toChatMessage) : []) ??
      [];
    const draft = activeThreadId ? streamingDrafts[activeThreadId] : undefined;

    return draft ? [...messages, draft] : messages;
  }, [activeThreadId, messageCache, persistedMessages, streamingDrafts]);

  const clearStreamingDraft = useCallback((
    threadId: ThreadSummary["_id"],
    messageId?: string,
  ) => {
    setStreamingDrafts((currentDrafts) => {
      const currentDraft = currentDrafts[threadId];

      if (!currentDraft) {
        return currentDrafts;
      }

      if (messageId && currentDraft.id !== messageId) {
        return currentDrafts;
      }

      const nextDrafts = { ...currentDrafts };
      delete nextDrafts[threadId];
      return nextDrafts;
    });
  }, []);

  const upsertStreamingDraft = useCallback(
    (threadId: ThreadSummary["_id"], message: ChatMessage) => {
      setStreamingDrafts((currentDrafts) => ({
        ...currentDrafts,
        [threadId]: message,
      }));
    },
    [],
  );

  const appendCachedMessage = useCallback((
    threadId: ThreadSummary["_id"],
    message: ChatMessage,
  ) => {
    setMessageCache((currentCache) => {
      const currentMessages = currentCache[threadId] ?? [];

      if (currentMessages.some((currentMessage) => currentMessage.id === message.id)) {
        return currentCache;
      }

      return {
        ...currentCache,
        [threadId]: [...currentMessages, message],
      };
    });
  }, []);

  const addStreamingThread = useCallback((threadId: ThreadSummary["_id"]) => {
    setStreamingThreadIds((currentThreadIds) =>
      currentThreadIds.includes(threadId)
        ? currentThreadIds
        : [...currentThreadIds, threadId],
    );
  }, []);

  const removeStreamingThread = useCallback((threadId: ThreadSummary["_id"]) => {
    setStreamingThreadIds((currentThreadIds) =>
      currentThreadIds.filter((currentThreadId) => currentThreadId !== threadId),
    );
  }, []);

  const stopStreamingForThread = useCallback(
    (threadId: ThreadSummary["_id"]) => {
      const timer = streamingTimersRef.current.get(threadId);

      if (timer) {
        clearInterval(timer);
        streamingTimersRef.current.delete(threadId);
      }

      removeStreamingThread(threadId);
      clearStreamingDraft(threadId);
    },
    [clearStreamingDraft, removeStreamingThread],
  );

  const startAssistantStream = useCallback(
    ({
      threadId,
      userMessageId,
      userMessageUpdatedAt,
      model,
    }: {
      threadId: ThreadSummary["_id"];
      userMessageId: Id<"messages">;
      userMessageUpdatedAt: number;
      model: Model;
    }) => {
      if (streamingTimersRef.current.has(threadId)) {
        return;
      }

      const seed = Date.now();
      const draftMessageId = `msg-stream-${seed}`;

      addStreamingThread(threadId);
      upsertStreamingDraft(threadId, {
        id: draftMessageId,
        threadId,
        role: "system",
        content: "",
        modelId: model.id,
        model,
        createdAt: seed,
        isStreaming: true,
      });

      let visibleLength = 0;
      const chunkSize = Math.max(
        6,
        Math.floor(FULL_SYSTEM_RESPONSE.length / STREAM_TARGET_CHUNKS),
      );

      const timer = setInterval(() => {
        visibleLength = Math.min(
          visibleLength + chunkSize,
          FULL_SYSTEM_RESPONSE.length,
        );

        const nextContent = FULL_SYSTEM_RESPONSE.slice(0, visibleLength);

        upsertStreamingDraft(threadId, {
          id: draftMessageId,
          threadId,
          role: "system",
          content: nextContent,
          modelId: model.id,
          model,
          createdAt: seed,
          isStreaming: visibleLength < FULL_SYSTEM_RESPONSE.length,
        });

        if (visibleLength >= FULL_SYSTEM_RESPONSE.length) {
          clearInterval(timer);
          streamingTimersRef.current.delete(threadId);
          removeStreamingThread(threadId);

          void createSystemReply({
            threadId,
            userMessageId,
            userMessageUpdatedAt,
            content: FULL_SYSTEM_RESPONSE,
            modelId: model.id,
          })
            .then((createdSystemMessage) => {
              if (!createdSystemMessage) {
                return;
              }

              appendCachedMessage(threadId, {
                id: createdSystemMessage._id,
                threadId,
                role: "system",
                content: FULL_SYSTEM_RESPONSE,
                modelId: model.id,
                model,
                createdAt: createdSystemMessage.createdAt,
                updatedAt: createdSystemMessage.updatedAt,
              });
            })
            .finally(() => {
              clearStreamingDraft(threadId, draftMessageId);
            });
        }
      }, STREAM_INTERVAL_MS);

      streamingTimersRef.current.set(threadId, timer);
    },
    [
      addStreamingThread,
      appendCachedMessage,
      clearStreamingDraft,
      createSystemReply,
      removeStreamingThread,
      upsertStreamingDraft,
    ],
  );

  useEffect(() => {
    return () => {
      for (const timer of streamingTimersRef.current.values()) {
        clearInterval(timer);
      }

      streamingTimersRef.current.clear();
    };
  }, []);

  useEffect(() => {
    if (threads.length === 0) {
      return;
    }

    if (!activeThreadId) {
      setActiveThreadId(threads[0]!._id);
    }
  }, [activeThreadId, threads]);

  const handleNewChat = useCallback(async () => {
    const createdThread = (await createThread({})) as ThreadSummary;

    setActiveThreadId(createdThread._id);
  }, [createThread]);

  const handleModelChange = useCallback((model: Model) => {
    setSelectedModel(model);
  }, []);

  const handleLoadMoreThreads = useCallback(() => {
    if (threadPaginationStatus === "CanLoadMore") {
      loadMore(THREAD_PAGE_SIZE);
    }
  }, [loadMore, threadPaginationStatus]);

  const handlePrefetchThread = useCallback(
    (threadId: ThreadSummary["_id"]) => {
      if (messageCache[threadId] || prefetchedThreadIdsRef.current.has(threadId)) {
        return;
      }

      const inFlight = prefetchPromisesRef.current.get(threadId);
      if (inFlight) {
        return;
      }

      const prefetchPromise = convex
        .query(api.messages.listByThread, { threadId })
        .then((messages) => {
          prefetchedThreadIdsRef.current.add(threadId);
          setMessageCache((currentCache) => ({
            ...currentCache,
            [threadId]: messages.map(toChatMessage),
          }));
        })
        .finally(() => {
          prefetchPromisesRef.current.delete(threadId);
        });

      prefetchPromisesRef.current.set(threadId, prefetchPromise);
    },
    [convex, messageCache],
  );

  const handleSendMessage = useCallback(async (
    content: string,
    options?: {
      modelOverride?: Model;
    },
  ) => {
    const trimmedContent = content.trim();
    if (!trimmedContent) {
      return;
    }

    const modelForMessage = options?.modelOverride ?? currentModel;
    let threadId = activeThreadId;

    if (!threadId) {
      const createdThread = (await createThread({
        title: deriveThreadTitle(trimmedContent),
      })) as ThreadSummary;
      threadId = createdThread._id;
      setActiveThreadId(createdThread._id);
    }

    if (!threadId) {
      return;
    }

    if (streamingTimersRef.current.has(threadId)) {
      return;
    }

    const createdUserMessage = await createMessage({
      threadId,
      role: "user",
      content: trimmedContent,
      modelId: modelForMessage.id,
    });

    appendCachedMessage(threadId, {
      id: createdUserMessage._id,
      threadId,
      role: "user",
      content: trimmedContent,
      modelId: modelForMessage.id,
      model: modelForMessage,
      createdAt: createdUserMessage.createdAt,
      updatedAt: createdUserMessage.updatedAt,
    });

    startAssistantStream({
      threadId,
      userMessageId: createdUserMessage._id,
      userMessageUpdatedAt:
        createdUserMessage.updatedAt ?? createdUserMessage.createdAt,
      model: modelForMessage,
    });
  }, [
    activeThreadId,
    appendCachedMessage,
    createMessage,
    createThread,
    currentModel,
    startAssistantStream,
  ]);

  const restartFromUserMessage = useCallback(
    async ({
      message,
      content,
      nextModel,
    }: {
      message: ChatMessage;
      content: string;
      nextModel: Model;
    }) => {
      const trimmedContent = content.trim();
      const threadId = message.threadId;

      if (!trimmedContent || !threadId) {
        return;
      }

      stopStreamingForThread(threadId);

      const editResult = await editMessage({
        threadId,
        messageId: message.id as Id<"messages">,
        content: trimmedContent,
        modelId: nextModel.id,
      });

      const updatedMessage: ChatMessage = {
        id: editResult.updatedMessage._id,
        threadId,
        role: "user",
        content: editResult.updatedMessage.content,
        modelId: nextModel.id,
        model: nextModel,
        createdAt: editResult.updatedMessage.createdAt,
        updatedAt: editResult.updatedMessage.updatedAt,
      };

      setMessageCache((currentCache) => {
        const fallbackMessages =
          threadId === activeThreadId && persistedMessages
            ? persistedMessages.map(toChatMessage)
            : [];
        const sourceMessages = currentCache[threadId] ?? fallbackMessages;
        const deletedMessageIds = new Set<string>(editResult.deletedMessageIds);
        const prunedMessages = sourceMessages.filter(
          (currentMessage) => !deletedMessageIds.has(currentMessage.id),
        );
        const hasUpdatedMessage = prunedMessages.some(
          (currentMessage) => currentMessage.id === updatedMessage.id,
        );
        const nextMessages = (hasUpdatedMessage
          ? prunedMessages
          : [...prunedMessages, updatedMessage]
        )
          .map((currentMessage) =>
            currentMessage.id === updatedMessage.id
              ? updatedMessage
              : currentMessage,
          )
          .sort((left, right) => left.createdAt - right.createdAt);

        return {
          ...currentCache,
          [threadId]: nextMessages,
        };
      });

      setSelectedModel(nextModel);
      startAssistantStream({
        threadId,
        userMessageId: editResult.updatedMessage._id,
        userMessageUpdatedAt: editResult.updatedMessage.updatedAt,
        model: nextModel,
      });
    },
    [
      activeThreadId,
      editMessage,
      persistedMessages,
      startAssistantStream,
      stopStreamingForThread,
    ],
  );

  const handleEditMessage = useCallback(
    async (message: ChatMessage, content: string, nextModel: Model) => {
      await restartFromUserMessage({
        message,
        content,
        nextModel,
      });
    },
    [restartFromUserMessage],
  );

  const handleRetryMessage = useCallback(
    async (message: ChatMessage) => {
      const retryModel =
        message.model ??
        (message.modelId ? getModelById(message.modelId) : undefined) ??
        currentModel;

      const threadId = message.threadId;
      const threadMessages = threadId
        ? messageCache[threadId] ??
          (threadId === activeThreadId && persistedMessages
            ? persistedMessages.map(toChatMessage)
            : [])
        : [];
      const messageIndex = threadMessages.findIndex(
        (threadMessage) => threadMessage.id === message.id,
      );
      const sourceMessage =
        message.role === "user"
          ? message
          : messageIndex >= 0
            ? [...threadMessages.slice(0, messageIndex)]
                .reverse()
                .find((threadMessage) => threadMessage.role === "user")
            : undefined;

      if (!sourceMessage) {
        return;
      }

      await restartFromUserMessage({
        message: sourceMessage,
        content: sourceMessage.content,
        nextModel: retryModel,
      });
    },
    [activeThreadId, currentModel, messageCache, persistedMessages, restartFromUserMessage],
  );

  if (
    isLoading ||
    (isAuthenticated &&
      (user === undefined || threadPaginationStatus === "LoadingFirstPage"))
  ) {
    return <Loader variant="shell" />;
  }

  if (!isAuthenticated || !user) {
    return <Navigate to="/sign-in" />;
  }

  return (
    <SidebarProvider>
      <AppSidebar
        threads={threads}
        activeThreadId={activeThreadId}
        streamingThreadIds={streamingThreadIds}
        onSelectThread={setActiveThreadId}
        onPrefetchThread={handlePrefetchThread}
        onNewChat={handleNewChat}
        onLoadMoreThreads={handleLoadMoreThreads}
        threadPaginationStatus={threadPaginationStatus}
        user={user}
      />
      <SidebarInset>
        <ChatArea
          thread={activeThread}
          messages={activeMessages}
          model={currentModel}
          onModelChange={handleModelChange}
          onSendMessage={handleSendMessage}
          onEditMessage={handleEditMessage}
          onRetryMessage={handleRetryMessage}
          isStreaming={Boolean(
            activeThreadId && streamingThreadIds.includes(activeThreadId),
          )}
        />
      </SidebarInset>
    </SidebarProvider>
  );
}
