import type { Id } from '@based-chat/backend/convex/_generated/dataModel'
import { File as ExpoFile } from 'expo-file-system'
import {
  createUploadTask,
  FileSystemSessionType,
  FileSystemUploadType,
} from 'expo-file-system/legacy'
import { fetch as expoFetch } from 'expo/fetch'
import { Platform } from 'react-native'

import type { PickedAttachment } from '@/components/chat/chat-input'
import type {
  ChatMessage,
  MessageAttachment,
  MessageSource,
} from '@/components/chat/message-bubble'
import { authClient } from '@/lib/auth-client'
import { getStoredOpenRouterApiKey } from '@/lib/api-keys'
import {
  getAttachmentKind,
  getLocalFileSize,
  isAttachmentTooLarge,
  MAX_ATTACHMENT_SIZE_LABEL,
} from '@/lib/attachments'

export type PersistedAttachment = {
  kind: 'image' | 'file'
  storageId: Id<'_storage'>
  fileName: string
  contentType: string
  size: number
  url: null
}

type StreamEvent =
  | { type: 'text-delta'; text: string }
  | { type: 'reasoning-delta'; text: string }
  | { type: 'source'; source: MessageSource }
  | { type: 'attachment'; attachment: MessageAttachment }
  | { type: 'error'; errorMessage: string }

export type PersistentMessageStreamResult = {
  ok: boolean
  errorMessage?: string
  /**
   * - `aborted`: stopped locally.
   * - `disconnected`: the connection dropped after the server started
   *   generating; the server keeps going, so the persisted status decides.
   * - `request`: the request never produced a stream (auth, network, HTTP error).
   * - `server`: the server reported a generation error.
   */
  failure?: 'aborted' | 'disconnected' | 'request' | 'server'
}

export type PersistentMessageStreamHandlers = {
  onTextDelta?: (text: string) => void
  onReasoningDelta?: (text: string) => void
  onSource?: (source: MessageSource) => void
  onAttachment?: (attachment: MessageAttachment) => void
}

export type AttachmentUploadHandlers = {
  onUploadProgress?: (attachmentUri: string, progress: number) => void
}

export function toNativeChatMessage(message: any): ChatMessage {
  return {
    id: message._id,
    role: message.role,
    content: message.content ?? '',
    reasoningText: message.reasoningText,
    sources: message.sources,
    attachments: message.attachments,
    modelId: message.modelId,
    streamId: message.streamId,
    createdAt: message.createdAt,
    updatedAt: message.updatedAt,
    streamStatus: message.streamStatus,
    errorMessage: message.errorMessage,
    generationStats: message.generationStats,
  }
}

const STREAM_FLUSH_INTERVAL_MS = 50

/**
 * Coalesces streamed text/reasoning deltas so the UI re-renders at most every
 * ~50ms instead of once per token.
 */
export function createStreamDeltaBuffer(
  onFlush: (delta: { text: string; reasoningText: string }) => void,
) {
  let text = ''
  let reasoningText = ''
  let timer: ReturnType<typeof setTimeout> | null = null

  const flush = () => {
    if (timer) {
      clearTimeout(timer)
      timer = null
    }
    if (!text && !reasoningText) {
      return
    }

    const delta = { text, reasoningText }
    text = ''
    reasoningText = ''
    onFlush(delta)
  }

  const schedule = () => {
    if (!timer) {
      timer = setTimeout(flush, STREAM_FLUSH_INTERVAL_MS)
    }
  }

  return {
    pushText(value: string) {
      text += value
      schedule()
    },
    pushReasoning(value: string) {
      reasoningText += value
      schedule()
    },
    flush,
    cancel() {
      if (timer) {
        clearTimeout(timer)
        timer = null
      }
      text = ''
      reasoningText = ''
    },
  }
}

async function uploadAttachmentBody(
  uploadUrl: string,
  attachment: PickedAttachment,
  contentType: string,
  onProgress: (progress: number) => void,
): Promise<{ responseText: string; byteLength: number | null }> {
  // Native file:// URIs stream from disk instead of being buffered in JS.
  if (Platform.OS !== 'web' && attachment.uri.startsWith('file://')) {
    const uploadTask = createUploadTask(
      uploadUrl,
      attachment.uri,
      {
        httpMethod: 'POST',
        uploadType: FileSystemUploadType.BINARY_CONTENT,
        sessionType: FileSystemSessionType.FOREGROUND,
        headers: { 'Content-Type': contentType },
      },
      ({ totalBytesSent, totalBytesExpectedToSend }) => {
        if (totalBytesExpectedToSend > 0) {
          const ratio = totalBytesSent / totalBytesExpectedToSend
          onProgress(Math.min(99, Math.round(ratio * 100)))
        }
      },
    )
    const result = await uploadTask.uploadAsync()
    if (!result || result.status < 200 || result.status >= 300) {
      throw new Error('Failed to upload attachment.')
    }

    return { responseText: result.body, byteLength: null }
  }

  let buffer: ArrayBuffer
  if (Platform.OS === 'web') {
    const localResponse = await fetch(attachment.uri)
    if (!localResponse.ok) {
      throw new Error('Failed to read attachment.')
    }
    buffer = await localResponse.arrayBuffer()
  } else {
    // Native: `fetch(file:// | content://)` often throws "Network request failed".
    const localFile = new ExpoFile(attachment.uri)
    buffer = await localFile.arrayBuffer()
  }

  const uploadResponse = await expoFetch(uploadUrl, {
    method: 'POST',
    headers: {
      'Content-Type': contentType,
    },
    body: buffer,
  })

  if (!uploadResponse.ok) {
    throw new Error('Failed to upload attachment.')
  }

  return {
    responseText: await uploadResponse.text(),
    byteLength: buffer.byteLength,
  }
}

export async function uploadPickedDocuments(
  attachments: PickedAttachment[],
  generateAttachmentUploadUrl: (args: Record<string, never>) => Promise<string>,
  handlers: AttachmentUploadHandlers = {},
) {
  if (attachments.length === 0) {
    return [] as PersistedAttachment[]
  }

  const oversized = attachments.find(isAttachmentTooLarge)
  if (oversized) {
    throw new Error(
      `${oversized.name} is larger than ${MAX_ATTACHMENT_SIZE_LABEL}.`,
    )
  }

  return await Promise.all(
    attachments.map(async (attachment) => {
      const uploadUrl = await generateAttachmentUploadUrl({})
      const contentType = attachment.mimeType || 'application/octet-stream'
      handlers.onUploadProgress?.(attachment.uri, 0)

      const { responseText, byteLength } = await uploadAttachmentBody(
        uploadUrl,
        attachment,
        contentType,
        (progress) => handlers.onUploadProgress?.(attachment.uri, progress),
      )

      handlers.onUploadProgress?.(attachment.uri, 100)

      let parsed: { storageId: Id<'_storage'> }
      try {
        parsed = JSON.parse(responseText) as { storageId: Id<'_storage'> }
      } catch {
        throw new Error('Failed to read uploaded attachment response.')
      }

      const size =
        attachment.size ?? byteLength ?? getLocalFileSize(attachment) ?? 0

      return {
        kind: getAttachmentKind(attachment.mimeType),
        storageId: parsed.storageId,
        fileName: attachment.name,
        contentType,
        size,
        url: null,
      } satisfies PersistedAttachment
    }),
  )
}

export function startPersistentMessageStream(
  streamId: string,
  handlers: PersistentMessageStreamHandlers = {},
) {
  const abortController = new AbortController()

  const finished = (async (): Promise<PersistentMessageStreamResult> => {
    let accessToken: string | undefined
    try {
      const tokenResult = await authClient.convex.token({
        fetchOptions: { throw: false },
      })
      accessToken = tokenResult.data?.token
    } catch {
      // Network failures throw even with `throw: false`.
    }

    if (!accessToken) {
      return {
        ok: false,
        failure: 'request',
        errorMessage: 'Could not authenticate the streaming request.',
      }
    }

    const apiKey = await getStoredOpenRouterApiKey()

    let response: Response
    try {
      response = await expoFetch(
        new URL(
          '/messages/stream',
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
            streamId,
            apiKey: apiKey || undefined,
          }),
        },
      )
    } catch (error) {
      const isAbort = error instanceof Error && error.name === 'AbortError'
      return {
        ok: false,
        failure: isAbort ? 'aborted' : 'request',
        errorMessage: isAbort
          ? 'Stopped generating.'
          : error instanceof Error
            ? error.message
            : 'Failed to reach the streaming endpoint.',
      }
    }

    if (response.status === 205) {
      return { ok: true }
    }

    if (!response.ok) {
      let errorMessage = `Streaming request failed with ${response.status}.`

      try {
        const responseText = (await response.text()).trim()
        if (responseText) {
          errorMessage = responseText
        }
      } catch {
        // Keep fallback error if parsing fails.
      }

      return { ok: false, failure: 'request', errorMessage }
    }

    if (!response.body || typeof response.body.getReader !== 'function') {
      await response.text()
      return { ok: true }
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

        let streamEvent: StreamEvent
        try {
          streamEvent = JSON.parse(trimmedLine) as StreamEvent
        } catch {
          continue
        }

        if (streamEvent.type === 'text-delta') {
          handlers.onTextDelta?.(streamEvent.text)
          continue
        }

        if (streamEvent.type === 'reasoning-delta') {
          handlers.onReasoningDelta?.(streamEvent.text)
          continue
        }

        if (streamEvent.type === 'source') {
          handlers.onSource?.(streamEvent.source)
          continue
        }

        if (streamEvent.type === 'attachment') {
          handlers.onAttachment?.(streamEvent.attachment)
          continue
        }

        if (streamEvent.type === 'error') {
          streamEventErrorMessage = streamEvent.errorMessage
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
          return streamEventErrorMessage == null
            ? { ok: true }
            : {
                ok: false,
                failure: 'server',
                errorMessage: streamEventErrorMessage,
              }
        }
      } catch (error) {
        const isAbort = error instanceof Error && error.name === 'AbortError'
        return {
          ok: false,
          failure: isAbort ? 'aborted' : 'disconnected',
          errorMessage: isAbort
            ? 'Stopped generating.'
            : error instanceof Error
              ? error.message
              : 'The stream connection was interrupted.',
        }
      }
    }
  })().catch(
    (error): PersistentMessageStreamResult => ({
      ok: false,
      failure: 'request',
      errorMessage:
        error instanceof Error ? error.message : 'Failed to stream response.',
    }),
  )

  return {
    abort() {
      abortController.abort()
    },
    finished,
  }
}
