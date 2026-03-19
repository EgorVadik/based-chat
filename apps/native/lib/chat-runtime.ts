import type { Id } from '@based-chat/backend/convex/_generated/dataModel'
import { fetch as expoFetch } from 'expo/fetch'
import {
  FileSystemUploadType,
  createUploadTask,
} from 'expo-file-system/legacy'

import type { PickedDocument } from '@/components/chat/chat-input'
import type {
  ChatMessage,
  MessageAttachment,
  MessageSource,
} from '@/components/chat/message-bubble'
import { authClient } from '@/lib/auth-client'
import { getStoredOpenRouterApiKey } from '@/lib/api-keys'

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

function inferAttachmentKind(attachment: PickedDocument): 'image' | 'file' {
  return attachment.mimeType?.startsWith('image/') ? 'image' : 'file'
}

export async function uploadPickedDocuments(
  attachments: PickedDocument[],
  generateAttachmentUploadUrl: (args: Record<string, never>) => Promise<string>,
  handlers: AttachmentUploadHandlers = {},
) {
  if (attachments.length === 0) {
    return [] as PersistedAttachment[]
  }

  return await Promise.all(
    attachments.map(async (attachment) => {
      const uploadUrl = await generateAttachmentUploadUrl({})
      const contentType = attachment.mimeType || 'application/octet-stream'
      handlers.onUploadProgress?.(attachment.uri, 0)

      const uploadTask = createUploadTask(
        uploadUrl,
        attachment.uri,
        {
          httpMethod: 'POST',
          uploadType: FileSystemUploadType.BINARY_CONTENT,
          headers: {
            'Content-Type': contentType,
          },
        },
        (event) => {
          if (event.totalBytesExpectedToSend <= 0) {
            return
          }

          handlers.onUploadProgress?.(
            attachment.uri,
            Math.min(
              100,
              Math.round(
                (event.totalBytesSent / event.totalBytesExpectedToSend) * 100,
              ),
            ),
          )
        },
      )
      const uploadResponse = await uploadTask.uploadAsync()

      if (!uploadResponse) {
        throw new Error('Failed to upload attachment.')
      }

      if (uploadResponse.status < 200 || uploadResponse.status >= 300) {
        throw new Error('Failed to upload attachment.')
      }

      handlers.onUploadProgress?.(attachment.uri, 100)

      let parsed: { storageId: Id<'_storage'> }
      try {
        parsed = JSON.parse(uploadResponse.body) as { storageId: Id<'_storage'> }
      } catch {
        throw new Error('Failed to read uploaded attachment response.')
      }

      return {
        kind: inferAttachmentKind(attachment),
        storageId: parsed.storageId,
        fileName: attachment.name,
        contentType,
        size: attachment.size ?? 0,
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
    const tokenResult = await authClient.convex.token({
      fetchOptions: { throw: false },
    })
    const accessToken = tokenResult.data?.token

    if (!accessToken) {
      return {
        ok: false,
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
      return {
        ok: false,
        errorMessage:
          error instanceof Error
            ? error.name === 'AbortError'
              ? 'Stopped generating.'
              : error.message
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

      return { ok: false, errorMessage }
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
          return {
            ok: streamEventErrorMessage == null,
            errorMessage: streamEventErrorMessage,
          }
        }
      } catch (error) {
        return {
          ok: false,
          errorMessage:
            error instanceof Error
              ? error.name === 'AbortError'
                ? 'Stopped generating.'
                : error.message
              : 'The stream connection was interrupted.',
        }
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
