import { api } from '@based-chat/backend/convex/_generated/api'
import type { Id } from '@based-chat/backend/convex/_generated/dataModel'
import { Ionicons } from '@expo/vector-icons'
import { FlashList, type FlashListRef } from '@shopify/flash-list'
import { useAction, useMutation } from 'convex/react'
import * as Haptics from 'expo-haptics'
import { router } from 'expo-router'
import { useToast } from 'heroui-native'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import {
  ActivityIndicator,
  type NativeScrollEvent,
  type NativeSyntheticEvent,
  Pressable,
  Text,
  View,
} from 'react-native'
import { KeyboardAvoidingView } from 'react-native-keyboard-controller'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { useMMKVString } from 'react-native-mmkv'

import ChatInput, { type PickedDocument } from '@/components/chat/chat-input'
import MessageBubble, {
  type ChatMessage,
  type MessageAttachment,
  type MessageSource,
} from '@/components/chat/message-bubble'
import { appStorage } from '@/lib/mmkv'
import { getStoredOpenRouterApiKey } from '@/lib/api-keys'
import { uploadPickedDocuments } from '@/lib/chat-runtime'
import { getModelById, modelCanAcceptAttachments, type Model } from '@/lib/models'
import { useSelectedModel } from '@/lib/selected-model'
import {
  createTemporaryMessageId,
  loadTemporaryChatState,
  resetTemporaryChatState,
  serializeTemporaryChatState,
  startTemporaryChatStream,
  TEMPORARY_CHAT_STORAGE_KEY,
  toDisplayedTemporaryAttachments,
  type TemporaryChatState,
  type TemporaryStreamMessage,
} from '@/lib/temporary-chat'
import { useColors } from '@/lib/use-colors'

const TOAST_DURATION_MS = 5000
const AUTO_SCROLL_THRESHOLD = 80

type ImportedTemporaryThreadPayload = {
  thread: {
    _id: Id<'threads'>
    title: string
    createdAt: number
    updatedAt: number
  }
  messages: Array<{
    _id: Id<'messages'>
    role: ChatMessage['role']
    createdAt: number
    updatedAt?: number
  }>
}

function mergeLiveSources(
  currentSources: MessageSource[],
  nextSource: MessageSource,
) {
  const existingIndex = currentSources.findIndex(
    (source) => source.url === nextSource.url || source.id === nextSource.id,
  )

  if (existingIndex === -1) {
    return [...currentSources, nextSource]
  }

  const existingSource = currentSources[existingIndex]!
  const mergedSource = {
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

  return currentSources.map((source, index) =>
    index === existingIndex ? mergedSource : source,
  )
}

function EmptyState({ colors }: { colors: ReturnType<typeof useColors> }) {
  return (
    <View className='flex-1 items-center justify-center px-6'>
      <View
        className='w-12 h-12 rounded-xl items-center justify-center mb-4'
        style={{ backgroundColor: `${colors.primary}1A` }}
      >
        <Ionicons name='flash-outline' size={24} color={colors.primary} />
      </View>
      <Text
        className='text-lg font-semibold tracking-tight'
        style={{ color: colors.foreground }}
      >
        Temporary chat
      </Text>
      <Text
        className='text-sm mt-1.5 text-center leading-relaxed'
        style={{ color: colors.mutedForeground }}
      >
        Messages stay on this device until you decide to save them.
      </Text>
    </View>
  )
}

export default function TemporaryChatScreen() {
  const colors = useColors()
  const insets = useSafeAreaInsets()
  const { toast } = useToast()
  const { model, setModel } = useSelectedModel()
  const [storedTemporaryChatState, setStoredTemporaryChatState] = useMMKVString(
    TEMPORARY_CHAT_STORAGE_KEY,
    appStorage,
  )
  const listRef = useRef<FlashListRef<ChatMessage>>(null)
  const streamRef = useRef<ReturnType<typeof startTemporaryChatStream> | null>(
    null,
  )
  const isMountedRef = useRef(true)
  const attachmentProgressRef = useRef<Record<string, number>>({})
  const isNearBottomRef = useRef(true)
  const [temporaryChatState, setTemporaryChatState] = useState<TemporaryChatState>(
    () => loadTemporaryChatState(storedTemporaryChatState),
  )
  const [inputValue, setInputValue] = useState('')
  const [attachments, setAttachments] = useState<PickedDocument[]>([])
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [isSaving, setIsSaving] = useState(false)
  const [uploadProgress, setUploadProgress] = useState<number | null>(null)
  const [sendError, setSendError] = useState<string | null>(null)
  const [showScrollToBottom, setShowScrollToBottom] = useState(false)
  const [allowAutoScroll, setAllowAutoScroll] = useState(true)
  const [footerHeight, setFooterHeight] = useState(0)

  const generateAttachmentUploadUrl = useMutation(
    api.messages.generateAttachmentUploadUrl,
  )
  const importTemporaryThread = useMutation(api.messages.importTemporaryThread)
  const generateThreadTitle = useAction(
    (api.messages as unknown as { generateThreadTitle: any }).generateThreadTitle,
  )

  const messages = temporaryChatState.messages
  const activeAssistantMessage = useMemo(
    () =>
      [...messages]
        .reverse()
        .find(
          (message) =>
            message.role === 'system' &&
            (message.streamStatus === 'pending' ||
              message.streamStatus === 'streaming'),
        ),
    [messages],
  )

  useEffect(() => {
    isMountedRef.current = true
    return () => {
      isMountedRef.current = false
      streamRef.current?.abort()
      streamRef.current = null
    }
  }, [])

  useEffect(() => {
    setStoredTemporaryChatState(serializeTemporaryChatState(temporaryChatState))
  }, [setStoredTemporaryChatState, temporaryChatState])

  useEffect(() => {
    if (sendError && (inputValue.trim().length > 0 || attachments.length > 0)) {
      setSendError(null)
    }
  }, [attachments.length, inputValue, sendError])

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
      setShowScrollToBottom(!isNearBottom && messages.length > 0)
    },
    [messages.length],
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

  const patchTemporaryMessage = useCallback(
    (messageId: string, updater: (message: ChatMessage) => ChatMessage) => {
      if (!isMountedRef.current) {
        return
      }

      setTemporaryChatState((currentState) => {
        const nextMessages = currentState.messages.map((message) =>
          message.id === messageId ? updater(message) : message,
        )

        return {
          thread: {
            ...currentState.thread,
            updatedAt:
              nextMessages.at(-1)?.updatedAt ??
              nextMessages.at(-1)?.createdAt ??
              currentState.thread.updatedAt,
          },
          messages: nextMessages,
        }
      })
    },
    [],
  )

  const clearTemporaryChat = useCallback(() => {
    streamRef.current?.abort()
    streamRef.current = null
    setTemporaryChatState(resetTemporaryChatState())
    setInputValue('')
    setAttachments([])
    setSendError(null)
    setUploadProgress(null)
    attachmentProgressRef.current = {}
  }, [])

  const startTemporaryAssistantReply = useCallback(
    ({
      nextModel,
      conversationMessages,
      webSearchEnabled = false,
      webSearchMaxResults = 1,
    }: {
      nextModel: Model
      conversationMessages: ChatMessage[]
      webSearchEnabled?: boolean
      webSearchMaxResults?: number
    }) => {
      const assistantMessageId = createTemporaryMessageId()
      const now = Date.now()
      const assistantMessage: ChatMessage = {
        id: assistantMessageId,
        role: 'system',
        content: '',
        reasoningText: '',
        sources: [],
        attachments: [],
        modelId: nextModel.id,
        createdAt: now,
        updatedAt: now,
        streamStatus: 'pending',
      }

      setTemporaryChatState((currentState) => ({
        thread: {
          ...currentState.thread,
          updatedAt: now,
        },
        messages: [...currentState.messages, assistantMessage],
      }))

      streamRef.current?.abort()
      const stream = startTemporaryChatStream({
        modelId: nextModel.id,
        webSearchEnabled,
        webSearchMaxResults,
        messages: conversationMessages.map<TemporaryStreamMessage>((message) => ({
          role: message.role,
          content: message.content,
          attachments:
            message.attachments && message.attachments.length > 0
              ? message.attachments.map((attachment) => ({
                  kind: attachment.kind,
                  storageId: attachment.storageId,
                  fileName: attachment.fileName,
                  contentType: attachment.contentType,
                  size: attachment.size,
                }))
              : undefined,
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
            streamStatus:
              message.streamStatus === 'pending'
                ? 'streaming'
                : message.streamStatus,
            updatedAt: Date.now(),
          }))
        },
        onSource: (source) => {
          patchTemporaryMessage(assistantMessageId, (message) => ({
            ...message,
            sources: mergeLiveSources(message.sources ?? [], source),
            streamStatus:
              message.streamStatus === 'pending'
                ? 'streaming'
                : message.streamStatus,
            updatedAt: Date.now(),
          }))
        },
        onAttachment: (attachment) => {
          patchTemporaryMessage(assistantMessageId, (message) => {
            if (
              (message.attachments ?? []).some(
                (entry) => entry.storageId === attachment.storageId,
              )
            ) {
              return message
            }

            return {
              ...message,
              attachments: [...(message.attachments ?? []), attachment],
              streamStatus:
                message.streamStatus === 'pending'
                  ? 'streaming'
                  : message.streamStatus,
              updatedAt: Date.now(),
            }
          })
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

      streamRef.current = stream
      void stream.finished.finally(() => {
        if (streamRef.current === stream) {
          streamRef.current = null
        }
      })
    },
    [patchTemporaryMessage],
  )

  const handleSend = useCallback(
    async (
      message: string,
      options?: {
        webSearchEnabled?: boolean
        webSearchMaxResults?: number
      },
    ) => {
      if (isSubmitting || activeAssistantMessage) {
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

      if (attachments.length > 0 && !modelCanAcceptAttachments(model)) {
        const errorMessage = 'This model does not support attachments.'
        setSendError(errorMessage)
        void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error)
        toast.show({
          variant: 'danger',
          label: errorMessage,
          duration: TOAST_DURATION_MS,
        })
        return
      }

      const trimmedMessage = message.trim()
      if (!trimmedMessage && attachments.length === 0) {
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

        const displayedAttachments = toDisplayedTemporaryAttachments(
          uploadedAttachments,
          attachments,
        )
        const createdAt = Date.now()
        const userMessage: ChatMessage = {
          id: createTemporaryMessageId(),
          role: 'user',
          content: trimmedMessage,
          sources: [],
          attachments: displayedAttachments,
          modelId: model.id,
          createdAt,
          updatedAt: createdAt,
        }
        const nextMessages = [...messages, userMessage]

        setTemporaryChatState((currentState) => ({
          thread: {
            ...currentState.thread,
            updatedAt: createdAt,
          },
          messages: nextMessages,
        }))
        setInputValue('')
        setAttachments([])

        startTemporaryAssistantReply({
          nextModel: model,
          conversationMessages: nextMessages,
          webSearchEnabled: options?.webSearchEnabled,
          webSearchMaxResults: options?.webSearchMaxResults,
        })
      } catch (error) {
        const errorMessage =
          error instanceof Error ? error.message : 'Failed to send message.'
        setSendError(errorMessage)
        void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error)
        toast.show({
          variant: 'danger',
          label: errorMessage,
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
      generateAttachmentUploadUrl,
      isSubmitting,
      messages,
      model,
      startTemporaryAssistantReply,
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
      if (isSubmitting || activeAssistantMessage) {
        return
      }

      const apiKey = await getStoredOpenRouterApiKey()
      if (!apiKey) {
        const errorMessage = 'Add your OpenRouter API key in Settings > API Keys.'
        setSendError(errorMessage)
        toast.show({
          variant: 'danger',
          label: errorMessage,
          duration: TOAST_DURATION_MS,
        })
        return
      }

      const nextModel = getModelById(nextModelId) ?? model
      const trimmedContent = content.trim()
      const targetIndex = messages.findIndex(
        (threadMessage) => threadMessage.id === message.id,
      )

      if (targetIndex === -1) {
        return
      }

      const updatedAt = Date.now()
      const nextMessages = messages
        .slice(0, targetIndex + 1)
        .map((threadMessage) =>
          threadMessage.id === message.id
            ? {
                ...threadMessage,
                content: trimmedContent,
                modelId: nextModel.id,
                updatedAt,
              }
            : threadMessage,
        )

      setModel(nextModel)
      setTemporaryChatState((currentState) => ({
        thread: {
          ...currentState.thread,
          updatedAt,
        },
        messages: nextMessages,
      }))
      startTemporaryAssistantReply({
        nextModel,
        conversationMessages: nextMessages,
      })
    },
    [
      activeAssistantMessage,
      isSubmitting,
      messages,
      model,
      setModel,
      startTemporaryAssistantReply,
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
    streamRef.current?.abort()
  }, [])

  const handleSaveToHistory = useCallback(async () => {
    if (messages.length === 0 || activeAssistantMessage || isSaving) {
      return
    }

    setIsSaving(true)

    try {
      const importResult = (await importTemporaryThread({
        messages: messages.map((message) => ({
          role: message.role,
          modelId: message.modelId ?? model.id,
          content: message.content,
          reasoningText: message.reasoningText,
          sources:
            message.sources && message.sources.length > 0
              ? message.sources
              : undefined,
          attachments:
            message.attachments && message.attachments.length > 0
              ? message.attachments.map((attachment) => ({
                  kind: attachment.kind as 'image' | 'file',
                  storageId: attachment.storageId as Id<'_storage'>,
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

      const firstImportedUserMessage = importResult.messages.find(
        (message) => message.role === 'user',
      )
      const apiKey = await getStoredOpenRouterApiKey()
      if (firstImportedUserMessage && apiKey) {
        void generateThreadTitle({
          threadId: importResult.thread._id,
          messageId: firstImportedUserMessage._id,
          apiKey,
        })
      }

      clearTemporaryChat()
      toast.show({
        variant: 'success',
        label: 'Temporary chat saved to history.',
        duration: TOAST_DURATION_MS,
      })
      router.replace({
        pathname: '/(drawer)/chat/[threadId]',
        params: { threadId: importResult.thread._id },
      })
    } catch (error) {
      toast.show({
        variant: 'danger',
        label:
          error instanceof Error
            ? error.message
            : 'Failed to save temporary chat.',
        duration: TOAST_DURATION_MS,
      })
    } finally {
      setIsSaving(false)
    }
  }, [
    activeAssistantMessage,
    clearTemporaryChat,
    generateThreadTitle,
    importTemporaryThread,
    isSaving,
    messages,
    model.id,
    toast,
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
          !isSubmitting && !activeAssistantMessage
            ? (message, nextValue, nextModelId) =>
                handleEditMessage(message, nextValue, nextModelId)
            : undefined
        }
      />
    ),
    [
      activeAssistantMessage,
      handleEditMessage,
      handleRetryMessage,
      isSubmitting,
    ],
  )

  const keyExtractor = useCallback((item: ChatMessage) => item.id, [])

  return (
    <KeyboardAvoidingView
      className='flex-1'
      behavior='padding'
      keyboardVerticalOffset={90}
      style={{ backgroundColor: colors.background }}
    >
      {messages.length === 0 ? (
        <EmptyState colors={colors} />
      ) : (
        <FlashList
          ref={listRef}
          data={messages}
          renderItem={renderMessage}
          keyExtractor={keyExtractor}
          maintainVisibleContentPosition={{
            disabled: !allowAutoScroll,
            startRenderingFromBottom: true,
            autoscrollToBottomThreshold:
              allowAutoScroll && !activeAssistantMessage ? 0.2 : undefined,
            animateAutoScrollToBottom:
              allowAutoScroll && !activeAssistantMessage,
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
        <View
          className='mx-3 mb-2 flex-row items-center gap-2 rounded-xl px-3 py-2.5'
          style={{
            backgroundColor: `${colors.primary}12`,
            borderWidth: 1,
            borderColor: `${colors.primary}26`,
          }}
        >
          <Ionicons name='flash-outline' size={14} color={colors.primary} />
          <Text
            className='flex-1 text-[11px] font-medium'
            style={{ color: colors.foreground }}
          >
            Temporary chat stays local until you save it.
          </Text>
          <View className='flex-row items-center gap-2'>
            <Text
              onPress={() => clearTemporaryChat()}
              style={{ color: colors.mutedForeground, fontSize: 11 }}
            >
              Clear
            </Text>
            <Text
              onPress={() => {
                void handleSaveToHistory()
              }}
              style={{
                color:
                  messages.length === 0 || activeAssistantMessage || isSaving
                    ? `${colors.primary}66`
                    : colors.primary,
                fontSize: 11,
                fontWeight: '600',
              }}
            >
              {isSaving ? 'Saving...' : 'Save'}
            </Text>
          </View>
        </View>

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
