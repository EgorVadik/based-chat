import { api } from "@based-chat/backend/convex/_generated/api";
import type { Id } from "@based-chat/backend/convex/_generated/dataModel";
import { env } from "@based-chat/env/web";
import { SidebarInset, SidebarProvider } from "@based-chat/ui/components/sidebar";
import { Navigate, createFileRoute } from "@tanstack/react-router";
import {
  useConvex,
  useConvexAuth,
  useMutation,
  usePaginatedQuery,
  useQuery,
} from "convex/react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import type {
  AttachmentUploadHandlers,
  ComposerAttachment,
  DraftAttachment,
  MessageAttachment,
} from "@/lib/attachments";
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
  streamId?: string;
  streamStatus?: ChatMessage["streamStatus"];
  errorMessage?: string;
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
  const createMessage = useMutation((api.messages as { create: any }).create);
  const editMessage = useMutation((api.messages as { edit: any }).edit);
  const createAssistantReply = useMutation(
    (api.messages as { createAssistantReply: any }).createAssistantReply,
  );
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
  const [drivenStreamMessageIds, setDrivenStreamMessageIds] = useState<string[]>(
    [],
  );
  const [messageCache, setMessageCache] = useState<
    Record<string, ChatMessage[] | undefined>
  >({});
  const [selectedModel, setSelectedModel] = useState<Model>(DEFAULT_MODEL);
  const persistedMessages = useQuery(
    api.messages.listByThread,
    isAuthenticated && activeThreadId ? { threadId: activeThreadId } : "skip",
  );
  const prefetchedThreadIdsRef = useRef(new Set<ThreadSummary["_id"]>());
  const prefetchPromisesRef = useRef(
    new Map<ThreadSummary["_id"], Promise<void>>(),
  );

  const activeThread = useMemo(
    () => threads?.find((thread) => thread._id === activeThreadId) ?? null,
    [activeThreadId, threads],
  );
  const currentModel = selectedModel;
  const streamUrl = useMemo(
    () => new URL("/messages/stream", env.VITE_CONVEX_SITE_URL),
    [],
  );

  useEffect(() => {
    if (!activeThreadId || persistedMessages === undefined) {
      return;
    }

    setMessageCache((currentCache) => ({
      ...currentCache,
      [activeThreadId]: (persistedMessages as PersistedMessagePayload[]).map(
        toChatMessage,
      ),
    }));
  }, [activeThreadId, persistedMessages]);

  const activeMessages = useMemo(
    () =>
      (activeThreadId ? messageCache[activeThreadId] : undefined) ??
      ((persistedMessages as PersistedMessagePayload[] | undefined)?.map(
        toChatMessage,
      ) ??
        []),
    [activeThreadId, messageCache, persistedMessages],
  );

  useEffect(() => {
    if (!activeThreadId) {
      setDrivenStreamMessageIds([]);
      setStreamingThreadIds([]);
      return;
    }

    const activeMessageIds = new Set(activeMessages.map((message) => message.id));
    setDrivenStreamMessageIds((currentMessageIds) =>
      currentMessageIds.filter((messageId) => activeMessageIds.has(messageId)),
    );
    setStreamingThreadIds((currentThreadIds) =>
      currentThreadIds.filter((threadId) => threadId === activeThreadId),
    );
  }, [activeMessages, activeThreadId]);

  const getThreadMessages = useCallback(
    (threadId: ThreadSummary["_id"]) =>
      messageCache[threadId] ??
      (threadId === activeThreadId
        ? ((persistedMessages as PersistedMessagePayload[] | undefined)?.map(
            toChatMessage,
          ) ?? [])
        : []),
    [activeThreadId, messageCache, persistedMessages],
  );

  const appendCachedMessage = useCallback(
    (threadId: ThreadSummary["_id"], message: ChatMessage) => {
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
    },
    [],
  );

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

  const markDrivenStreamMessage = useCallback((
    threadId: ThreadSummary["_id"],
    messageId: string,
  ) => {
    addStreamingThread(threadId);
    setDrivenStreamMessageIds((currentMessageIds) =>
      currentMessageIds.includes(messageId)
        ? currentMessageIds
        : [...currentMessageIds, messageId],
    );
  }, [addStreamingThread]);

  const finalizeDrivenStreamMessage = useCallback((
    threadId: ThreadSummary["_id"],
    messageId: string,
  ) => {
    removeStreamingThread(threadId);
    setDrivenStreamMessageIds((currentMessageIds) =>
      currentMessageIds.filter((currentMessageId) => currentMessageId !== messageId),
    );
  }, [removeStreamingThread]);

  const handleStreamStatusChange = useCallback((
    threadId: ThreadSummary["_id"] | undefined,
    messageId: string,
    status: ChatMessage["streamStatus"],
  ) => {
    if (!threadId || !status) {
      return;
    }

    if (status === "error" || status === "timeout") {
      setMessageCache((currentCache) => {
        const currentMessages = currentCache[threadId];
        if (!currentMessages) {
          return currentCache;
        }

        return {
          ...currentCache,
          [threadId]: currentMessages.map((message) =>
            message.id === messageId
              ? {
                  ...message,
                  streamStatus: status,
                }
              : message,
          ),
        };
      });
    }

    if (status === "done" || status === "error" || status === "timeout") {
      finalizeDrivenStreamMessage(threadId, messageId);
    }
  }, [finalizeDrivenStreamMessage]);

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

  const startAssistantReply = useCallback(
    async ({
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
      const createdAssistantMessage = (await createAssistantReply({
        threadId,
        userMessageId,
        userMessageUpdatedAt,
        modelId: model.id,
      })) as PersistedMessagePayload | null;

      if (!createdAssistantMessage) {
        return;
      }

      appendCachedMessage(threadId, {
        id: createdAssistantMessage._id,
        threadId,
        role: "system",
        content: createdAssistantMessage.content,
        attachments: createdAssistantMessage.attachments ?? [],
        modelId: model.id,
        model,
        streamId: createdAssistantMessage.streamId,
        streamStatus: createdAssistantMessage.streamStatus,
        errorMessage: createdAssistantMessage.errorMessage,
        createdAt: createdAssistantMessage.createdAt,
        updatedAt: createdAssistantMessage.updatedAt,
      });
      markDrivenStreamMessage(threadId, createdAssistantMessage._id);
    },
    [
      appendCachedMessage,
      createAssistantReply,
      markDrivenStreamMessage,
    ],
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

    const existingThreadMessages = getThreadMessages(threadId);
    if (
      streamingThreadIds.includes(threadId) ||
      existingThreadMessages.some(
        (message) =>
          message.streamStatus === "pending" || message.streamStatus === "streaming",
      )
    ) {
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

    await startAssistantReply({
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
    getThreadMessages,
    startAssistantReply,
    streamingThreadIds,
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

      setStreamingThreadIds((currentThreadIds) =>
        currentThreadIds.filter((currentThreadId) => currentThreadId !== threadId),
      );

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

      setDrivenStreamMessageIds((currentMessageIds) =>
        currentMessageIds.filter(
          (currentMessageId) => !editResult.deletedMessageIds.includes(currentMessageId),
        ),
      );

      setMessageCache((currentCache) => {
        const sourceMessages = getThreadMessages(threadId);
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
      await startAssistantReply({
        threadId,
        userMessageId: editResult.updatedMessage._id,
        userMessageUpdatedAt:
          editResult.updatedMessage.updatedAt ??
          editResult.updatedMessage.createdAt,
        model: nextModel,
      });
    },
    [editMessage, getThreadMessages, startAssistantReply],
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
      const threadMessages = threadId ? getThreadMessages(threadId) : [];
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
    [currentModel, getThreadMessages, restartFromUserMessage],
  );

  const activeThreadIsStreaming = Boolean(
    activeThreadId &&
      (activeThread?.isStreaming ||
        streamingThreadIds.includes(activeThreadId) ||
        activeMessages.some(
          (message) =>
            message.streamStatus === "pending" ||
            message.streamStatus === "streaming",
        )),
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
          drivenStreamMessageIds={drivenStreamMessageIds}
          streamUrl={streamUrl}
          onModelChange={handleModelChange}
          onMessageStreamStatusChange={handleStreamStatusChange}
          onSendMessage={(message, attachments, uploadHandlers) =>
            handleSendMessage(message, attachments, uploadHandlers)
          }
          onEditMessage={handleEditMessage}
          onRetryMessage={handleRetryMessage}
          isStreaming={activeThreadIsStreaming}
        />
      </SidebarInset>
    </SidebarProvider>
  );
}
