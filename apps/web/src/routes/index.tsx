import { api } from "@based-chat/backend/convex/_generated/api";
import { SidebarInset, SidebarProvider } from "@based-chat/ui/components/sidebar";
import { Navigate, createFileRoute } from "@tanstack/react-router";
import {
  useConvexAuth,
  useMutation,
  usePaginatedQuery,
  useQuery,
} from "convex/react";
import {
  startTransition,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";

import AppSidebar from "@/components/chat/app-sidebar";
import ChatArea from "@/components/chat/chat-area";
import Loader from "@/components/loader";
import type { ChatMessage } from "@/lib/chat";
import { DEFAULT_MODEL, type Model } from "@/lib/models";
import type { ThreadSummary } from "@/lib/threads";

export const Route = createFileRoute("/")({
  component: HomeComponent,
});

const THREAD_PAGE_SIZE = 20;
const STREAM_INTERVAL_MS = 35;

function HomeComponent() {
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
  const [activeThreadId, setActiveThreadId] = useState<ThreadSummary["_id"] | null>(
    null,
  );
  const [selectedModel, setSelectedModel] = useState<Model>(DEFAULT_MODEL);
  const [threadMessages, setThreadMessages] = useState<
    Record<string, ChatMessage[]>
  >({});
  const streamingTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const activeStreamRef = useRef<{
    assistantMessageId: string;
    threadId: ThreadSummary["_id"];
  } | null>(null);

  const activeThread = useMemo(
    () =>
      threads?.find((thread) => thread._id === activeThreadId) ?? null,
    [activeThreadId, threads],
  );
  const currentModel = selectedModel;
  const activeMessages = activeThread
    ? threadMessages[activeThread._id] ?? []
    : [];

  const finalizeStreamingMessage = useCallback(
    (threadId: ThreadSummary["_id"], assistantMessageId: string) => {
      startTransition(() => {
        setThreadMessages((currentMessages) => ({
          ...currentMessages,
          [threadId]: (currentMessages[threadId] ?? []).map((message) =>
            message.id === assistantMessageId
              ? { ...message, isStreaming: false }
              : message,
          ),
        }));
      });
    },
    [],
  );

  const stopStreaming = useCallback(() => {
    if (streamingTimerRef.current) {
      clearInterval(streamingTimerRef.current);
      streamingTimerRef.current = null;
    }

    if (activeStreamRef.current) {
      const { assistantMessageId, threadId } = activeStreamRef.current;
      activeStreamRef.current = null;
      finalizeStreamingMessage(threadId, assistantMessageId);
    }
  }, [finalizeStreamingMessage]);

  useEffect(() => {
    return () => {
      if (streamingTimerRef.current) {
        clearInterval(streamingTimerRef.current);
      }
    };
  }, []);

  useEffect(() => {
    if (threads.length === 0) {
      setActiveThreadId(null);
      return;
    }

    if (!activeThreadId || !threads.some((thread) => thread._id === activeThreadId)) {
      setActiveThreadId(threads[0]!._id);
    }
  }, [activeThreadId, threads]);

  const handleNewChat = useCallback(async () => {
    stopStreaming();

    const createdThread = (await createThread({})) as ThreadSummary;

    setActiveThreadId(createdThread._id);
  }, [createThread, stopStreaming]);

  const handleModelChange = useCallback((model: Model) => {
    setSelectedModel(model);
  }, []);

  const handleLoadMoreThreads = useCallback(() => {
    if (threadPaginationStatus === "CanLoadMore") {
      loadMore(THREAD_PAGE_SIZE);
    }
  }, [loadMore, threadPaginationStatus]);

  const handleSimulateMessage = useCallback(() => {
    if (!activeThread) {
      return;
    }

    stopStreaming();

    const seed = Date.now();
    const userMessage: ChatMessage = {
      id: `msg-sim-user-${seed}`,
      role: "user",
      content:
        "Can you mock a rollout note for this API with rate limiting, observability, and a phased deployment checklist?",
      createdAt: new Date(),
    };
    const assistantMessageId = `msg-sim-assistant-${seed}`;
    const assistantMessage: ChatMessage = {
      id: assistantMessageId,
      role: "assistant",
      content: "",
      model: currentModel,
      createdAt: new Date(),
      isStreaming: true,
    };
    const fullAssistantResponse = `Absolutely. Here is a realistic rollout response we can stream into the UI.

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

    startTransition(() => {
      setThreadMessages((currentMessages) => ({
        ...currentMessages,
        [activeThread._id]: [
          ...(currentMessages[activeThread._id] ?? []),
          userMessage,
          assistantMessage,
        ],
      }));
    });

    activeStreamRef.current = {
      assistantMessageId,
      threadId: activeThread._id,
    };

    let visibleLength = 0;
    const chunkSize = Math.max(8, Math.floor(fullAssistantResponse.length / 55));

    streamingTimerRef.current = setInterval(() => {
      visibleLength = Math.min(
        visibleLength + chunkSize,
        fullAssistantResponse.length,
      );

      const nextContent = fullAssistantResponse.slice(0, visibleLength);

      startTransition(() => {
        setThreadMessages((currentMessages) => ({
          ...currentMessages,
          [activeThread._id]: (currentMessages[activeThread._id] ?? []).map(
            (message) =>
              message.id === assistantMessageId
                ? {
                    ...message,
                    content: nextContent,
                    isStreaming: visibleLength < fullAssistantResponse.length,
                  }
                : message,
          ),
        }));
      });

      if (visibleLength >= fullAssistantResponse.length) {
        if (streamingTimerRef.current) {
          clearInterval(streamingTimerRef.current);
          streamingTimerRef.current = null;
        }
        activeStreamRef.current = null;
      }
    }, STREAM_INTERVAL_MS);
  }, [activeThread, currentModel, stopStreaming]);

  if (
    isLoading ||
    (isAuthenticated &&
      (user === undefined || threadPaginationStatus === "LoadingFirstPage"))
  ) {
    return (
      <div className="flex min-h-svh items-center justify-center">
        <Loader />
      </div>
    );
  }

  if (!isAuthenticated || !user) {
    return <Navigate to="/sign-in" />;
  }

  return (
    <SidebarProvider>
      <AppSidebar
        threads={threads}
        activeThreadId={activeThreadId}
        onSelectThread={setActiveThreadId}
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
          onSimulateMessage={handleSimulateMessage}
          isStreaming={activeStreamRef.current?.threadId === activeThread?._id}
        />
      </SidebarInset>
    </SidebarProvider>
  );
}
