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
import type {
  AttachmentUploadHandlers,
  ComposerAttachment,
  DraftAttachment,
  MessageAttachment,
} from "@/lib/attachments";
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

function deriveThreadTitle(
  content: string,
  attachments: Pick<{ fileName: string }, "fileName">[] = [],
) {
  const normalized = content.trim().replace(/\s+/g, " ");

  if (normalized.length > 0 && normalized.length <= 60) {
    return normalized;
  }

  if (normalized.length > 0) {
    return `${normalized.slice(0, 57).trimEnd()}...`;
  }

  if (attachments.length === 1) {
    return attachments[0]!.fileName || "Shared image";
  }

  if (attachments.length > 1) {
    return `${attachments.length} shared images`;
  }

  return "New chat";
}

type PersistedMessagePayload = {
  _id: Id<"messages">;
  threadId: Id<"threads">;
  role: ChatMessage["role"];
  content: string;
  attachments?: MessageAttachment[];
  modelId: string;
  createdAt: number;
  updatedAt?: number;
};

type EditedMessagePayload = {
  updatedMessage: PersistedMessagePayload;
  deletedMessageIds: string[];
};

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
  const createMessage = useMutation(
    (api.messages as { create: any }).create,
  );
  const editMessage = useMutation(
    (api.messages as { edit: any }).edit,
  );
  const createSystemReply = useMutation(api.messages.createSystemReply);
  const generateAttachmentUploadUrl = useMutation(
    (api.messages as { generateAttachmentUploadUrl: any })
      .generateAttachmentUploadUrl,
  );
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
        attachments: [],
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
          attachments: [],
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

              const typedSystemMessage =
                createdSystemMessage as PersistedMessagePayload;

              appendCachedMessage(threadId, {
                id: typedSystemMessage._id,
                threadId,
                role: "system",
                content: FULL_SYSTEM_RESPONSE,
                attachments: typedSystemMessage.attachments ?? [],
                modelId: model.id,
                model,
                createdAt: typedSystemMessage.createdAt,
                updatedAt: typedSystemMessage.updatedAt,
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
          const typedMessages = messages as PersistedMessagePayload[];
          prefetchedThreadIdsRef.current.add(threadId);
          setMessageCache((currentCache) => ({
            ...currentCache,
            [threadId]: typedMessages.map(toChatMessage),
          }));
        })
        .finally(() => {
          prefetchPromisesRef.current.delete(threadId);
        });

      prefetchPromisesRef.current.set(threadId, prefetchPromise);
    },
    [convex, messageCache],
  );

  const uploadAttachments = useCallback(
    async (
      attachments: DraftAttachment[],
      uploadHandlers?: AttachmentUploadHandlers,
    ): Promise<MessageAttachment[]> => {
      if (attachments.length === 0) {
        return [];
      }

      return await Promise.all(
        attachments.map(async (attachment) => {
          const uploadUrl = (await generateAttachmentUploadUrl({})) as string;
          const { storageId } = await new Promise<{ storageId: Id<"_storage"> }>(
            (resolve, reject) => {
              const xhr = new XMLHttpRequest();

              xhr.open("POST", uploadUrl);
              xhr.setRequestHeader("Content-Type", attachment.contentType);

              xhr.upload.addEventListener("progress", (event) => {
                if (!event.lengthComputable) {
                  return;
                }

                uploadHandlers?.onUploadProgress?.(
                  attachment.id,
                  Math.min(100, Math.round((event.loaded / event.total) * 100)),
                );
              });

              xhr.addEventListener("load", () => {
                if (xhr.status < 200 || xhr.status >= 300) {
                  reject(new Error("Failed to upload image attachment."));
                  return;
                }

                uploadHandlers?.onUploadProgress?.(attachment.id, 100);

                try {
                  resolve(JSON.parse(xhr.responseText) as { storageId: Id<"_storage"> });
                } catch {
                  reject(new Error("Failed to read uploaded attachment response."));
                }
              });

              xhr.addEventListener("error", () => {
                reject(new Error("Failed to upload image attachment."));
              });

              xhr.send(attachment.file);
            },
          );

          return {
            kind: attachment.kind,
            storageId,
            fileName: attachment.fileName,
            contentType: attachment.contentType,
            size: attachment.size,
            url: null,
          };
        }),
      );
    },
    [generateAttachmentUploadUrl],
  );

  const handleSendMessage = useCallback(async (
    content: string,
    attachments: DraftAttachment[],
    uploadHandlers?: AttachmentUploadHandlers,
    options?: {
      modelOverride?: Model;
    },
  ) => {
    const trimmedContent = content.trim();
    const draftAttachments = attachments;

    if (!trimmedContent && draftAttachments.length === 0) {
      return;
    }

    const modelForMessage = options?.modelOverride ?? currentModel;
    let threadId = activeThreadId;

    if (!threadId) {
      const createdThread = (await createThread({
        title: deriveThreadTitle(trimmedContent, draftAttachments),
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

    const uploadedAttachments = await uploadAttachments(
      draftAttachments,
      uploadHandlers,
    );
    const createdUserMessage = (await createMessage({
      threadId,
      role: "user",
      content: trimmedContent,
      attachments: uploadedAttachments.map((attachment) => ({
        kind: attachment.kind,
        storageId: attachment.storageId,
        fileName: attachment.fileName,
        contentType: attachment.contentType,
        size: attachment.size,
      })),
      modelId: modelForMessage.id,
    })) as PersistedMessagePayload;

    appendCachedMessage(threadId, {
      id: createdUserMessage._id,
      threadId,
      role: "user",
      content: trimmedContent,
      attachments: createdUserMessage.attachments ?? uploadedAttachments,
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
    uploadAttachments,
  ]);

  const restartFromUserMessage = useCallback(
    async ({
      message,
      content,
      nextModel,
      attachments,
    }: {
      message: ChatMessage;
      content: string;
      nextModel: Model;
      attachments: MessageAttachment[];
    }) => {
      const trimmedContent = content.trim();
      const threadId = message.threadId;

      if ((!trimmedContent && attachments.length === 0) || !threadId) {
        return;
      }

      stopStreamingForThread(threadId);

      const editResult = (await editMessage({
        threadId,
        messageId: message.id as Id<"messages">,
        content: trimmedContent,
        modelId: nextModel.id,
        attachments: attachments.map((attachment) => ({
          kind: attachment.kind,
          storageId: attachment.storageId,
          fileName: attachment.fileName,
          contentType: attachment.contentType,
          size: attachment.size,
        })),
      })) as EditedMessagePayload;

      const updatedMessage: ChatMessage = {
        id: editResult.updatedMessage._id,
        threadId,
        role: "user",
        content: editResult.updatedMessage.content,
        attachments: editResult.updatedMessage.attachments ?? attachments,
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
        userMessageUpdatedAt:
          editResult.updatedMessage.updatedAt ??
          editResult.updatedMessage.createdAt,
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
    async (
      message: ChatMessage,
      content: string,
      nextModel: Model,
      attachments: ComposerAttachment[],
    ) => {
      const uploadedAttachments = await uploadAttachments(
        attachments.filter(
          (attachment): attachment is DraftAttachment =>
            attachment.source === "draft",
        ),
      );
      const persistedAttachments = attachments
        .filter((attachment) => attachment.source === "stored")
        .map((attachment) => ({
          kind: attachment.kind,
          storageId: attachment.storageId,
          fileName: attachment.fileName,
          contentType: attachment.contentType,
          size: attachment.size,
          url: attachment.url,
        }));

      await restartFromUserMessage({
        message,
        content,
        nextModel,
        attachments: [...persistedAttachments, ...uploadedAttachments],
      });
    },
    [restartFromUserMessage, uploadAttachments],
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
        attachments: sourceMessage.attachments,
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
          onSendMessage={(message, attachments, uploadHandlers) =>
            handleSendMessage(message, attachments, uploadHandlers)
          }
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
