import { createOpenRouter } from '@openrouter/ai-sdk-provider'
import {
  PersistentTextStreaming,
  type StreamId,
} from '@convex-dev/persistent-text-streaming'
import { ConvexError, v } from 'convex/values'
import { streamText } from 'ai'

import type { Id } from './_generated/dataModel'
import { components, internal } from './_generated/api'
import {
  httpAction,
  internalMutation,
  internalQuery,
  mutation,
  query,
  type MutationCtx,
  type QueryCtx,
} from './_generated/server'
import { authComponent, createAuth } from './auth'
import { getOpenRouterModelId, toModelMessages } from './llm'

const attachmentValidator = v.object({
  kind: v.union(v.literal('image'), v.literal('file')),
  storageId: v.id('_storage'),
  fileName: v.string(),
  contentType: v.string(),
  size: v.number(),
})

type StoredAttachment = {
  kind: 'image' | 'file'
  storageId: Id<'_storage'>
  fileName: string
  contentType: string
  size: number
}

const persistentTextStreaming = new PersistentTextStreaming(
  (components as typeof components & { persistentTextStreaming: any })
    .persistentTextStreaming,
)
const openrouter = createOpenRouter({
  apiKey: process.env.OPENROUTER_API_KEY,
})

async function resolveAttachments(
  ctx: QueryCtx | MutationCtx,
  attachments: StoredAttachment[] | undefined,
) {
  if (!attachments?.length) {
    return []
  }

  return await Promise.all(
    attachments.map(async (attachment) => ({
      ...attachment,
      url: await ctx.storage.getUrl(attachment.storageId),
    })),
  )
}

async function toClientMessage(
  ctx: QueryCtx | MutationCtx,
  message: {
    _id: Id<'messages'>
    threadId: Id<'threads'>
    userId: string
    role: 'user' | 'system'
    modelId: string
    content: string
    streamId?: string
    errorMessage?: string
    attachments?: StoredAttachment[]
    createdAt: number
    updatedAt?: number
  },
) {
  const streamBody = message.streamId
    ? await persistentTextStreaming.getStreamBody(
        ctx,
        message.streamId as StreamId,
      )
    : null

  return {
    ...message,
    content: streamBody?.text ?? message.content,
    streamStatus: streamBody?.status,
    errorMessage: message.errorMessage,
    attachments: await resolveAttachments(ctx, message.attachments),
  }
}

function formatStreamErrorMessage(error: unknown) {
  const rawMessage = extractRawStreamErrorMessage(error)
  const normalized = rawMessage.toLowerCase()

  if (
    normalized.includes('requires more credits') ||
    normalized.includes('can only afford') ||
    normalized.includes('higher monthly limit')
  ) {
    return 'The AI provider could not generate a reply because the account is out of credits or the response budget is too high. Try again with a shorter prompt or a cheaper model.'
  }

  if (
    normalized.includes('rate limit') ||
    normalized.includes('too many requests')
  ) {
    return 'The AI provider is rate limiting requests right now. Please try again in a moment.'
  }

  if (
    normalized.includes('not authenticated') ||
    normalized.includes('unauthorized') ||
    normalized.includes('forbidden')
  ) {
    return 'Your session expired. Please sign in again and retry.'
  }

  if (normalized.includes('timeout') || normalized.includes('timed out')) {
    return 'The reply took too long to generate. Please try again.'
  }

  if (normalized.includes('aborted')) {
    return 'The reply was stopped before it finished.'
  }

  if (
    normalized.includes('network') ||
    normalized.includes('fetch failed') ||
    normalized.includes('failed to reach')
  ) {
    return 'We could not reach the AI provider. Please check your connection and try again.'
  }

  return 'Something went wrong while generating the reply. Please try again.'
}

function extractRawStreamErrorMessage(error: unknown) {
  if (error instanceof Error) {
    const message = error.message.trim()
    if (message.length > 0) {
      return message
    }
  }

  if (typeof error === 'string' && error.trim().length > 0) {
    return error.trim()
  }

  try {
    const serialized = JSON.stringify(error)
    if (serialized && serialized !== '{}') {
      return serialized
    }
  } catch {
    // Ignore JSON serialization failures and fall back below.
  }

  return 'Reply failed to stream. Retry to generate again.'
}

function deriveThreadTitle(content: string, attachments?: StoredAttachment[]) {
  const normalized = content.trim().replace(/\s+/g, ' ')

  if (normalized.length > 0 && normalized.length <= 60) {
    return normalized
  }

  if (normalized.length > 0) {
    return `${normalized.slice(0, 57).trimEnd()}...`
  }

  if (attachments?.length === 1) {
    return attachments[0]!.fileName || 'Shared image'
  }

  if (attachments && attachments.length > 1) {
    return `${attachments.length} shared images`
  }

  return 'New chat'
}

async function deleteMessageAttachments(
  ctx: MutationCtx,
  attachments: StoredAttachment[] | undefined,
) {
  if (!attachments?.length) {
    return
  }

  for (const attachment of attachments) {
    await ctx.storage.delete(attachment.storageId)
  }
}

async function requireAuthenticatedUser(ctx: QueryCtx | MutationCtx) {
  const user = await authComponent.safeGetAuthUser(ctx)
  if (!user) {
    throw new ConvexError('Not authenticated')
  }

  return user
}

async function listOwnedThreadsWithMessages(
  ctx: QueryCtx | MutationCtx,
  userId: string,
) {
  const threads = await ctx.db
    .query('threads')
    .withIndex('by_userId', (q) => q.eq('userId', userId))
    .collect()

  return await Promise.all(
    threads.map(async (thread) => ({
      thread,
      messages: await ctx.db
        .query('messages')
        .withIndex('by_threadId_createdAt', (q) => q.eq('threadId', thread._id))
        .order('asc')
        .collect(),
    })),
  )
}

async function getAuthorizedThread(
  ctx: QueryCtx | MutationCtx,
  threadId: Id<'threads'>,
) {
  const user = await requireAuthenticatedUser(ctx)

  const thread = await ctx.db.get(threadId)
  if (!thread || thread.userId !== user._id) {
    throw new ConvexError('Thread not found')
  }

  return { thread, user }
}

async function getMessageByStreamId(
  ctx: QueryCtx | MutationCtx,
  streamId: string,
) {
  return await ctx.db
    .query('messages')
    .withIndex('by_streamId', (q) => q.eq('streamId', streamId))
    .unique()
}

export const listByThread = query({
  args: {
    threadId: v.id('threads'),
  },
  handler: async (ctx, args) => {
    await getAuthorizedThread(ctx, args.threadId)

    const messages = await ctx.db
      .query('messages')
      .withIndex('by_threadId_createdAt', (q) =>
        q.eq('threadId', args.threadId),
      )
      .order('asc')
      .collect()

    return await Promise.all(
      messages.map((message) => toClientMessage(ctx, message)),
    )
  },
})

export const getStreamBody = query({
  args: {
    streamId: v.string(),
  },
  handler: async (ctx, args) => {
    const message = await getMessageByStreamId(ctx, args.streamId)
    if (!message) {
      throw new ConvexError('Message stream not found')
    }

    await getAuthorizedThread(ctx, message.threadId)
    const streamBody = await persistentTextStreaming.getStreamBody(
      ctx,
      args.streamId as StreamId,
    )
    return {
      ...streamBody,
      errorMessage: message.errorMessage,
    }
  },
})

export const getStreamGenerationContext = internalQuery({
  args: {
    streamId: v.string(),
  },
  handler: async (ctx, args) => {
    const user = await requireAuthenticatedUser(ctx)
    const targetMessage = await getMessageByStreamId(ctx, args.streamId)
    if (!targetMessage || targetMessage.role !== 'system') {
      throw new ConvexError('Message stream not found')
    }

    const thread = await ctx.db.get(targetMessage.threadId)
    if (!thread || thread.userId !== user._id) {
      throw new ConvexError('Thread not found')
    }

    const threadMessages = await ctx.db
      .query('messages')
      .withIndex('by_threadId_createdAt', (q) =>
        q.eq('threadId', targetMessage.threadId),
      )
      .order('asc')
      .collect()
    const targetMessageIndex = threadMessages.findIndex(
      (message) => message._id === targetMessage._id,
    )
    if (targetMessageIndex === -1) {
      throw new ConvexError('Message stream not found')
    }

    return {
      modelId: targetMessage.modelId,
      conversationMessages: await Promise.all(
        threadMessages.slice(0, targetMessageIndex).map(async (message) => ({
          role: message.role,
          content: message.streamId
            ? (
                await persistentTextStreaming.getStreamBody(
                  ctx,
                  message.streamId as StreamId,
                )
              ).text
            : message.content,
          attachments: message.attachments,
        })),
      ),
    }
  },
})

export const listUserAttachments = query({
  args: {},
  handler: async (ctx) => {
    const user = await requireAuthenticatedUser(ctx)
    const threadEntries = await listOwnedThreadsWithMessages(ctx, user._id)
    const attachments = await Promise.all(
      threadEntries.flatMap(({ thread, messages }) =>
        messages.flatMap((message) =>
          (message.attachments ?? []).map(async (attachment) => ({
            id: attachment.storageId,
            storageId: attachment.storageId,
            messageId: message._id,
            threadId: thread._id,
            threadTitle: thread.title,
            kind: attachment.kind,
            fileName: attachment.fileName,
            contentType: attachment.contentType,
            size: attachment.size,
            createdAt: message.createdAt,
            updatedAt: message.updatedAt ?? message.createdAt,
            url: await ctx.storage.getUrl(attachment.storageId),
          })),
        ),
      ),
    )

    return attachments.sort((a, b) => b.createdAt - a.createdAt)
  },
})

export const create = mutation({
  args: {
    threadId: v.id('threads'),
    role: v.union(v.literal('user'), v.literal('system')),
    modelId: v.string(),
    content: v.string(),
    attachments: v.optional(v.array(attachmentValidator)),
  },
  handler: async (ctx, args) => {
    const { thread, user } = await getAuthorizedThread(ctx, args.threadId)
    const content = args.content.trim()
    const attachments = args.attachments ?? []

    if (!content && attachments.length === 0) {
      throw new ConvexError('Message content or an attachment is required')
    }

    const timestamp = Date.now()
    const messageId = await ctx.db.insert('messages', {
      threadId: args.threadId,
      userId: user._id,
      role: args.role,
      modelId: args.modelId,
      content,
      attachments: attachments.length > 0 ? attachments : undefined,
      createdAt: timestamp,
      updatedAt: timestamp,
    })

    const threadPatch: {
      updatedAt: number
      title?: string
    } = {
      updatedAt: timestamp,
    }

    if (args.role === 'user' && thread.title === 'New chat') {
      threadPatch.title = deriveThreadTitle(content, attachments)
    }

    await ctx.db.patch(args.threadId, threadPatch)

    return await toClientMessage(ctx, {
      _id: messageId,
      threadId: args.threadId,
      userId: user._id,
      role: args.role,
      modelId: args.modelId,
      content,
      attachments: attachments.length > 0 ? attachments : undefined,
      createdAt: timestamp,
      updatedAt: timestamp,
    })
  },
})

export const generateAttachmentUploadUrl = mutation({
  args: {},
  handler: async (ctx) => {
    const user = await authComponent.safeGetAuthUser(ctx)
    if (!user) {
      throw new ConvexError('Not authenticated')
    }

    return await ctx.storage.generateUploadUrl()
  },
})

export const edit = mutation({
  args: {
    threadId: v.id('threads'),
    messageId: v.id('messages'),
    modelId: v.string(),
    content: v.string(),
    attachments: v.optional(v.array(attachmentValidator)),
  },
  handler: async (ctx, args) => {
    await getAuthorizedThread(ctx, args.threadId)

    const messages = await ctx.db
      .query('messages')
      .withIndex('by_threadId_createdAt', (q) =>
        q.eq('threadId', args.threadId),
      )
      .order('asc')
      .collect()

    const targetIndex = messages.findIndex(
      (message) => message._id === args.messageId,
    )
    if (targetIndex === -1) {
      throw new ConvexError('Message not found')
    }

    const targetMessage = messages[targetIndex]!
    const content = args.content.trim()
    const nextAttachments = args.attachments ?? targetMessage.attachments ?? []
    if (targetMessage.role !== 'user') {
      throw new ConvexError('Only user messages can be edited')
    }

    if (!content && !nextAttachments.length) {
      throw new ConvexError('Message content or an attachment is required')
    }

    const nextAttachmentStorageIds = new Set(
      nextAttachments.map((attachment) => attachment.storageId),
    )

    const deletedMessageIds = messages
      .slice(targetIndex + 1)
      .map((message) => message._id)

    for (const message of messages.slice(targetIndex + 1)) {
      await deleteMessageAttachments(ctx, message.attachments)
      await ctx.db.delete(message._id)
    }

    const timestamp = Date.now()
    for (const attachment of targetMessage.attachments ?? []) {
      if (!nextAttachmentStorageIds.has(attachment.storageId)) {
        await ctx.storage.delete(attachment.storageId)
      }
    }

    await ctx.db.patch(args.messageId, {
      content,
      modelId: args.modelId,
      attachments: nextAttachments.length > 0 ? nextAttachments : undefined,
      updatedAt: timestamp,
    })

    await ctx.db.patch(args.threadId, {
      updatedAt: timestamp,
      ...(targetIndex === 0
        ? { title: deriveThreadTitle(content, nextAttachments) }
        : {}),
    })

    return {
      updatedMessage: await toClientMessage(ctx, {
        ...targetMessage,
        content,
        modelId: args.modelId,
        attachments: nextAttachments.length > 0 ? nextAttachments : undefined,
        updatedAt: timestamp,
      }),
      deletedMessageIds,
    }
  },
})

export const createAssistantReply = mutation({
  args: {
    threadId: v.id('threads'),
    userMessageId: v.id('messages'),
    userMessageUpdatedAt: v.number(),
    modelId: v.string(),
  },
  handler: async (ctx, args) => {
    const { user } = await getAuthorizedThread(ctx, args.threadId)

    const messages = await ctx.db
      .query('messages')
      .withIndex('by_threadId_createdAt', (q) =>
        q.eq('threadId', args.threadId),
      )
      .order('asc')
      .collect()

    const targetIndex = messages.findIndex(
      (message) => message._id === args.userMessageId,
    )
    if (targetIndex === -1) {
      throw new ConvexError('Message not found')
    }

    const targetMessage = messages[targetIndex]!
    const targetUpdatedAt = targetMessage.updatedAt ?? targetMessage.createdAt

    if (targetMessage.role !== 'user') {
      throw new ConvexError('System replies must target a user message')
    }

    if (targetUpdatedAt !== args.userMessageUpdatedAt) {
      return null
    }

    if (targetIndex !== messages.length - 1) {
      return null
    }

    const streamId = await persistentTextStreaming.createStream(ctx)
    const timestamp = Date.now()
    const messageId = await ctx.db.insert('messages', {
      threadId: args.threadId,
      userId: user._id,
      role: 'system',
      modelId: args.modelId,
      content: '',
      streamId,
      errorMessage: undefined,
      createdAt: timestamp,
      updatedAt: timestamp,
    })

    await ctx.db.patch(args.threadId, {
      updatedAt: timestamp,
    })

    return await toClientMessage(ctx, {
      _id: messageId,
      threadId: args.threadId,
      userId: user._id,
      role: 'system' as const,
      modelId: args.modelId,
      content: '',
      streamId,
      errorMessage: undefined,
      createdAt: timestamp,
      updatedAt: timestamp,
    })
  },
})

export const markAssistantReplyError = internalMutation({
  args: {
    streamId: v.string(),
    errorMessage: v.string(),
  },
  handler: async (ctx, args) => {
    const message = await getMessageByStreamId(ctx, args.streamId)
    if (!message) {
      return
    }

    await ctx.db.patch(message._id, {
      errorMessage: args.errorMessage,
      updatedAt: Date.now(),
    })
  },
})

function isAllowedStreamOrigin(origin: string) {
  if (process.env.SITE_URL && origin === process.env.SITE_URL) {
    return true
  }

  if (process.env.NODE_ENV === 'development') {
    return (
      origin.startsWith('http://localhost:') ||
      origin.startsWith('http://127.0.0.1:') ||
      origin.startsWith('http://192.168.') ||
      origin.startsWith('http://10.')
    )
  }

  return false
}

function applyCorsHeaders(response: Response, request: Request) {
  const requestOrigin = request.headers.get('origin')
  if (requestOrigin && isAllowedStreamOrigin(requestOrigin)) {
    response.headers.set('Access-Control-Allow-Origin', requestOrigin)
    response.headers.set('Access-Control-Allow-Credentials', 'true')
  } else if (process.env.SITE_URL) {
    response.headers.set('Access-Control-Allow-Origin', process.env.SITE_URL)
  }

  response.headers.set(
    'Access-Control-Allow-Headers',
    'Authorization, Content-Type',
  )
  response.headers.set('Access-Control-Allow-Methods', 'POST, OPTIONS')
  response.headers.set('Vary', 'Origin')
  return response
}

export const streamAssistantReply = httpAction(async (ctx, request) => {
  const { streamId } = (await request.json()) as { streamId?: string }
  const hasAuthorizationHeader = Boolean(request.headers.get('authorization'))

  console.log('[stream:http] request', {
    streamId,
    hasAuthorizationHeader,
    origin: request.headers.get('origin'),
  })

  if (!streamId) {
    console.warn('[stream:http] missing-stream-id')
    return applyCorsHeaders(
      new Response('Missing streamId', {
        status: 400,
      }),
      request,
    )
  }

  const user = await authComponent.safeGetAuthUser(ctx)
  if (!user) {
    console.warn('[stream:http] unauthenticated', {
      streamId,
      hasAuthorizationHeader,
    })
    return applyCorsHeaders(
      new Response('Not authenticated', {
        status: 401,
      }),
      request,
    )
  }

  let generationContext: {
    modelId: string
    conversationMessages: {
      role: 'user' | 'system'
      content: string
      attachments?: StoredAttachment[]
    }[]
  }
  try {
    console.log('[stream:http] loading-context', {
      streamId,
      userId: user._id,
    })
    generationContext = await ctx.runQuery(
      (internal.messages as { getStreamGenerationContext: any })
        .getStreamGenerationContext,
      { streamId },
    )
  } catch (error) {
    const message =
      error instanceof Error ? error.message : 'Message stream not found'
    const status = message === 'Not authenticated' ? 401 : 404
    console.error('[stream:http] context-error', {
      streamId,
      userId: user._id,
      message,
    })
    return applyCorsHeaders(new Response(message, { status }), request)
  }

  const conversationMessages = toModelMessages(
    generationContext.conversationMessages,
  )
  const modelId = getOpenRouterModelId(generationContext.modelId)

  console.log('[stream:http] generation-start', {
    streamId,
    userId: user._id,
    modelId,
    messageCount: conversationMessages.length,
  })

  let chunkCount = 0
  let response: Response
  try {
    response = await persistentTextStreaming.stream(
      ctx,
      request,
      streamId as StreamId,
      async (_ctx, _request, _streamId, appendChunk) => {
        let streamFailureMessage: string | undefined
        let rawStreamFailureMessage: string | undefined

        try {
          const result = streamText({
            model: openrouter(modelId),
            messages: conversationMessages,
            onError({ error }) {
              rawStreamFailureMessage = extractRawStreamErrorMessage(error)
              streamFailureMessage = formatStreamErrorMessage(error)
              console.error('[stream:http] provider-error', {
                streamId,
                userId: user._id,
                modelId,
                error: rawStreamFailureMessage,
              })
            },
          })

          for await (const part of result.fullStream) {
            switch (part.type) {
              case 'text-delta': {
                chunkCount += 1
                if (chunkCount <= 3 || chunkCount % 25 === 0) {
                  console.log('[stream:http] chunk', {
                    streamId,
                    userId: user._id,
                    chunkCount,
                    chunkLength: part.text.length,
                  })
                }
                await appendChunk(part.text)
                break
              }
              case 'error': {
                throw part.error
              }
              case 'abort': {
                throw new Error('The reply was aborted before completion.')
              }
              case 'tool-error': {
                throw part.error
              }
              default: {
                break
              }
            }
          }

          if (streamFailureMessage) {
            throw new Error(streamFailureMessage)
          }
        } catch (error) {
          const errorMessage =
            streamFailureMessage ?? formatStreamErrorMessage(error)
          const rawErrorMessage =
            rawStreamFailureMessage ?? extractRawStreamErrorMessage(error)
          await _ctx.runMutation(
            (internal.messages as { markAssistantReplyError: any })
              .markAssistantReplyError,
            {
              streamId,
              errorMessage,
            },
          )
          throw error instanceof Error ? error : new Error(rawErrorMessage)
        }
      },
    )
  } catch (error) {
    console.error('[stream:http] generation-error', {
      streamId,
      userId: user._id,
      modelId,
      error: error instanceof Error ? error.message : String(error),
    })
    return applyCorsHeaders(
      new Response('Reply failed to stream', {
        status: 500,
      }),
      request,
    )
  }

  console.log('[stream:http] generation-complete', {
    streamId,
    userId: user._id,
    chunkCount,
  })

  return applyCorsHeaders(response, request)
})

export const streamAssistantReplyOptions = httpAction(async (_ctx, request) => {
  return applyCorsHeaders(
    new Response(null, {
      status: 204,
    }),
    request,
  )
})

export const deleteManyAttachments = mutation({
  args: {
    storageIds: v.array(v.id('_storage')),
  },
  handler: async (ctx, args) => {
    const user = await requireAuthenticatedUser(ctx)
    const uniqueStorageIds = [...new Set(args.storageIds)]
    if (uniqueStorageIds.length === 0) {
      return { deletedCount: 0 }
    }

    const targetStorageIds = new Set(uniqueStorageIds)
    const threadEntries = await listOwnedThreadsWithMessages(ctx, user._id)
    const timestamp = Date.now()
    let deletedCount = 0

    for (const { thread, messages } of threadEntries) {
      let shouldPatchThread = false
      let nextTitle = thread.title

      for (const [index, message] of messages.entries()) {
        const currentAttachments = message.attachments ?? []
        if (currentAttachments.length === 0) {
          continue
        }

        const removedAttachments = currentAttachments.filter((attachment) =>
          targetStorageIds.has(attachment.storageId),
        )
        if (removedAttachments.length === 0) {
          continue
        }

        const nextAttachments = currentAttachments.filter(
          (attachment) => !targetStorageIds.has(attachment.storageId),
        )

        await ctx.db.patch(message._id, {
          attachments: nextAttachments.length > 0 ? nextAttachments : undefined,
          updatedAt: timestamp,
        })

        for (const attachment of removedAttachments) {
          await ctx.storage.delete(attachment.storageId)
          deletedCount += 1
        }

        if (index === 0) {
          nextTitle = deriveThreadTitle(message.content, nextAttachments)
        }

        shouldPatchThread = true
      }

      if (shouldPatchThread) {
        await ctx.db.patch(thread._id, {
          updatedAt: timestamp,
          title: nextTitle,
        })
      }
    }

    return { deletedCount }
  },
})
