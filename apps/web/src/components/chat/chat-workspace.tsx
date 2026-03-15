import { api } from '@based-chat/backend/convex/_generated/api'
import type { Id } from '@based-chat/backend/convex/_generated/dataModel'
import { env } from '@based-chat/env/web'
import type { StreamId } from '@convex-dev/persistent-text-streaming'
import {
  SidebarInset,
  SidebarProvider,
} from '@based-chat/ui/components/sidebar'
import { Navigate, useNavigate } from '@tanstack/react-router'
import {
  useConvex,
  useConvexAuth,
  useMutation,
  usePaginatedQuery,
  useQuery,
} from 'convex/react'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { toast } from 'sonner'

import type {
  AttachmentUploadHandlers,
  ComposerAttachment,
  DraftAttachment,
  MessageAttachment,
} from '@/lib/attachments'
import AppSidebar from '@/components/chat/app-sidebar'
import Loader from '@/components/loader'
import { toChatMessage, type ChatMessage } from '@/lib/chat'
import { DEFAULT_MODEL, getModelById, type Model } from '@/lib/models'
import { abortPersistentTextStream } from '@/lib/persistent-text-stream'
import type { ThreadSummary } from '@/lib/threads'
import {
  TEMPORARY_CHAT_ROUTE,
  TEMPORARY_CHAT_THREAD_ID,
  createTemporaryMessageId,
  getTemporaryChatStreamUrl,
  isTemporaryThreadId,
  loadTemporaryChatState,
  persistTemporaryChatState,
  resetTemporaryChatState,
  startTemporaryChatStream,
  type TemporaryChatState,
  type TemporaryStreamMessage,
} from '@/lib/temporary-chat'

import ChatArea from './chat-area'

const THREAD_PAGE_SIZE = 20
const SELECTED_MODEL_STORAGE_KEY = 'based-chat:selected-model'

type PersistedMessagePayload = {
  _id: Id<'messages'>
  threadId: Id<'threads'>
  role: ChatMessage['role']
  content: string
  reasoningText?: string
  attachments?: MessageAttachment[]
  modelId: string
  streamId?: string
  streamStatus?: ChatMessage['streamStatus']
  errorMessage?: string
  generationStats?: ChatMessage['generationStats']
  createdAt: number
  updatedAt?: number
}

type EditedMessagePayload = {
  updatedMessage: PersistedMessagePayload
  deletedMessageIds: string[]
}

type FirstMessageCreationPayload = {
  thread: ThreadSummary
  message: PersistedMessagePayload
}
type ImportedTemporaryThreadPayload = {
  thread: ThreadSummary
  messages: PersistedMessagePayload[]
}

type ChatWorkspaceUser = {
  name?: string | null
  email?: string | null
  image?: string | null
} | null

const chatWorkspaceSnapshot: {
  user: ChatWorkspaceUser | undefined
  threads: ThreadSummary[]
  messageCache: Record<string, ChatMessage[] | undefined>
} = {
  user: undefined,
  threads: [],
  messageCache: {},
}

function formatMarkdownTimestamp(timestamp: number) {
  return new Intl.DateTimeFormat('en-US', {
    year: 'numeric',
    month: 'numeric',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
    second: '2-digit',
  }).format(timestamp)
}

function sanitizeMarkdownFilename(title: string) {
  const normalized = title
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')

  return normalized.length > 0 ? normalized : 'chat-export'
}

function buildThreadMarkdown(thread: ThreadSummary, messages: ChatMessage[]) {
  const sections = [
    `# ${thread.title}`,
    `Created: ${formatMarkdownTimestamp(thread.createdAt)}`,
    `Last Updated: ${formatMarkdownTimestamp(thread.updatedAt)}`,
    '---',
  ]

  for (const message of messages) {
    const label =
      message.role === 'user'
        ? 'User'
        : `Assistant${message.modelId ? ` (${message.modelId})` : ''}`
    const reasoning = message.reasoningText?.trim()
    const content = message.content.trim()

    sections.push(`### ${label}`)

    if (reasoning) {
      sections.push(
        '<details>',
        '<summary>Reasoning</summary>',
        '',
        reasoning,
        '</details>',
      )
    }

    if (content) {
      sections.push(content)
    }

    if (!content && message.attachments.length > 0) {
      sections.push(
        'Attachments:',
        ...message.attachments.map((attachment) => `- ${attachment.fileName}`),
      )
    }

    if (!content && message.attachments.length === 0) {
      sections.push('*No text content.*')
    }

    sections.push('---')
  }

  return `${sections.join('\n\n')}\n`
}

function downloadMarkdownFile(fileName: string, content: string) {
  const blob = new Blob([content], { type: 'text/markdown;charset=utf-8' })
  const url = window.URL.createObjectURL(blob)
  const anchor = document.createElement('a')

  anchor.href = url
  anchor.download = fileName
  document.body.appendChild(anchor)
  anchor.click()
  document.body.removeChild(anchor)
  window.URL.revokeObjectURL(url)
}

function mergeThreads(
  threads: ThreadSummary[],
  extraThreads: Array<ThreadSummary | null | undefined>,
) {
  const mergedThreads = new Map<ThreadSummary['_id'], ThreadSummary>()

  for (const thread of [...extraThreads, ...threads]) {
    if (thread) {
      mergedThreads.set(thread._id, thread)
    }
  }

  return [...mergedThreads.values()].sort(
    (left, right) => right.updatedAt - left.updatedAt,
  )
}

function areMessageAttachmentsEqual(
  left: MessageAttachment[],
  right: MessageAttachment[],
) {
  if (left.length !== right.length) {
    return false
  }

  return left.every((attachment, index) => {
    const otherAttachment = right[index]
    if (!otherAttachment) {
      return false
    }

    return (
      attachment.kind === otherAttachment.kind &&
      attachment.storageId === otherAttachment.storageId &&
      attachment.fileName === otherAttachment.fileName &&
      attachment.contentType === otherAttachment.contentType &&
      attachment.size === otherAttachment.size &&
      attachment.url === otherAttachment.url
    )
  })
}

function areChatMessagesEqual(left: ChatMessage, right: ChatMessage) {
  return (
    left.id === right.id &&
    left.threadId === right.threadId &&
    left.role === right.role &&
    left.content === right.content &&
    left.reasoningText === right.reasoningText &&
    left.modelId === right.modelId &&
    left.model?.id === right.model?.id &&
    left.createdAt === right.createdAt &&
    left.updatedAt === right.updatedAt &&
    left.streamId === right.streamId &&
    left.streamStatus === right.streamStatus &&
    left.errorMessage === right.errorMessage &&
    left.generationStats?.timeToFirstTokenMs ===
      right.generationStats?.timeToFirstTokenMs &&
    left.generationStats?.tokensPerSecond ===
      right.generationStats?.tokensPerSecond &&
    left.generationStats?.costUsd === right.generationStats?.costUsd &&
    left.generationStats?.inputTokens === right.generationStats?.inputTokens &&
    left.generationStats?.outputTokens === right.generationStats?.outputTokens &&
    left.generationStats?.totalTokens === right.generationStats?.totalTokens &&
    left.generationStats?.textTokens === right.generationStats?.textTokens &&
    left.generationStats?.reasoningTokens ===
      right.generationStats?.reasoningTokens &&
    left.isStreaming === right.isStreaming &&
    areMessageAttachmentsEqual(left.attachments, right.attachments)
  )
}

function areChatMessageListsEqual(left: ChatMessage[], right: ChatMessage[]) {
  if (left.length !== right.length) {
    return false
  }

  return left.every((message, index) => areChatMessagesEqual(message, right[index]!))
}

function withDisplayedDraftAttachmentUrls(
  uploadedAttachments: MessageAttachment[],
  draftAttachments: DraftAttachment[],
) {
  return uploadedAttachments.map((attachment, index) => ({
    ...attachment,
    url:
      attachment.kind === 'image'
        ? draftAttachments[index]?.previewUrl ?? attachment.url
        : attachment.url,
  }))
}

export default function ChatWorkspace({
  routeThreadId = null,
  temporary = false,
}: {
  routeThreadId?: Id<'threads'> | null
  temporary?: boolean
}) {
  const navigate = useNavigate()
  const convex = useConvex()
  const { isAuthenticated, isLoading } = useConvexAuth()
  const user = useQuery(
    api.auth.getCurrentUser,
    isAuthenticated ? {} : 'skip',
  ) as ChatWorkspaceUser | undefined
  const {
    results: threads,
    status: threadPaginationStatus,
    loadMore,
  } = usePaginatedQuery(
    api.threads.listPaginated,
    isAuthenticated ? {} : 'skip',
    { initialNumItems: THREAD_PAGE_SIZE },
  )
  const activeThreadQuery = useQuery(
    api.threads.get,
    isAuthenticated && routeThreadId && !temporary
      ? { threadId: routeThreadId }
      : 'skip',
  )
  const createMessage = useMutation((api.messages as { create: any }).create)
  const createThreadWithFirstMessage = useMutation(
    (api.messages as { createThreadWithFirstMessage: any })
      .createThreadWithFirstMessage,
  )
  const importTemporaryThread = useMutation(
    (api.messages as { importTemporaryThread: any }).importTemporaryThread,
  )
  const renameThread = useMutation(api.threads.rename)
  const deleteManyThreads = useMutation(api.threads.deleteMany)
  const editMessage = useMutation((api.messages as { edit: any }).edit)
  const createAssistantReply = useMutation(
    (api.messages as { createAssistantReply: any }).createAssistantReply,
  )
  const abortAssistantReply = useMutation(
    (api.messages as { abortAssistantReply: any }).abortAssistantReply,
  )
  const generateAttachmentUploadUrl = useMutation(
    (api.messages as { generateAttachmentUploadUrl: any })
      .generateAttachmentUploadUrl,
  )
  const [transientThread, setTransientThread] = useState<ThreadSummary | null>(
    null,
  )
  const [streamingThreadIds, setStreamingThreadIds] = useState<
    ThreadSummary['_id'][]
  >([])
  const [drivenStreamMessageIds, setDrivenStreamMessageIds] = useState<
    string[]
  >([])
  const [messageCache, setMessageCache] = useState<
    Record<string, ChatMessage[] | undefined>
  >(() => chatWorkspaceSnapshot.messageCache)
  const [temporaryChatState, setTemporaryChatState] =
    useState<TemporaryChatState>(loadTemporaryChatState)
  const [selectedModel, setSelectedModel] = useState<Model>(() => {
    if (typeof window === 'undefined') {
      return DEFAULT_MODEL
    }

    const storedModelId = window.localStorage.getItem(
      SELECTED_MODEL_STORAGE_KEY,
    )
    return (
      (storedModelId ? getModelById(storedModelId) : undefined) ?? DEFAULT_MODEL
    )
  })
  const temporaryStreamRef = useRef<ReturnType<typeof startTemporaryChatStream> | null>(
    null,
  )
  const persistedActiveThreadId = routeThreadId ?? transientThread?._id ?? null
  const activeThreadId = temporary
    ? TEMPORARY_CHAT_THREAD_ID
    : persistedActiveThreadId
  const persistedMessages = useQuery(
    api.messages.listByThread,
    isAuthenticated && persistedActiveThreadId && !temporary
      ? { threadId: persistedActiveThreadId }
      : 'skip',
  )
  const mappedPersistedMessages = useMemo(
    () =>
      ((persistedMessages as PersistedMessagePayload[] | undefined)?.map(
        toChatMessage,
      ) ?? []) as ChatMessage[],
    [persistedMessages],
  )
  const prefetchedThreadIdsRef = useRef(new Set<ThreadSummary['_id']>())
  const prefetchPromisesRef = useRef(
    new Map<ThreadSummary['_id'], Promise<void>>(),
  )

  useEffect(() => {
    if (routeThreadId) {
      setTransientThread(null)
    }
  }, [routeThreadId])

  useEffect(() => {
    persistTemporaryChatState(temporaryChatState)
  }, [temporaryChatState])

  useEffect(() => {
    window.localStorage.setItem(SELECTED_MODEL_STORAGE_KEY, selectedModel.id)
  }, [selectedModel])

  useEffect(() => {
    if (user !== undefined) {
      chatWorkspaceSnapshot.user = user
    }
  }, [user])

  const resolvedThreads =
    threadPaginationStatus === 'LoadingFirstPage' &&
    chatWorkspaceSnapshot.threads.length > 0
      ? chatWorkspaceSnapshot.threads
      : threads
  const resolvedActiveThreadQuery =
    activeThreadQuery === undefined && routeThreadId && !temporary
      ? chatWorkspaceSnapshot.threads.find(
          (thread) => thread._id === routeThreadId,
        )
      : activeThreadQuery
  const allThreads = useMemo(
    () =>
      mergeThreads(resolvedThreads, [
        resolvedActiveThreadQuery,
        transientThread,
      ]),
    [resolvedActiveThreadQuery, resolvedThreads, transientThread],
  )
  const resolvedUser = user ?? chatWorkspaceSnapshot.user
  const activeThread = useMemo(
    () =>
      temporary
        ? temporaryChatState.thread
        : allThreads.find((thread) => thread._id === activeThreadId) ?? null,
    [activeThreadId, allThreads, temporary, temporaryChatState.thread],
  )
  const isThreadPending =
    !temporary &&
    Boolean(routeThreadId) &&
    activeThreadQuery === undefined &&
    !messageCache[routeThreadId ?? '']
  const currentModel = selectedModel
  const streamUrl = useMemo(
    () => new URL('/messages/stream', env.VITE_CONVEX_SITE_URL),
    [],
  )
  const temporaryStreamUrl = useMemo(() => getTemporaryChatStreamUrl(), [])

  useEffect(() => {
    if (!activeThreadId || persistedMessages === undefined) {
      return
    }

    setMessageCache((currentCache) => {
      const currentMessages = currentCache[activeThreadId] ?? []
      if (areChatMessageListsEqual(currentMessages, mappedPersistedMessages)) {
        return currentCache
      }

      return {
        ...currentCache,
        [activeThreadId]: mappedPersistedMessages,
      }
    })
  }, [activeThreadId, mappedPersistedMessages, persistedMessages])

  useEffect(() => {
    if (allThreads.length > 0) {
      chatWorkspaceSnapshot.threads = allThreads
    }
  }, [allThreads])

  useEffect(() => {
    if (Object.keys(messageCache).length > 0) {
      chatWorkspaceSnapshot.messageCache = messageCache
    }
  }, [messageCache])

  const activeMessages = useMemo(
    () =>
      temporary
        ? temporaryChatState.messages
        : (activeThreadId ? messageCache[activeThreadId] : undefined) ??
          mappedPersistedMessages ??
          [],
    [activeThreadId, mappedPersistedMessages, messageCache, temporary, temporaryChatState.messages],
  )

  useEffect(() => {
    if (!activeThreadId) {
      setDrivenStreamMessageIds([])
      setStreamingThreadIds([])
      return
    }

    const activeMessageIds = new Set(
      activeMessages.map((message) => message.id),
    )
    setDrivenStreamMessageIds((currentMessageIds) =>
      currentMessageIds.filter((messageId) => activeMessageIds.has(messageId)),
    )
    setStreamingThreadIds((currentThreadIds) =>
      currentThreadIds.filter((threadId) => threadId === activeThreadId),
    )
  }, [activeMessages, activeThreadId])

  const getThreadMessages = useCallback(
    (threadId: ThreadSummary['_id']) => {
      if (isTemporaryThreadId(threadId)) {
        return temporaryChatState.messages
      }

      return (
        messageCache[threadId] ??
        (threadId === activeThreadId
          ? mappedPersistedMessages
          : [])
      )
    },
    [activeThreadId, mappedPersistedMessages, messageCache, temporaryChatState.messages],
  )

  const appendCachedMessage = useCallback(
    (threadId: ThreadSummary['_id'], message: ChatMessage) => {
      if (isTemporaryThreadId(threadId)) {
        setTemporaryChatState((currentState) => {
          if (
            currentState.messages.some(
              (currentMessage) => currentMessage.id === message.id,
            )
          ) {
            return currentState
          }

          return {
            thread: {
              ...currentState.thread,
              updatedAt: message.updatedAt ?? message.createdAt,
            },
            messages: [...currentState.messages, message],
          }
        })
        return
      }

      setMessageCache((currentCache) => {
        const currentMessages = currentCache[threadId] ?? []

        if (
          currentMessages.some(
            (currentMessage) => currentMessage.id === message.id,
          )
        ) {
          return currentCache
        }

        return {
          ...currentCache,
          [threadId]: [...currentMessages, message],
        }
      })
    },
    [],
  )

  const patchTemporaryMessage = useCallback(
    (
      messageId: string,
      updater: (message: ChatMessage) => ChatMessage,
    ) => {
      setTemporaryChatState((currentState) => {
        let didUpdate = false
        const nextMessages = currentState.messages.map((message) => {
          if (message.id !== messageId) {
            return message
          }

          didUpdate = true
          return updater(message)
        })

        if (!didUpdate) {
          return currentState
        }

        const lastMessage = nextMessages.at(-1)
        return {
          thread: {
            ...currentState.thread,
            updatedAt:
              lastMessage?.updatedAt ?? lastMessage?.createdAt ?? Date.now(),
          },
          messages: nextMessages,
        }
      })
    },
    [],
  )

  const addStreamingThread = useCallback((threadId: ThreadSummary['_id']) => {
    setStreamingThreadIds((currentThreadIds) =>
      currentThreadIds.includes(threadId)
        ? currentThreadIds
        : [...currentThreadIds, threadId],
    )
  }, [])

  const removeStreamingThread = useCallback(
    (threadId: ThreadSummary['_id']) => {
      setStreamingThreadIds((currentThreadIds) =>
        currentThreadIds.filter(
          (currentThreadId) => currentThreadId !== threadId,
        ),
      )
    },
    [],
  )

  const markDrivenStreamMessage = useCallback(
    (threadId: ThreadSummary['_id'], messageId: string) => {
      addStreamingThread(threadId)
      setDrivenStreamMessageIds((currentMessageIds) =>
        currentMessageIds.includes(messageId)
          ? currentMessageIds
          : [...currentMessageIds, messageId],
      )
    },
    [addStreamingThread],
  )

  useEffect(() => {
    if (!activeThreadId) {
      return
    }

    const pendingAssistantMessage = [...activeMessages]
      .reverse()
      .find(
        (message) =>
          message.threadId === activeThreadId &&
          message.role === 'system' &&
          (message.streamStatus === 'pending' ||
            message.streamStatus === 'streaming') &&
          Boolean(message.streamId),
      )

    if (!pendingAssistantMessage) {
      return
    }

    markDrivenStreamMessage(activeThreadId, pendingAssistantMessage.id)
  }, [activeMessages, activeThreadId, markDrivenStreamMessage])

  const finalizeDrivenStreamMessage = useCallback(
    (threadId: ThreadSummary['_id'], messageId: string) => {
      removeStreamingThread(threadId)
      setDrivenStreamMessageIds((currentMessageIds) =>
        currentMessageIds.filter(
          (currentMessageId) => currentMessageId !== messageId,
        ),
      )
    },
    [removeStreamingThread],
  )

  const handleStreamStatusChange = useCallback(
    (
      threadId: ThreadSummary['_id'] | undefined,
      messageId: string,
      status: ChatMessage['streamStatus'],
    ) => {
      if (!threadId || !status) {
        return
      }

      if (status === 'error' || status === 'timeout') {
        setMessageCache((currentCache) => {
          const currentMessages = currentCache[threadId]
          if (!currentMessages) {
            return currentCache
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
          }
        })
      }

      if (status === 'done' || status === 'error' || status === 'timeout') {
        finalizeDrivenStreamMessage(threadId, messageId)
      }
    },
    [finalizeDrivenStreamMessage],
  )

  const handleNewChat = useCallback(() => {
    setTransientThread(null)
    void navigate({ to: '/' })
  }, [navigate])

  const handleSelectTemporaryChat = useCallback(() => {
    void navigate({ to: TEMPORARY_CHAT_ROUTE })
  }, [navigate])

  const handleStartTemporaryChat = useCallback(() => {
    temporaryStreamRef.current?.abort()
    temporaryStreamRef.current = null
    setDrivenStreamMessageIds([])
    setStreamingThreadIds([])
    setTemporaryChatState(resetTemporaryChatState())
    void navigate({ to: TEMPORARY_CHAT_ROUTE })
  }, [navigate])

  const handleSelectThread = useCallback(
    (threadId: ThreadSummary['_id']) => {
      void navigate({
        to: '/chat/$threadId',
        params: {
          threadId,
        },
      })
    },
    [navigate],
  )

  const handleOpenThreadInNewTab = useCallback(
    (threadId: ThreadSummary['_id']) => {
      window.open(
        `/chat/${encodeURIComponent(threadId)}`,
        '_blank',
        'noopener,noreferrer',
      )
    },
    [],
  )

  const handleRenameThread = useCallback(
    async (threadId: ThreadSummary['_id'], title: string) => {
      await renameThread({
        threadId,
        title,
      })
      toast.success('Thread renamed.')
    },
    [renameThread],
  )

  const handleDeleteThread = useCallback(
    async (threadId: ThreadSummary['_id']) => {
      const { deletedCount } = (await deleteManyThreads({
        threadIds: [threadId],
      })) as { deletedCount: number }

      setMessageCache((currentCache) => {
        if (!(threadId in currentCache)) {
          return currentCache
        }

        const nextCache = { ...currentCache }
        delete nextCache[threadId]
        return nextCache
      })
      setStreamingThreadIds((currentThreadIds) =>
        currentThreadIds.filter((currentThreadId) => currentThreadId !== threadId),
      )

      if (activeThreadId === threadId || routeThreadId === threadId) {
        setDrivenStreamMessageIds([])
        void navigate({ to: '/' })
      }

      toast.success(
        `Deleted ${deletedCount} thread${deletedCount === 1 ? '' : 's'}.`,
      )
    },
    [activeThreadId, deleteManyThreads, navigate, routeThreadId],
  )

  const handleExportThreadAsMarkdown = useCallback(
    async (threadId: ThreadSummary['_id']) => {
      const thread = allThreads.find((currentThread) => currentThread._id === threadId)
      if (!thread) {
        throw new Error('Thread not found.')
      }

      const cachedMessages = getThreadMessages(threadId)
      const resolvedMessages =
        cachedMessages.length > 0
          ? cachedMessages
          : (
              ((await convex.query(api.messages.listByThread, {
                threadId,
              })) as PersistedMessagePayload[]).map(toChatMessage)
            )
      const markdown = buildThreadMarkdown(thread, resolvedMessages)

      downloadMarkdownFile(
        `${sanitizeMarkdownFilename(thread.title)}.md`,
        markdown,
      )
      toast.success('Markdown export ready.')
    },
    [allThreads, convex, getThreadMessages],
  )

  const handleClearTemporaryChat = useCallback(() => {
    temporaryStreamRef.current?.abort()
    temporaryStreamRef.current = null
    setDrivenStreamMessageIds((currentMessageIds) =>
      activeThreadId === TEMPORARY_CHAT_THREAD_ID ? [] : currentMessageIds,
    )
    setStreamingThreadIds((currentThreadIds) =>
      currentThreadIds.filter(
        (currentThreadId) => currentThreadId !== TEMPORARY_CHAT_THREAD_ID,
      ),
    )
    setTemporaryChatState(resetTemporaryChatState())
    toast.success('Temporary chat cleared.')
  }, [activeThreadId])

  const handleExportTemporaryChatAsMarkdown = useCallback(async () => {
    if (temporaryChatState.messages.length === 0) {
      throw new Error('There are no messages to export yet.')
    }

    const markdown = buildThreadMarkdown(
      temporaryChatState.thread,
      temporaryChatState.messages,
    )
    downloadMarkdownFile('temporary-chat.md', markdown)
    toast.success('Markdown export ready.')
  }, [temporaryChatState.messages, temporaryChatState.thread])

  const handleConvertTemporaryChatToStored = useCallback(async () => {
    if (temporaryChatState.messages.length === 0) {
      throw new Error('There are no messages to store yet.')
    }

    if (streamingThreadIds.includes(TEMPORARY_CHAT_THREAD_ID)) {
      throw new Error('Wait for the temporary reply to finish before storing it.')
    }

    const importResult = (await importTemporaryThread({
      messages: temporaryChatState.messages.map((message) => ({
        role: message.role,
        modelId: message.modelId ?? DEFAULT_MODEL.id,
        content: message.content,
        reasoningText: message.reasoningText,
        attachments:
          message.attachments.length > 0
            ? message.attachments.map((attachment) => ({
                kind: attachment.kind,
                storageId: attachment.storageId,
                fileName: attachment.fileName,
                contentType: attachment.contentType,
                size: attachment.size,
              }))
            : undefined,
        errorMessage: message.errorMessage,
        generationStats: message.generationStats,
        createdAt: message.createdAt,
        updatedAt: message.updatedAt,
      })),
    })) as ImportedTemporaryThreadPayload

    setTransientThread(importResult.thread)
    setMessageCache((currentCache) => ({
      ...currentCache,
      [importResult.thread._id]: importResult.messages.map(toChatMessage),
    }))
    setTemporaryChatState(resetTemporaryChatState())
    void navigate({
      to: '/chat/$threadId',
      params: {
        threadId: importResult.thread._id,
      },
    })
    toast.success('Temporary chat saved to your history.')
  }, [importTemporaryThread, navigate, streamingThreadIds, temporaryChatState.messages])

  const handleModelChange = useCallback((model: Model) => {
    setSelectedModel(model)
  }, [])

  const handleLoadMoreThreads = useCallback(() => {
    if (threadPaginationStatus === 'CanLoadMore') {
      loadMore(THREAD_PAGE_SIZE)
    }
  }, [loadMore, threadPaginationStatus])

  const handlePrefetchThread = useCallback(
    (threadId: ThreadSummary['_id']) => {
      if (isTemporaryThreadId(threadId)) {
        return
      }

      if (
        messageCache[threadId] ||
        prefetchedThreadIdsRef.current.has(threadId)
      ) {
        return
      }

      const inFlight = prefetchPromisesRef.current.get(threadId)
      if (inFlight) {
        return
      }

      const prefetchPromise = convex
        .query(api.messages.listByThread, { threadId })
        .then((messages) => {
          const typedMessages = messages as PersistedMessagePayload[]
          prefetchedThreadIdsRef.current.add(threadId)
          setMessageCache((currentCache) => ({
            ...currentCache,
            [threadId]: typedMessages.map(toChatMessage),
          }))
        })
        .finally(() => {
          prefetchPromisesRef.current.delete(threadId)
        })

      prefetchPromisesRef.current.set(threadId, prefetchPromise)
    },
    [convex, messageCache],
  )

  const uploadAttachments = useCallback(
    async (
      attachments: DraftAttachment[],
      uploadHandlers?: AttachmentUploadHandlers,
    ): Promise<MessageAttachment[]> => {
      if (attachments.length === 0) {
        return []
      }

      return await Promise.all(
        attachments.map(async (attachment) => {
          const uploadUrl = (await generateAttachmentUploadUrl({})) as string
          const { storageId } = await new Promise<{
            storageId: Id<'_storage'>
          }>((resolve, reject) => {
            const xhr = new XMLHttpRequest()

            xhr.open('POST', uploadUrl)
            xhr.setRequestHeader('Content-Type', attachment.contentType)

            xhr.upload.addEventListener('progress', (event) => {
              if (!event.lengthComputable) {
                return
              }

              uploadHandlers?.onUploadProgress?.(
                attachment.id,
                Math.min(100, Math.round((event.loaded / event.total) * 100)),
              )
            })

            xhr.addEventListener('load', () => {
              if (xhr.status < 200 || xhr.status >= 300) {
                reject(new Error('Failed to upload image attachment.'))
                return
              }

              uploadHandlers?.onUploadProgress?.(attachment.id, 100)

              try {
                resolve(
                  JSON.parse(xhr.responseText) as { storageId: Id<'_storage'> },
                )
              } catch {
                reject(
                  new Error('Failed to read uploaded attachment response.'),
                )
              }
            })

            xhr.addEventListener('error', () => {
              reject(new Error('Failed to upload image attachment.'))
            })

            xhr.send(attachment.file)
          })

          return {
            kind: attachment.kind,
            storageId,
            fileName: attachment.fileName,
            contentType: attachment.contentType,
            size: attachment.size,
            url: null,
          }
        }),
      )
    },
    [generateAttachmentUploadUrl],
  )

  const startAssistantReply = useCallback(
    async ({
      threadId,
      userMessageId,
      userMessageUpdatedAt,
      model,
    }: {
      threadId: ThreadSummary['_id']
      userMessageId: Id<'messages'>
      userMessageUpdatedAt: number
      model: Model
    }) => {
      const createdAssistantMessage = (await createAssistantReply({
        threadId,
        userMessageId,
        userMessageUpdatedAt,
        modelId: model.id,
      })) as PersistedMessagePayload | null

      if (!createdAssistantMessage) {
        return
      }

      appendCachedMessage(threadId, {
        id: createdAssistantMessage._id,
        threadId,
        role: 'system',
        content: createdAssistantMessage.content,
        reasoningText: createdAssistantMessage.reasoningText,
        attachments: createdAssistantMessage.attachments ?? [],
        modelId: model.id,
        model,
        streamId: createdAssistantMessage.streamId,
        streamStatus: createdAssistantMessage.streamStatus,
        errorMessage: createdAssistantMessage.errorMessage,
        generationStats: createdAssistantMessage.generationStats,
        createdAt: createdAssistantMessage.createdAt,
        updatedAt: createdAssistantMessage.updatedAt,
      })
      markDrivenStreamMessage(threadId, createdAssistantMessage._id)
    },
    [appendCachedMessage, createAssistantReply, markDrivenStreamMessage],
  )

  const startTemporaryAssistantReply = useCallback(
    async ({
      model,
      conversationMessages,
    }: {
      model: Model
      conversationMessages: ChatMessage[]
    }) => {
      const assistantMessageId = createTemporaryMessageId()
      const assistantMessage: ChatMessage = {
        id: assistantMessageId,
        threadId: TEMPORARY_CHAT_THREAD_ID,
        role: 'system',
        content: '',
        reasoningText: '',
        attachments: [],
        modelId: model.id,
        model,
        createdAt: Date.now(),
        updatedAt: Date.now(),
        streamStatus: 'pending',
      }

      appendCachedMessage(TEMPORARY_CHAT_THREAD_ID, assistantMessage)
      addStreamingThread(TEMPORARY_CHAT_THREAD_ID)

      temporaryStreamRef.current?.abort()
      const stream = startTemporaryChatStream({
        url: temporaryStreamUrl,
        modelId: model.id,
        messages: conversationMessages.map<TemporaryStreamMessage>((message) => ({
          role: message.role,
          content: message.content,
          attachments: message.attachments.map((attachment) => ({
            kind: attachment.kind,
            storageId: attachment.storageId,
            fileName: attachment.fileName,
            contentType: attachment.contentType,
            size: attachment.size,
          })),
        })),
        onTextDelta: (text) => {
          patchTemporaryMessage(assistantMessageId, (message) => ({
            ...message,
            content: message.content + text,
            streamStatus: 'streaming',
            updatedAt: Date.now(),
          }))
        },
        onReasoningDelta: (text) => {
          patchTemporaryMessage(assistantMessageId, (message) => ({
            ...message,
            reasoningText: `${message.reasoningText ?? ''}${text}`,
            streamStatus: message.streamStatus === 'pending' ? 'streaming' : message.streamStatus,
            updatedAt: Date.now(),
          }))
        },
        onFinish: (generationStats) => {
          patchTemporaryMessage(assistantMessageId, (message) => ({
            ...message,
            streamStatus: 'done',
            generationStats,
            updatedAt: Date.now(),
          }))
        },
        onError: (errorMessage) => {
          patchTemporaryMessage(assistantMessageId, (message) => ({
            ...message,
            streamStatus: 'error',
            errorMessage,
            updatedAt: Date.now(),
          }))
        },
      })

      temporaryStreamRef.current = stream

      try {
        await stream.finished
      } finally {
        if (temporaryStreamRef.current === stream) {
          temporaryStreamRef.current = null
          removeStreamingThread(TEMPORARY_CHAT_THREAD_ID)
        }
      }
    },
    [
      addStreamingThread,
      appendCachedMessage,
      patchTemporaryMessage,
      removeStreamingThread,
      temporaryStreamUrl,
    ],
  )

  const handleSendMessage = useCallback(
    async (
      content: string,
      attachments: DraftAttachment[],
      uploadHandlers?: AttachmentUploadHandlers,
      options?: {
        modelOverride?: Model
      },
    ) => {
      const trimmedContent = content.trim()
      const draftAttachments = attachments

      if (!trimmedContent && draftAttachments.length === 0) {
        return
      }

      const modelForMessage = options?.modelOverride ?? currentModel
      const uploadedAttachments = await uploadAttachments(
        draftAttachments,
        uploadHandlers,
      )
      const displayedUploadedAttachments = withDisplayedDraftAttachmentUrls(
        uploadedAttachments,
        draftAttachments,
      )

      if (temporary) {
        const existingThreadMessages = temporaryChatState.messages
        if (
          streamingThreadIds.includes(TEMPORARY_CHAT_THREAD_ID) ||
          existingThreadMessages.some(
            (message) =>
              message.streamStatus === 'pending' ||
              message.streamStatus === 'streaming',
          )
        ) {
          return
        }

        const createdAt = Date.now()
        const userMessage: ChatMessage = {
          id: createTemporaryMessageId(),
          threadId: TEMPORARY_CHAT_THREAD_ID,
          role: 'user',
          content: trimmedContent,
          attachments: displayedUploadedAttachments,
          modelId: modelForMessage.id,
          model: modelForMessage,
          createdAt,
          updatedAt: createdAt,
        }

        appendCachedMessage(TEMPORARY_CHAT_THREAD_ID, userMessage)
        await startTemporaryAssistantReply({
          model: modelForMessage,
          conversationMessages: [...existingThreadMessages, userMessage],
        })
        return
      }

      let threadId = activeThreadId
      let createdUserMessage: PersistedMessagePayload
      let createdThread: ThreadSummary | null = null

      if (!threadId) {
        const firstMessageResult = (await createThreadWithFirstMessage({
          content: trimmedContent,
          attachments: uploadedAttachments.map((attachment) => ({
            kind: attachment.kind,
            storageId: attachment.storageId,
            fileName: attachment.fileName,
            contentType: attachment.contentType,
            size: attachment.size,
          })),
          modelId: modelForMessage.id,
        })) as FirstMessageCreationPayload

        createdThread = firstMessageResult.thread
        createdUserMessage = firstMessageResult.message
        threadId = createdThread._id
        setTransientThread(createdThread)
      } else {
        const existingThreadMessages = getThreadMessages(threadId)
        if (
          streamingThreadIds.includes(threadId) ||
          existingThreadMessages.some(
            (message) =>
              message.streamStatus === 'pending' ||
              message.streamStatus === 'streaming',
          )
        ) {
          return
        }

        createdUserMessage = (await createMessage({
          threadId,
          role: 'user',
          content: trimmedContent,
          attachments: uploadedAttachments.map((attachment) => ({
            kind: attachment.kind,
            storageId: attachment.storageId,
            fileName: attachment.fileName,
            contentType: attachment.contentType,
            size: attachment.size,
          })),
          modelId: modelForMessage.id,
        })) as PersistedMessagePayload
      }

      appendCachedMessage(threadId, {
        id: createdUserMessage._id,
        threadId,
        role: 'user',
        content: trimmedContent,
        attachments:
          createdUserMessage.attachments ?? displayedUploadedAttachments,
        modelId: modelForMessage.id,
        model: modelForMessage,
        createdAt: createdUserMessage.createdAt,
        updatedAt: createdUserMessage.updatedAt,
      })

      if (createdThread) {
        void navigate({
          to: '/chat/$threadId',
          params: {
            threadId: createdThread._id,
          },
        })
      }

      await startAssistantReply({
        threadId,
        userMessageId: createdUserMessage._id,
        userMessageUpdatedAt:
          createdUserMessage.updatedAt ?? createdUserMessage.createdAt,
        model: modelForMessage,
      })
    },
    [
      activeThreadId,
      appendCachedMessage,
      createMessage,
      createThreadWithFirstMessage,
      currentModel,
      getThreadMessages,
      navigate,
      startAssistantReply,
      startTemporaryAssistantReply,
      streamingThreadIds,
      temporary,
      temporaryChatState.messages,
      uploadAttachments,
    ],
  )

  const restartFromUserMessage = useCallback(
    async ({
      message,
      content,
      nextModel,
      attachments,
    }: {
      message: ChatMessage
      content: string
      nextModel: Model
      attachments: MessageAttachment[]
    }) => {
      const trimmedContent = content.trim()
      const threadId = message.threadId

      if ((!trimmedContent && attachments.length === 0) || !threadId) {
        return
      }

      if (isTemporaryThreadId(threadId)) {
        let nextMessages: ChatMessage[] = []
        const updatedAt = Date.now()

        setTemporaryChatState((currentState) => {
          const targetIndex = currentState.messages.findIndex(
            (currentMessage) => currentMessage.id === message.id,
          )
          if (targetIndex === -1) {
            nextMessages = currentState.messages
            return currentState
          }

          nextMessages = currentState.messages
            .slice(0, targetIndex + 1)
            .map((currentMessage) =>
              currentMessage.id === message.id
                ? {
                    ...currentMessage,
                    content: trimmedContent,
                    attachments,
                    modelId: nextModel.id,
                    model: nextModel,
                    updatedAt,
                  }
                : currentMessage,
            )

          return {
            thread: {
              ...currentState.thread,
              updatedAt,
            },
            messages: nextMessages,
          }
        })

        setSelectedModel(nextModel)
        if (nextMessages.length > 0) {
          await startTemporaryAssistantReply({
            model: nextModel,
            conversationMessages: nextMessages,
          })
        }
        return
      }

      setStreamingThreadIds((currentThreadIds) =>
        currentThreadIds.filter(
          (currentThreadId) => currentThreadId !== threadId,
        ),
      )

      const editResult = (await editMessage({
        threadId,
        messageId: message.id as Id<'messages'>,
        content: trimmedContent,
        modelId: nextModel.id,
        attachments: attachments.map((attachment) => ({
          kind: attachment.kind,
          storageId: attachment.storageId,
          fileName: attachment.fileName,
          contentType: attachment.contentType,
          size: attachment.size,
        })),
      })) as EditedMessagePayload

      const updatedMessage: ChatMessage = {
        id: editResult.updatedMessage._id,
        threadId,
        role: 'user',
        content: editResult.updatedMessage.content,
        attachments: editResult.updatedMessage.attachments ?? attachments,
        modelId: nextModel.id,
        model: nextModel,
        createdAt: editResult.updatedMessage.createdAt,
        updatedAt: editResult.updatedMessage.updatedAt,
      }

      setDrivenStreamMessageIds((currentMessageIds) =>
        currentMessageIds.filter(
          (currentMessageId) =>
            !editResult.deletedMessageIds.includes(currentMessageId),
        ),
      )

      setMessageCache((currentCache) => {
        const sourceMessages =
          currentCache[threadId] ??
          (threadId === activeThreadId ? mappedPersistedMessages : [])
        const deletedMessageIds = new Set<string>(editResult.deletedMessageIds)
        const prunedMessages = sourceMessages.filter(
          (currentMessage) => !deletedMessageIds.has(currentMessage.id),
        )
        const hasUpdatedMessage = prunedMessages.some(
          (currentMessage) => currentMessage.id === updatedMessage.id,
        )
        const nextMessages = (
          hasUpdatedMessage
            ? prunedMessages
            : [...prunedMessages, updatedMessage]
        )
          .map((currentMessage) =>
            currentMessage.id === updatedMessage.id
              ? updatedMessage
              : currentMessage,
          )
          .sort((left, right) => left.createdAt - right.createdAt)

        return {
          ...currentCache,
          [threadId]: nextMessages,
        }
      })

      setSelectedModel(nextModel)
      await startAssistantReply({
        threadId,
        userMessageId: editResult.updatedMessage._id,
        userMessageUpdatedAt:
          editResult.updatedMessage.updatedAt ??
          editResult.updatedMessage.createdAt,
        model: nextModel,
      })
    },
    [
      activeThreadId,
      editMessage,
      mappedPersistedMessages,
      startAssistantReply,
      startTemporaryAssistantReply,
    ],
  )

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
            attachment.source === 'draft',
        ),
      )
      const displayedUploadedAttachments = withDisplayedDraftAttachmentUrls(
        uploadedAttachments,
        attachments.filter(
          (attachment): attachment is DraftAttachment =>
            attachment.source === 'draft',
        ),
      )
      const persistedAttachments = attachments
        .filter((attachment) => attachment.source === 'stored')
        .map((attachment) => ({
          kind: attachment.kind,
          storageId: attachment.storageId,
          fileName: attachment.fileName,
          contentType: attachment.contentType,
          size: attachment.size,
          url: attachment.url,
        }))

      await restartFromUserMessage({
        message,
        content,
        nextModel,
        attachments: [...persistedAttachments, ...displayedUploadedAttachments],
      })
    },
    [restartFromUserMessage, uploadAttachments],
  )

  const handleRetryMessage = useCallback(
    async (message: ChatMessage) => {
      const retryModel =
        message.model ??
        (message.modelId ? getModelById(message.modelId) : undefined) ??
        currentModel

      const threadId = message.threadId
      const threadMessages = threadId ? getThreadMessages(threadId) : []
      const messageIndex = threadMessages.findIndex(
        (threadMessage) => threadMessage.id === message.id,
      )
      const sourceMessage =
        message.role === 'user'
          ? message
          : messageIndex >= 0
            ? [...threadMessages.slice(0, messageIndex)]
                .reverse()
                .find((threadMessage) => threadMessage.role === 'user')
            : undefined

      if (!sourceMessage) {
        return
      }

      await restartFromUserMessage({
        message: sourceMessage,
        content: sourceMessage.content,
        nextModel: retryModel,
        attachments: sourceMessage.attachments,
      })
    },
    [currentModel, getThreadMessages, restartFromUserMessage],
  )

  const handleAbortStreaming = useCallback(() => {
    if (!activeThreadId) {
      return
    }

    if (isTemporaryThreadId(activeThreadId)) {
      const currentTemporaryStream = temporaryStreamRef.current
      temporaryStreamRef.current = null
      currentTemporaryStream?.abort()
      removeStreamingThread(TEMPORARY_CHAT_THREAD_ID)
      return
    }

    const pendingAssistantMessage = [...activeMessages]
      .reverse()
      .find(
        (message) =>
          message.threadId === activeThreadId &&
          message.role === 'system' &&
          (message.streamStatus === 'pending' ||
            message.streamStatus === 'streaming') &&
          Boolean(message.streamId),
      )

    if (!pendingAssistantMessage?.streamId) {
      return
    }

    void abortAssistantReply({
      streamId: pendingAssistantMessage.streamId,
    })
    abortPersistentTextStream(pendingAssistantMessage.streamId as StreamId)
  }, [abortAssistantReply, activeMessages, activeThreadId, removeStreamingThread])

  const activeThreadIsStreaming = Boolean(
    activeThreadId &&
    (activeThread?.isStreaming ||
      streamingThreadIds.includes(activeThreadId) ||
      activeMessages.some(
        (message) =>
          message.streamStatus === 'pending' ||
          message.streamStatus === 'streaming',
      )),
  )

  const hasWarmChatSnapshot =
    chatWorkspaceSnapshot.user !== undefined ||
    chatWorkspaceSnapshot.threads.length > 0 ||
    Object.keys(chatWorkspaceSnapshot.messageCache).length > 0

  if (
    isLoading ||
    (isAuthenticated &&
      (user === undefined || threadPaginationStatus === 'LoadingFirstPage') &&
      !hasWarmChatSnapshot)
  ) {
    return <Loader variant='shell' />
  }

  if (!isLoading && (!isAuthenticated || !resolvedUser)) {
    return <Navigate to='/sign-in' />
  }

  const currentUser = resolvedUser as Exclude<
    ChatWorkspaceUser,
    null | undefined
  >

  if (routeThreadId && activeThreadQuery === null) {
    return <Navigate to='/' />
  }

  return (
    <SidebarProvider>
      <AppSidebar
        threads={allThreads}
        activeThreadId={activeThreadId}
        temporaryThread={temporaryChatState.thread}
        isTemporaryActive={temporary}
        isTemporaryStreaming={streamingThreadIds.includes(
          TEMPORARY_CHAT_THREAD_ID,
        )}
        temporaryMessageCount={temporaryChatState.messages.length}
        streamingThreadIds={streamingThreadIds}
        onSelectThread={handleSelectThread}
        onSelectTemporaryChat={handleSelectTemporaryChat}
        onPrefetchThread={handlePrefetchThread}
        onClearTemporaryChat={handleClearTemporaryChat}
        onExportTemporaryChatAsMarkdown={handleExportTemporaryChatAsMarkdown}
        onConvertTemporaryChatToStored={handleConvertTemporaryChatToStored}
        onOpenThreadInNewTab={handleOpenThreadInNewTab}
        onRenameThread={handleRenameThread}
        onDeleteThread={handleDeleteThread}
        onExportThreadAsMarkdown={handleExportThreadAsMarkdown}
        onNewChat={handleNewChat}
        onLoadMoreThreads={handleLoadMoreThreads}
        threadPaginationStatus={threadPaginationStatus}
        user={currentUser}
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
          onAbortStreaming={handleAbortStreaming}
          onStartTemporaryChat={handleStartTemporaryChat}
          isStreaming={activeThreadIsStreaming}
          isThreadPending={isThreadPending}
          isTemporaryChat={temporary}
        />
      </SidebarInset>
    </SidebarProvider>
  )
}
