import { api } from '@based-chat/backend/convex/_generated/api'
import type { Id } from '@based-chat/backend/convex/_generated/dataModel'
import { Ionicons } from '@expo/vector-icons'
import { FlashList, type FlashListRef } from '@shopify/flash-list'
import { router, useLocalSearchParams } from 'expo-router'
import { useMutation, useQuery } from 'convex/react'
import * as Haptics from 'expo-haptics'
import { useToast } from 'heroui-native'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import {
  ActivityIndicator,
  AppState,
  type NativeScrollEvent,
  type NativeSyntheticEvent,
  type AppStateStatus,
  Pressable,
  Text,
  View,
} from 'react-native'
import { KeyboardAvoidingView } from 'react-native-keyboard-controller'
import { useSafeAreaInsets } from 'react-native-safe-area-context'

import ChatInput, { type PickedDocument } from '@/components/chat/chat-input'
import MessageBubble, {
  type ChatMessage,
  type MessageAttachment,
  type MessageSource,
} from '@/components/chat/message-bubble'
import { getStoredOpenRouterApiKey } from '@/lib/api-keys'
import {
  type PersistentMessageStreamResult,
  startPersistentMessageStream,
  toNativeChatMessage,
  uploadPickedDocuments,
} from '@/lib/chat-runtime'
import { getModelById, modelCanAcceptAttachments } from '@/lib/models'
import { useSelectedModel } from '@/lib/selected-model'
import { useColors } from '@/lib/use-colors'

const TOAST_DURATION_MS = 5000
const AUTO_SCROLL_THRESHOLD = 80

type LiveStreamState = {
  streamId: string
  text: string
  reasoningText: string
  sources: MessageSource[]
  attachments: MessageAttachment[]
  status: 'pending' | 'streaming' | 'error'
  errorMessage?: string
}

function mergeLiveSources(
  persistedSources: MessageSource[],
  liveSources: MessageSource[],
) {
  const merged = [...persistedSources]

  for (const nextSource of liveSources) {
    const existingIndex = merged.findIndex(
      (source) => source.url === nextSource.url || source.id === nextSource.id,
    )

    if (existingIndex === -1) {
      merged.push(nextSource)
      continue
    }

    const existingSource = merged[existingIndex]!
    merged[existingIndex] = {
      ...existingSource,
      ...nextSource,
      title: nextSource.title || existingSource.title,
      snippet:
        nextSource.snippet &&
        nextSource.snippet.length >= (existingSource.snippet?.length ?? 0)
          ? nextSource.snippet
          : existingSource.snippet,
      hostname: nextSource.hostname || existingSource.hostname,
    }
  }

  return merged
}

function mergeLiveAttachments(
  persistedAttachments: MessageAttachment[],
  liveAttachments: MessageAttachment[],
) {
  const merged = [...persistedAttachments]

  for (const nextAttachment of liveAttachments) {
    const existingIndex = merged.findIndex(
      (attachment) => attachment.storageId === nextAttachment.storageId,
    )

    if (existingIndex === -1) {
      merged.push(nextAttachment)
      continue
    }

    const existingAttachment = merged[existingIndex]!
    merged[existingIndex] = {
      ...existingAttachment,
      ...nextAttachment,
      url: nextAttachment.url ?? existingAttachment.url,
    }
  }

  return merged
}

function EmptyState({ colors }: { colors: ReturnType<typeof useColors> }) {
  return (
    <View className='flex-1 items-center justify-center px-6'>
      <View
        className='w-12 h-12 rounded-xl items-center justify-center mb-4'
        style={{ backgroundColor: `${colors.primary}1A` }}
      >
        <Ionicons name='sparkles' size={24} color={colors.primary} />
      </View>
      <Text
        className='text-lg font-semibold tracking-tight'
        style={{ color: colors.foreground }}
      >
        Start a conversation
      </Text>
      <Text
        className='text-sm mt-1.5 text-center leading-relaxed'
        style={{ color: colors.mutedForeground }}
      >
        Ask anything. Write code. Analyze data. Get creative.
      </Text>
    </View>
  )
}

export default function ChatScreen() {
  const { threadId } = useLocalSearchParams<{ threadId: string }>()
  const colors = useColors()
  const insets = useSafeAreaInsets()
  const { toast } = useToast()
  const { model, setModel } = useSelectedModel()
  const listRef = useRef<FlashListRef<ChatMessage>>(null)
  const activeStreamRef = useRef<{
    streamId: string
    abort: () => void
  } | null>(null)
  const forceStopTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const startedStreamIdsRef = useRef<Set<string>>(new Set())
  const attachmentProgressRef = useRef<Record<string, number>>({})
  const hasHandledMissingThreadRef = useRef(false)
  const isNearBottomRef = useRef(true)
  const [inputValue, setInputValue] = useState('')
  const [attachments, setAttachments] = useState<PickedDocument[]>([])
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [uploadProgress, setUploadProgress] = useState<number | null>(null)
  const [sendError, setSendError] = useState<string | null>(null)
  const [showScrollToBottom, setShowScrollToBottom] = useState(false)
  const [allowAutoScroll, setAllowAutoScroll] = useState(true)
  const [footerHeight, setFooterHeight] = useState(0)
  const [appState, setAppState] = useState<AppStateStatus>(AppState.currentState)
  const [liveStreamState, setLiveStreamState] = useState<LiveStreamState | null>(
    null,
  )
  const createMessage = useMutation(api.messages.create)
  const editMessage = useMutation(api.messages.edit)
  const createAssistantReply = useMutation(api.messages.createAssistantReply)
  const generateAttachmentUploadUrl = useMutation(
    api.messages.generateAttachmentUploadUrl,
  )
  const abortAssistantReply = useMutation(api.messages.abortAssistantReply)
  const forceStopAssistantReply = useMutation(api.messages.forceStopAssistantReply)
  const thread = useQuery(
    api.threads.get,
    threadId ? { threadId: threadId as Id<'threads'> } : 'skip',
  )

  const rawMessages = useQuery(
    api.messages.listByThread,
    threadId && thread
      ? { threadId: threadId as Id<'threads'> }
      : 'skip',
  )

  const messages: ChatMessage[] = useMemo(
    () => (rawMessages ?? []).map(toNativeChatMessage),
    [rawMessages],
  )
  const displayedMessages: ChatMessage[] = useMemo(
    () =>
      messages.map((message) => {
        if (!liveStreamState || message.streamId !== liveStreamState.streamId) {
          return message
        }

        if (
          message.streamStatus === 'done' ||
          message.streamStatus === 'error' ||
          message.streamStatus === 'timeout'
        ) {
          return message
        }

        const hasLiveContent =
          liveStreamState.text.length > 0 ||
          liveStreamState.reasoningText.length > 0 ||
          liveStreamState.sources.length > 0 ||
          liveStreamState.attachments.length > 0

        return {
          ...message,
          content:
            liveStreamState.text.length >= message.content.length
              ? liveStreamState.text
              : message.content,
          reasoningText:
            liveStreamState.reasoningText.length >=
            (message.reasoningText?.length ?? 0)
              ? liveStreamState.reasoningText
              : message.reasoningText,
          sources: mergeLiveSources(
            message.sources ?? [],
            liveStreamState.sources,
          ),
          attachments: mergeLiveAttachments(
            message.attachments ?? [],
            liveStreamState.attachments,
          ),
          streamStatus:
            liveStreamState.status === 'error'
              ? 'error'
              : hasLiveContent || message.streamStatus === 'streaming'
                ? 'streaming'
                : 'pending',
          errorMessage: liveStreamState.errorMessage ?? message.errorMessage,
        }
      }),
    [liveStreamState, messages],
  )

  const isLoading =
    Boolean(threadId) && (thread === undefined || (thread && rawMessages === undefined))
  const activeAssistantMessage = useMemo(
    () =>
      [...displayedMessages]
        .reverse()
        .find(
          (message) =>
            message.role === 'system' &&
            message.streamId &&
            (message.streamStatus === 'pending' ||
              message.streamStatus === 'streaming'),
        ),
    [displayedMessages],
  )

  useEffect(() => {
    if (sendError && (inputValue.trim().length > 0 || attachments.length > 0)) {
      setSendError(null)
    }
  }, [attachments.length, inputValue, sendError])

  useEffect(() => {
    const subscription = AppState.addEventListener('change', setAppState)
    return () => {
      subscription.remove()
    }
  }, [])

  useEffect(() => {
    if (thread !== null) {
      hasHandledMissingThreadRef.current = false
      return
    }

    if (hasHandledMissingThreadRef.current) {
      return
    }

    hasHandledMissingThreadRef.current = true
    activeStreamRef.current?.abort()
    setLiveStreamState(null)
    setAttachments([])
    setInputValue('')
    setSendError(null)
    setUploadProgress(null)
    attachmentProgressRef.current = {}

    toast.show({
      variant: 'danger',
      label: 'That thread was deleted.',
      duration: TOAST_DURATION_MS,
    })
    router.replace('/(drawer)')
  }, [thread, toast])

  useEffect(() => {
    if (appState === 'active') {
      return
    }

    if (forceStopTimeoutRef.current) {
      clearTimeout(forceStopTimeoutRef.current)
      forceStopTimeoutRef.current = null
    }
    if (activeStreamRef.current?.streamId) {
      startedStreamIdsRef.current.delete(activeStreamRef.current.streamId)
    }
    activeStreamRef.current?.abort()
    activeStreamRef.current = null
    setLiveStreamState(null)
  }, [appState])

  const scrollToBottom = useCallback((animated: boolean) => {
    listRef.current?.scrollToEnd({ animated })
    isNearBottomRef.current = true
    setShowScrollToBottom(false)
  }, [])

  const handleListScroll = useCallback(
    (event: NativeSyntheticEvent<NativeScrollEvent>) => {
      const { contentOffset, contentSize, layoutMeasurement } = event.nativeEvent
      const distanceFromBottom =
        contentSize.height - (contentOffset.y + layoutMeasurement.height)
      const isNearBottom = distanceFromBottom <= AUTO_SCROLL_THRESHOLD

      isNearBottomRef.current = isNearBottom
      setShowScrollToBottom(!isNearBottom && displayedMessages.length > 0)
    },
    [displayedMessages.length],
  )

  const handleScrollBeginDrag = useCallback(() => {
    setAllowAutoScroll(false)
  }, [])

  const handleScrollEnd = useCallback(
    (event: NativeSyntheticEvent<NativeScrollEvent>) => {
      const { contentOffset, contentSize, layoutMeasurement } = event.nativeEvent
      const distanceFromBottom =
        contentSize.height - (contentOffset.y + layoutMeasurement.height)
      const isNearBottom = distanceFromBottom <= AUTO_SCROLL_THRESHOLD

      setAllowAutoScroll(isNearBottom)
    },
    [],
  )

  useEffect(() => {
    if (
      appState !== 'active' ||
      !activeAssistantMessage?.streamId ||
      activeAssistantMessage.streamStatus !== 'pending' ||
      startedStreamIdsRef.current.has(activeAssistantMessage.streamId)
    ) {
      return
    }

    startedStreamIdsRef.current.add(activeAssistantMessage.streamId)
    setLiveStreamState({
      streamId: activeAssistantMessage.streamId,
      text: '',
      reasoningText: '',
      sources: [],
      attachments: [],
      status: 'pending',
    })

    const streamHandle = startPersistentMessageStream(
      activeAssistantMessage.streamId,
      {
        onTextDelta(text) {
          setLiveStreamState((current) => {
            if (!current || current.streamId !== activeAssistantMessage.streamId) {
              return current
            }

            return {
              ...current,
              text: current.text + text,
              status: 'streaming',
            }
          })
        },
        onReasoningDelta(text) {
          setLiveStreamState((current) => {
            if (!current || current.streamId !== activeAssistantMessage.streamId) {
              return current
            }

            return {
              ...current,
              reasoningText: current.reasoningText + text,
              status: 'streaming',
            }
          })
        },
        onSource(source) {
          setLiveStreamState((current) => {
            if (!current || current.streamId !== activeAssistantMessage.streamId) {
              return current
            }

            return {
              ...current,
              sources: mergeLiveSources(current.sources, [source]),
              status: 'streaming',
            }
          })
        },
        onAttachment(attachment) {
          setLiveStreamState((current) => {
            if (!current || current.streamId !== activeAssistantMessage.streamId) {
              return current
            }

            return {
              ...current,
              attachments: mergeLiveAttachments(current.attachments, [attachment]),
              status: 'streaming',
            }
          })
        },
      },
    )
    activeStreamRef.current = {
      streamId: activeAssistantMessage.streamId,
      abort: streamHandle.abort,
    }

    void streamHandle.finished.then((result: PersistentMessageStreamResult) => {
      if (result.ok) {
        return
      }

      if (result.errorMessage === 'Stopped generating.') {
        setLiveStreamState((current) =>
          current?.streamId === activeAssistantMessage.streamId ? null : current,
        )
        return
      }

      setLiveStreamState((current) => {
        if (!current || current.streamId !== activeAssistantMessage.streamId) {
          return current
        }

        return {
          ...current,
          status: 'error',
          errorMessage:
            result.errorMessage ?? 'Failed to stream response.',
        }
      })

      toast.show({
        variant: 'danger',
        label: result.errorMessage ?? 'Failed to stream response.',
        duration: TOAST_DURATION_MS,
      })
    }).finally(() => {
      if (activeStreamRef.current?.streamId === activeAssistantMessage.streamId) {
        activeStreamRef.current = null
      }
    })
  }, [
    activeAssistantMessage?.streamId,
    activeAssistantMessage?.streamStatus,
    appState,
    toast,
  ])

  useEffect(() => {
    if (!liveStreamState) {
      return
    }

    const persistedMessage = messages.find(
      (message) => message.streamId === liveStreamState.streamId,
    )

    if (
      persistedMessage?.streamStatus === 'done' ||
      persistedMessage?.streamStatus === 'error' ||
      persistedMessage?.streamStatus === 'timeout'
    ) {
      setLiveStreamState(null)
    }
  }, [liveStreamState, messages])

  useEffect(() => {
    if (forceStopTimeoutRef.current && !activeAssistantMessage?.streamId) {
      clearTimeout(forceStopTimeoutRef.current)
      forceStopTimeoutRef.current = null
    }
  }, [activeAssistantMessage?.streamId])

  useEffect(() => {
    return () => {
      if (forceStopTimeoutRef.current) {
        clearTimeout(forceStopTimeoutRef.current)
        forceStopTimeoutRef.current = null
      }
      activeStreamRef.current?.abort()
    }
  }, [])

  const handleSend = useCallback(
    async (
      message: string,
      options?: {
        webSearchEnabled?: boolean
        webSearchMaxResults?: number
      },
    ) => {
      if (!threadId || isSubmitting || activeAssistantMessage) {
        return
      }

      const apiKey = await getStoredOpenRouterApiKey()
      if (!apiKey) {
        const message = 'Add your OpenRouter API key in Settings > API Keys.'
        setSendError(message)
        void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error)
        toast.show({
          variant: 'danger',
          label: message,
          duration: TOAST_DURATION_MS,
        })
        return
      }

      if (attachments.length > 0 && !modelCanAcceptAttachments(model)) {
        const message = 'This model does not support attachments.'
        setSendError(message)
        void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error)
        toast.show({
          variant: 'danger',
          label: message,
          duration: TOAST_DURATION_MS,
        })
        return
      }

      setSendError(null)
      setIsSubmitting(true)
      attachmentProgressRef.current = Object.fromEntries(
        attachments.map((attachment) => [attachment.uri, 0]),
      )
      setUploadProgress(attachments.length > 0 ? 0 : null)

      try {
        const uploadedAttachments = await uploadPickedDocuments(
          attachments,
          generateAttachmentUploadUrl,
          {
            onUploadProgress: (attachmentUri, progress) => {
              attachmentProgressRef.current[attachmentUri] = progress
              const values = Object.values(attachmentProgressRef.current)

              if (values.length === 0) {
                setUploadProgress(null)
                return
              }

              const averageProgress =
                values.reduce((sum, value) => sum + value, 0) / values.length
              setUploadProgress(Math.round(averageProgress))
            },
          },
        )

        const createdUserMessage = await createMessage({
          threadId: threadId as Id<'threads'>,
          role: 'user',
          content: message,
          attachments: uploadedAttachments.map((attachment) => ({
            kind: attachment.kind,
            storageId: attachment.storageId,
            fileName: attachment.fileName,
            contentType: attachment.contentType,
            size: attachment.size,
          })),
          modelId: model.id,
        })

        setInputValue('')
        setAttachments([])

        const createdAssistantReply = await createAssistantReply({
          threadId: threadId as Id<'threads'>,
          userMessageId: createdUserMessage._id,
          userMessageUpdatedAt:
            createdUserMessage.updatedAt ?? createdUserMessage.createdAt,
          modelId: model.id,
          webSearchEnabled: options?.webSearchEnabled,
          webSearchMaxResults: options?.webSearchMaxResults,
        })

        if (!createdAssistantReply) {
          throw new Error('Could not start assistant reply.')
        }
      } catch (error) {
        const message =
          error instanceof Error ? error.message : 'Failed to send message.'
        setSendError(message)
        void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error)
        toast.show({
          variant: 'danger',
          label: message,
          duration: TOAST_DURATION_MS,
        })
      } finally {
        setIsSubmitting(false)
        setUploadProgress(null)
        attachmentProgressRef.current = {}
      }
    },
    [
      activeAssistantMessage,
      attachments,
      createAssistantReply,
      createMessage,
      generateAttachmentUploadUrl,
      isSubmitting,
      model,
      threadId,
      toast,
    ],
  )

  const restartFromUserMessage = useCallback(
    async ({
      message,
      content,
      nextModelId,
    }: {
      message: ChatMessage
      content: string
      nextModelId: string
    }) => {
      if (!threadId || isSubmitting || activeAssistantMessage) {
        return
      }

      const apiKey = await getStoredOpenRouterApiKey()
      if (!apiKey) {
        const errorMessage = 'Add your OpenRouter API key in Settings > API Keys.'
        setSendError(errorMessage)
        void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error)
        toast.show({
          variant: 'danger',
          label: errorMessage,
          duration: TOAST_DURATION_MS,
        })
        return
      }

      const nextModel = getModelById(nextModelId) ?? model

      setSendError(null)
      setIsSubmitting(true)

      try {
        const editResult = await editMessage({
          threadId: threadId as Id<'threads'>,
          messageId: message.id as Id<'messages'>,
          content,
          modelId: nextModel.id,
          attachments: (message.attachments ?? []).map((attachment) => ({
            kind: attachment.kind as 'image' | 'file',
            storageId: attachment.storageId as Id<'_storage'>,
            fileName: attachment.fileName,
            contentType: attachment.contentType,
            size: attachment.size,
          })),
        })

        setModel(nextModel)

        const createdAssistantReply = await createAssistantReply({
          threadId: threadId as Id<'threads'>,
          userMessageId: editResult.updatedMessage._id,
          userMessageUpdatedAt:
            editResult.updatedMessage.updatedAt ??
            editResult.updatedMessage.createdAt,
          modelId: nextModel.id,
        })

        if (!createdAssistantReply) {
          throw new Error('Could not start assistant reply.')
        }
      } catch (error) {
        const errorMessage =
          error instanceof Error ? error.message : 'Failed to restart message.'
        setSendError(errorMessage)
        void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error)
        toast.show({
          variant: 'danger',
          label: errorMessage,
          duration: TOAST_DURATION_MS,
        })
        throw error
      } finally {
        setIsSubmitting(false)
      }
    },
    [
      activeAssistantMessage,
      createAssistantReply,
      editMessage,
      isSubmitting,
      model,
      setModel,
      threadId,
      toast,
    ],
  )

  const handleRetryMessage = useCallback(
    async (message: ChatMessage, overrideModelId?: string) => {
      const retryModelId = overrideModelId ?? message.modelId ?? model.id
      const messageIndex = messages.findIndex(
        (threadMessage) => threadMessage.id === message.id,
      )
      const sourceMessage =
        message.role === 'user'
          ? message
          : messageIndex >= 0
            ? [...messages.slice(0, messageIndex)]
                .reverse()
                .find((threadMessage) => threadMessage.role === 'user')
            : undefined

      if (!sourceMessage) {
        return
      }

      await restartFromUserMessage({
        message: sourceMessage,
        content: sourceMessage.content,
        nextModelId: retryModelId,
      })
    },
    [messages, model.id, restartFromUserMessage],
  )

  const handleEditMessage = useCallback(
    async (message: ChatMessage, nextValue: string, nextModelId: string) => {
      await restartFromUserMessage({
        message,
        content: nextValue,
        nextModelId,
      })
    },
    [restartFromUserMessage],
  )

  const handleAbort = useCallback(() => {
    if (!activeAssistantMessage?.streamId) {
      return
    }

    const streamId = activeAssistantMessage.streamId
    const hasLocalDriver = activeStreamRef.current?.streamId === streamId

    activeStreamRef.current?.abort()
    setLiveStreamState((current) =>
      current?.streamId === streamId ? null : current,
    )
    if (forceStopTimeoutRef.current) {
      clearTimeout(forceStopTimeoutRef.current)
    }

    void abortAssistantReply({ streamId }).finally(() => {
      forceStopTimeoutRef.current = setTimeout(() => {
        void forceStopAssistantReply({ streamId }).finally(() => {
          if (forceStopTimeoutRef.current) {
            clearTimeout(forceStopTimeoutRef.current)
            forceStopTimeoutRef.current = null
          }
        })
      }, hasLocalDriver ? 1500 : 0)
    })
  }, [
    abortAssistantReply,
    activeAssistantMessage?.streamId,
    forceStopAssistantReply,
  ])

  const renderMessage = useCallback(
    ({ item }: { item: ChatMessage }) => (
      <MessageBubble
        message={item}
        onRetry={
          !isSubmitting && !activeAssistantMessage
            ? (message, modelId) => {
                void handleRetryMessage(message, modelId)
              }
            : undefined
        }
        onSaveEdit={
          item.role === 'user' && !isSubmitting && !activeAssistantMessage
            ? async (message, nextValue, nextModelId) => {
                await handleEditMessage(message, nextValue, nextModelId)
              }
            : undefined
        }
      />
    ),
    [activeAssistantMessage, handleEditMessage, handleRetryMessage, isSubmitting],
  )

  const keyExtractor = useCallback((item: ChatMessage) => item.id, [])

  return (
    <KeyboardAvoidingView
      className='flex-1'
      behavior='padding'
      keyboardVerticalOffset={90}
      style={{ backgroundColor: colors.background }}
    >
      {isLoading ? (
        <View className='flex-1 items-center justify-center'>
          <ActivityIndicator size='small' color={colors.primary} />
        </View>
      ) : displayedMessages.length === 0 ? (
        <EmptyState colors={colors} />
      ) : (
        <FlashList
          ref={listRef}
          data={displayedMessages}
          renderItem={renderMessage}
          keyExtractor={keyExtractor}
          maintainVisibleContentPosition={{
            disabled: !allowAutoScroll,
            startRenderingFromBottom: true,
            autoscrollToBottomThreshold: allowAutoScroll ? 0.2 : undefined,
            animateAutoScrollToBottom: true,
          }}
          onScroll={handleListScroll}
          onScrollBeginDrag={handleScrollBeginDrag}
          onScrollEndDrag={handleScrollEnd}
          onMomentumScrollEnd={handleScrollEnd}
          scrollEventThrottle={16}
          contentContainerStyle={{
            paddingTop: 8,
            paddingBottom: 8,
          }}
          keyboardShouldPersistTaps='handled'
          keyboardDismissMode='interactive'
        />
      )}

      {showScrollToBottom ? (
        <Pressable
          onPress={() => scrollToBottom(true)}
          className='absolute self-center items-center justify-center'
          hitSlop={8}
          style={({ pressed }) => ({
            bottom: footerHeight + 12,
            opacity: pressed ? 0.92 : 1,
            zIndex: 20,
          })}
        >
          <View
            className='w-10 h-10 rounded-full items-center justify-center'
            style={{
              backgroundColor: `${colors.card}F2`,
              borderWidth: 1,
              borderColor: `${colors.border}99`,
            }}
          >
            <Ionicons
              name='arrow-down'
              size={16}
              color={colors.foreground}
            />
          </View>
        </Pressable>
      ) : null}

      <View
        onLayout={(event) => {
          setFooterHeight(event.nativeEvent.layout.height)
        }}
        style={{ paddingBottom: Math.max(insets.bottom, 12) + 8 }}
      >
        {sendError ? (
          <View
            className='mx-3 mb-2 flex-row items-center gap-2 rounded-xl px-3 py-2.5'
            style={{
              backgroundColor: `${colors.destructive}14`,
              borderWidth: 1,
              borderColor: `${colors.destructive}33`,
            }}
          >
            <Ionicons
              name='alert-circle-outline'
              size={14}
              color={colors.destructive}
            />
            <Text
              className='flex-1 text-[11px] font-medium'
              style={{ color: colors.destructive }}
            >
              {sendError}
            </Text>
          </View>
        ) : null}
        <ChatInput
          value={inputValue}
          onValueChange={setInputValue}
          attachments={attachments}
          onAttachmentsChange={setAttachments}
          onSend={(message, options) => {
            void handleSend(message, options)
          }}
          onAbort={handleAbort}
          isStreaming={Boolean(activeAssistantMessage)}
          isSending={isSubmitting}
          uploadProgress={uploadProgress}
          disabled={isSubmitting}
          canAttach={modelCanAcceptAttachments(model)}
        />
      </View>
    </KeyboardAvoidingView>
  )
}
