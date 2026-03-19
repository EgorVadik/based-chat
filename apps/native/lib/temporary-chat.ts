import { fetch as expoFetch } from 'expo/fetch'

import type { PickedDocument } from '@/components/chat/chat-input'
import type {
  ChatMessage,
  MessageAttachment,
  MessageSource,
} from '@/components/chat/message-bubble'
import { authClient } from '@/lib/auth-client'
import { getStoredOpenRouterApiKey } from '@/lib/api-keys'

export const TEMPORARY_CHAT_STORAGE_KEY = 'based-chat:temporary-chat'
export const TEMPORARY_CHAT_THREAD_ID = 'temporary-chat' as const
export const TEMPORARY_CHAT_ROUTE = '/(drawer)/temporary-chat' as const

export type TemporaryChatThread = {
  _id: typeof TEMPORARY_CHAT_THREAD_ID
  title: string
  createdAt: number
  updatedAt: number
  isTemporary: true
}

export type TemporaryChatState = {
  thread: TemporaryChatThread
  messages: ChatMessage[]
}

type SerializedTemporaryChatState = {
  thread?: {
    title?: string
    createdAt?: number
    updatedAt?: number
  }
  messages?: ChatMessage[]
}

type TemporaryStreamEvent =
  | { type: 'text-delta'; text: string }
  | { type: 'reasoning-delta'; text: string }
  | { type: 'source'; source: MessageSource }
  | { type: 'attachment'; attachment: MessageAttachment }
  | { type: 'finish'; generationStats?: ChatMessage['generationStats'] }
  | { type: 'error'; errorMessage: string }

export type TemporaryStreamMessage = {
  role: ChatMessage['role']
  content: string
  attachments?: Array<
    Pick<
      MessageAttachment,
      'kind' | 'storageId' | 'fileName' | 'contentType' | 'size'
    >
  >
}

function createTemporaryChatThread(now = Date.now()): TemporaryChatThread {
  return {
    _id: TEMPORARY_CHAT_THREAD_ID,
    title: 'Temporary chat',
    createdAt: now,
    updatedAt: now,
    isTemporary: true,
  }
}

function rehydrateMessage(message: ChatMessage): ChatMessage {
  const interruptedStream =
    message.streamStatus === 'pending' || message.streamStatus === 'streaming'

  return {
    ...message,
    sources: message.sources ?? [],
    attachments: message.attachments ?? [],
    streamStatus: interruptedStream ? 'error' : message.streamStatus,
    errorMessage:
      interruptedStream
        ? message.errorMessage ?? 'Temporary chat stopped when the app session changed.'
        : message.errorMessage,
  }
}

export function createEmptyTemporaryChatState(
  now = Date.now(),
): TemporaryChatState {
  return {
    thread: createTemporaryChatThread(now),
    messages: [],
  }
}

export function loadTemporaryChatState(
  rawState: string | null | undefined,
): TemporaryChatState {
  if (!rawState) {
    return createEmptyTemporaryChatState()
  }

  try {
    const parsedState = JSON.parse(rawState) as SerializedTemporaryChatState
    const messages = Array.isArray(parsedState.messages)
      ? parsedState.messages.map(rehydrateMessage)
      : []
    const latestTimestamp =
      messages.at(-1)?.updatedAt ??
      messages.at(-1)?.createdAt ??
      parsedState.thread?.updatedAt ??
      Date.now()

    return {
      thread: {
        _id: TEMPORARY_CHAT_THREAD_ID,
        title: parsedState.thread?.title || 'Temporary chat',
        createdAt: parsedState.thread?.createdAt ?? latestTimestamp,
        updatedAt: latestTimestamp,
        isTemporary: true,
      },
      messages,
    }
  } catch {
    return createEmptyTemporaryChatState()
  }
}

export function serializeTemporaryChatState(state: TemporaryChatState) {
  return JSON.stringify({
    thread: {
      title: state.thread.title,
      createdAt: state.thread.createdAt,
      updatedAt: state.thread.updatedAt,
    },
    messages: state.messages,
  })
}

export function resetTemporaryChatState() {
  return createEmptyTemporaryChatState()
}

export function createTemporaryMessageId() {
  return `temp-message-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`
}

export function toDisplayedTemporaryAttachments(
  uploadedAttachments: Array<
    Pick<
      MessageAttachment,
      'kind' | 'storageId' | 'fileName' | 'contentType' | 'size'
    >
  >,
  pickedDocuments: PickedDocument[],
) {
  return uploadedAttachments.map((attachment, index) => {
    const pickedDocument = pickedDocuments[index]
    const isImage =
      attachment.kind === 'image' ||
      attachment.contentType.startsWith('image/')

    return {
      ...attachment,
      url: isImage ? pickedDocument?.uri : undefined,
    } satisfies MessageAttachment
  })
}

export function getTemporaryChatMessageCount(
  rawState: string | null | undefined,
) {
  return loadTemporaryChatState(rawState).messages.length
}

export function getTemporaryChatStreamingState(
  rawState: string | null | undefined,
) {
  return loadTemporaryChatState(rawState).messages.some(
    (message) =>
      message.role === 'system' &&
      (message.streamStatus === 'pending' ||
        message.streamStatus === 'streaming'),
  )
}

export function startTemporaryChatStream({
  modelId,
  messages,
  webSearchEnabled = false,
  webSearchMaxResults = 1,
  onTextDelta,
  onReasoningDelta,
  onSource,
  onAttachment,
  onFinish,
  onError,
}: {
  modelId: string
  messages: TemporaryStreamMessage[]
  webSearchEnabled?: boolean
  webSearchMaxResults?: number
  onTextDelta: (text: string) => void
  onReasoningDelta: (text: string) => void
  onSource?: (source: MessageSource) => void
  onAttachment?: (attachment: MessageAttachment) => void
  onFinish?: (generationStats?: ChatMessage['generationStats']) => void
  onError?: (errorMessage: string) => void
}) {
  const abortController = new AbortController()

  const finished = (async () => {
    const tokenResult = await authClient.convex.token({
      fetchOptions: { throw: false },
    })
    const accessToken = tokenResult.data?.token

    if (!accessToken) {
      const errorMessage = 'Could not authenticate the temporary chat request.'
      onError?.(errorMessage)
      throw new Error(errorMessage)
    }

    let response: Response
    try {
      const apiKey = await getStoredOpenRouterApiKey()
      response = await expoFetch(
        new URL(
          '/messages/temp-stream',
          process.env.EXPO_PUBLIC_CONVEX_SITE_URL!,
        ).toString(),
        {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${accessToken}`,
            'Content-Type': 'application/json',
          },
          signal: abortController.signal,
          body: JSON.stringify({
            apiKey: apiKey || undefined,
            modelId,
            messages,
            webSearchEnabled,
            webSearchMaxResults,
          }),
        },
      )
    } catch (error) {
      const errorMessage =
        error instanceof Error
          ? error.name === 'AbortError'
            ? 'Stopped generating.'
            : error.message
          : 'Failed to reach the temporary chat endpoint.'
      onError?.(errorMessage)
      throw new Error(errorMessage)
    }

    if (!response.ok || !response.body) {
      let errorMessage = `Temporary chat failed with ${response.status}.`

      try {
        const responseText = (await response.text()).trim()
        if (responseText) {
          errorMessage = responseText
        }
      } catch {
        // Ignore response parsing failures and keep the fallback error.
      }

      onError?.(errorMessage)
      throw new Error(errorMessage)
    }

    const reader = response.body.getReader()
    const decoder = new TextDecoder()
    let bufferedResponseText = ''
    let streamEventErrorMessage: string | undefined

    const processBufferedResponse = () => {
      const responseLines = bufferedResponseText.split('\n')
      bufferedResponseText = responseLines.pop() ?? ''

      for (const responseLine of responseLines) {
        const trimmedLine = responseLine.trim()
        if (!trimmedLine) {
          continue
        }

        let streamEvent: TemporaryStreamEvent
        try {
          streamEvent = JSON.parse(trimmedLine) as TemporaryStreamEvent
        } catch {
          continue
        }

        if (streamEvent.type === 'text-delta') {
          onTextDelta(streamEvent.text)
          continue
        }

        if (streamEvent.type === 'reasoning-delta') {
          onReasoningDelta(streamEvent.text)
          continue
        }

        if (streamEvent.type === 'source') {
          onSource?.(streamEvent.source)
          continue
        }

        if (streamEvent.type === 'attachment') {
          onAttachment?.(streamEvent.attachment)
          continue
        }

        if (streamEvent.type === 'finish') {
          onFinish?.(streamEvent.generationStats)
          continue
        }

        if (streamEvent.type === 'error') {
          streamEventErrorMessage = streamEvent.errorMessage
          onError?.(streamEvent.errorMessage)
        }
      }
    }

    while (true) {
      try {
        const { done, value } = await reader.read()

        if (value) {
          bufferedResponseText += decoder.decode(value, { stream: !done })
          processBufferedResponse()
        }

        if (done) {
          bufferedResponseText += decoder.decode()
          processBufferedResponse()

          if (streamEventErrorMessage) {
            throw new Error(streamEventErrorMessage)
          }

          return
        }
      } catch (error) {
        const errorMessage =
          error instanceof Error
            ? error.name === 'AbortError'
              ? 'Stopped generating.'
              : error.message
            : 'The temporary chat stream was interrupted.'
        onError?.(errorMessage)
        throw new Error(errorMessage)
      }
    }
  })()

  return {
    abort() {
      abortController.abort()
    },
    finished,
  }
}
