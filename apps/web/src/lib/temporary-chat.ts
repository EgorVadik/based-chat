import type { Id } from '@based-chat/backend/convex/_generated/dataModel'
import { env } from '@based-chat/env/web'

import type { MessageAttachment } from '@/lib/attachments'
import { getStoredOpenRouterApiKey } from '@/lib/api-key-storage'
import { authClient } from '@/lib/auth-client'
import type { ChatMessage, MessageGenerationStats } from '@/lib/chat'
import { getModelById } from '@/lib/models'
import type { ThreadSummary } from '@/lib/threads'

const TEMPORARY_CHAT_STORAGE_KEY = 'based-chat:temporary-chat'

export const TEMPORARY_CHAT_ROUTE = '/temporary-chat' as const
export const TEMPORARY_CHAT_THREAD_ID = 'temporary-chat' as Id<'threads'>

export type TemporaryChatThread = ThreadSummary & {
  _id: typeof TEMPORARY_CHAT_THREAD_ID
  isTemporary: true
}

export type TemporaryChatState = {
  thread: TemporaryChatThread
  messages: ChatMessage[]
}

type SerializedTemporaryChatState = {
  thread?: ThreadSummary
  messages?: ChatMessage[]
}

type TemporaryStreamEvent =
  | {
      type: 'text-delta'
      text: string
    }
  | {
      type: 'reasoning-delta'
      text: string
    }
  | {
      type: 'finish'
      generationStats?: MessageGenerationStats
    }
  | {
      type: 'error'
      errorMessage: string
    }

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
    title: 'New chat',
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
    threadId: TEMPORARY_CHAT_THREAD_ID,
    model: message.modelId ? getModelById(message.modelId) : message.model,
    streamStatus: interruptedStream ? 'error' : message.streamStatus,
    errorMessage:
      interruptedStream
        ? message.errorMessage ?? 'Temporary chat stopped when the session changed.'
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

export function loadTemporaryChatState(): TemporaryChatState {
  if (typeof window === 'undefined') {
    return createEmptyTemporaryChatState()
  }

  try {
    const rawState = window.sessionStorage.getItem(TEMPORARY_CHAT_STORAGE_KEY)
    if (!rawState) {
      return createEmptyTemporaryChatState()
    }

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
        title: 'New chat',
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

export function persistTemporaryChatState(state: TemporaryChatState) {
  if (typeof window === 'undefined') {
    return
  }

  window.sessionStorage.setItem(
    TEMPORARY_CHAT_STORAGE_KEY,
    JSON.stringify({
      thread: {
        ...state.thread,
        isTemporary: undefined,
      },
      messages: state.messages.map(({ model, ...message }) => message),
    }),
  )
}

export function resetTemporaryChatState(): TemporaryChatState {
  const nextState = createEmptyTemporaryChatState()
  persistTemporaryChatState(nextState)
  return nextState
}

export function createTemporaryMessageId() {
  return `temp-message-${crypto.randomUUID()}`
}

export function isTemporaryThreadId(
  threadId: string | null | undefined,
): threadId is typeof TEMPORARY_CHAT_THREAD_ID {
  return threadId === TEMPORARY_CHAT_THREAD_ID
}

export function getTemporaryChatStreamUrl() {
  return new URL('/messages/temp-stream', env.VITE_CONVEX_SITE_URL)
}

export function startTemporaryChatStream({
  url,
  modelId,
  messages,
  onTextDelta,
  onReasoningDelta,
  onFinish,
  onError,
}: {
  url: URL
  modelId: string
  messages: TemporaryStreamMessage[]
  onTextDelta: (text: string) => void
  onReasoningDelta: (text: string) => void
  onFinish?: (generationStats?: MessageGenerationStats) => void
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
      const apiKey = getStoredOpenRouterApiKey()
      response = await fetch(url, {
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
        }),
      })
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
        // Ignore response parsing errors and keep the fallback message.
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
