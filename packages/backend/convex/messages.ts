import { createOpenRouter } from '@openrouter/ai-sdk-provider'
import {
  PersistentTextStreaming,
  type StreamId,
} from '@convex-dev/persistent-text-streaming'
import { ConvexError, v } from 'convex/values'
import { generateText, streamText, type GeneratedFile } from 'ai'

import type { Id } from './_generated/dataModel'
import { components, internal } from './_generated/api'
import {
  type ActionCtx,
  action,
  httpAction,
  internalMutation,
  internalQuery,
  mutation,
  query,
  type MutationCtx,
  type QueryCtx,
} from './_generated/server'
import { authComponent } from './auth'
import { applyCorsHeaders } from './corsHttp'
import {
  buildSystemPrompt,
  getOpenRouterModelId,
  getOpenRouterChatProviderOptions,
  toModelMessages,
} from './llm'

const attachmentValidator = v.object({
  kind: v.union(v.literal('image'), v.literal('file')),
  storageId: v.id('_storage'),
  fileName: v.string(),
  contentType: v.string(),
  size: v.number(),
})
const generationStatsValidator = v.object({
  timeToFirstTokenMs: v.optional(v.number()),
  tokensPerSecond: v.optional(v.number()),
  costUsd: v.optional(v.number()),
  inputTokens: v.optional(v.number()),
  outputTokens: v.optional(v.number()),
  totalTokens: v.optional(v.number()),
  textTokens: v.optional(v.number()),
  reasoningTokens: v.optional(v.number()),
})
const sourceValidator = v.object({
  id: v.string(),
  url: v.string(),
  title: v.optional(v.string()),
  snippet: v.optional(v.string()),
  hostname: v.optional(v.string()),
})

type StoredAttachment = {
  kind: 'image' | 'file'
  storageId: Id<'_storage'>
  fileName: string
  contentType: string
  size: number
}
type ResolvedModelAttachment = {
  kind: 'image' | 'file'
  fileName: string
  contentType: string
  url: string
}
type ResolvedAttachment = StoredAttachment & {
  url: string | null
}
type GenerationStats = {
  timeToFirstTokenMs?: number
  tokensPerSecond?: number
  costUsd?: number
  inputTokens?: number
  outputTokens?: number
  totalTokens?: number
  textTokens?: number
  reasoningTokens?: number
}
type MessageSource = {
  id: string
  url: string
  title?: string
  snippet?: string
  hostname?: string
}
type ImportedTemporaryMessage = {
  role: 'user' | 'system'
  modelId: string
  content: string
  reasoningText?: string
  sources?: MessageSource[]
  attachments?: StoredAttachment[]
  errorMessage?: string
  generationStats?: GenerationStats
  createdAt: number
  updatedAt?: number
}
type TemporaryStreamAttachment = {
  kind: 'image' | 'file'
  storageId: string
  fileName: string
  contentType: string
  size: number
}
type TemporaryStreamRequestMessage = {
  role: 'user' | 'system'
  content: string
  attachments?: TemporaryStreamAttachment[]
}
type UserProfilePromptContext = {
  preferredName?: string
  role?: string
  traits: string[]
  bio?: string
}

const importedTemporaryMessageValidator = v.object({
  role: v.union(v.literal('user'), v.literal('system')),
  modelId: v.string(),
  content: v.string(),
  reasoningText: v.optional(v.string()),
  sources: v.optional(v.array(sourceValidator)),
  attachments: v.optional(v.array(attachmentValidator)),
  errorMessage: v.optional(v.string()),
  generationStats: v.optional(generationStatsValidator),
  createdAt: v.number(),
  updatedAt: v.optional(v.number()),
})

const persistentTextStreaming = new PersistentTextStreaming(
  (components as typeof components & { persistentTextStreaming: any })
    .persistentTextStreaming,
)
type StreamEvent =
  | {
      type: 'text-delta'
      text: string
    }
  | {
      type: 'reasoning-delta'
      text: string
    }
  | {
      type: 'source'
      source: MessageSource
    }
  | {
      type: 'attachment'
      attachment: ResolvedAttachment
    }
  | {
      type: 'error'
      errorMessage: string
    }
  | {
      type: 'finish'
      generationStats?: GenerationStats
    }

const THREAD_TITLE_MODEL_ID = 'google/gemini-2.5-flash-lite'

const internalMessages = internal.messages as unknown as {
  getAssistantReplyStopState: any
  applyGeneratedThreadTitle: any
  getStreamGenerationContext: any
  getTemporaryStreamSystemPrompt: any
  getThreadTitleContext: any
  markAssistantReplyCompleted: any
  markAssistantReplyError: any
  appendAssistantReplyAttachment: any
  setAssistantReplyReasoning: any
  setAssistantReplySources: any
}

async function resolveAttachments(
  ctx: QueryCtx | MutationCtx,
  attachments: StoredAttachment[] | undefined,
): Promise<ResolvedAttachment[]> {
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

async function resolveModelAttachments(
  ctx: ActionCtx,
  attachments: StoredAttachment[] | undefined,
): Promise<ResolvedModelAttachment[]> {
  if (!attachments?.length) {
    return []
  }

  return (
    await Promise.all(
      attachments.map(async (attachment) => {
        const url = await ctx.storage.getUrl(attachment.storageId)
        if (!url) {
          return null
        }

        return {
          kind: attachment.kind,
          fileName: attachment.fileName,
          contentType: attachment.contentType || 'application/octet-stream',
          url,
        }
      }),
    )
  ).filter(
    (attachment): attachment is ResolvedModelAttachment => attachment != null,
  )
}

async function resolveTemporaryModelAttachments(
  ctx: ActionCtx,
  attachments: TemporaryStreamAttachment[] | undefined,
): Promise<ResolvedModelAttachment[]> {
  if (!attachments?.length) {
    return []
  }

  return (
    await Promise.all(
      attachments.map(async (attachment) => {
        const url = await ctx.storage.getUrl(
          attachment.storageId as Id<'_storage'>,
        )
        if (!url) {
          return null
        }

        return {
          kind: attachment.kind,
          fileName: attachment.fileName,
          contentType: attachment.contentType || 'application/octet-stream',
          url,
        }
      }),
    )
  ).filter(
    (attachment): attachment is ResolvedModelAttachment => attachment != null,
  )
}

function isImageAttachmentLike<
  T extends { kind: 'image' | 'file'; contentType: string },
>(attachment: T) {
  return (
    attachment.kind === 'image' ||
    attachment.contentType.toLowerCase().startsWith('image/')
  )
}

function mergeAttachmentListsByStorageId<
  T extends { storageId: string; kind: 'image' | 'file'; contentType: string },
>(primary: T[] | undefined, secondary: T[] | undefined) {
  const mergedAttachments = [...(primary ?? [])]
  const seenStorageIds = new Set(
    mergedAttachments.map((attachment) => attachment.storageId),
  )

  for (const attachment of secondary ?? []) {
    if (seenStorageIds.has(attachment.storageId)) {
      continue
    }

    seenStorageIds.add(attachment.storageId)
    mergedAttachments.push(attachment)
  }

  return mergedAttachments
}

function carryForwardAssistantImages<
  TMessage extends {
    role: 'user' | 'system'
    content: string
    attachments?: TAttachment[]
  },
  TAttachment extends {
    storageId: string
    kind: 'image' | 'file'
    contentType: string
  },
>(messages: TMessage[]) {
  let carriedAssistantImageAttachments: TAttachment[] = []
  const lastUserMessageIndex = [...messages]
    .map((message, index) => ({ message, index }))
    .reverse()
    .find(({ message }) => message.role === 'user')?.index

  return messages.map((message, index) => {
    if (message.role === 'user') {
      return {
        ...message,
        attachments:
          lastUserMessageIndex != null && index === lastUserMessageIndex
            ? mergeAttachmentListsByStorageId(
                message.attachments,
                carriedAssistantImageAttachments,
              )
            : message.attachments,
      }
    }

    const assistantImageAttachments = (message.attachments ?? []).filter(
      isImageAttachmentLike,
    )

    if (assistantImageAttachments.length > 0) {
      carriedAssistantImageAttachments = assistantImageAttachments
    }

    return {
      ...message,
      attachments: undefined,
    }
  })
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
    reasoningText?: string
    sources?: MessageSource[]
    streamId?: string
    errorMessage?: string
    attachments?: StoredAttachment[]
    generationStats?: GenerationStats
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
    reasoningText: message.reasoningText,
    sources: message.sources ?? [],
    streamStatus: streamBody?.status,
    errorMessage: message.errorMessage,
    attachments: await resolveAttachments(ctx, message.attachments),
    generationStats: message.generationStats,
  }
}

function buildGenerationStats({
  startedAt,
  firstTextDeltaAt,
  completedAt,
  costUsd,
  totalUsage,
}: {
  startedAt: number
  firstTextDeltaAt?: number
  completedAt: number
  costUsd?: number
  totalUsage?: {
    inputTokens?: number
    outputTokens?: number
    totalTokens?: number
    outputTokenDetails?: {
      textTokens?: number
      reasoningTokens?: number
    }
  }
}): GenerationStats | undefined {
  const textTokens = totalUsage?.outputTokenDetails?.textTokens
  const outputTokens = totalUsage?.outputTokens
  const visibleOutputTokens = textTokens ?? outputTokens
  const streamDurationMs =
    firstTextDeltaAt == null
      ? undefined
      : Math.max(1, completedAt - firstTextDeltaAt)

  const generationStats: GenerationStats = {
    timeToFirstTokenMs:
      firstTextDeltaAt == null
        ? undefined
        : Math.max(0, firstTextDeltaAt - startedAt),
    tokensPerSecond:
      visibleOutputTokens == null || streamDurationMs == null
        ? undefined
        : visibleOutputTokens / (streamDurationMs / 1000),
    costUsd,
    inputTokens: totalUsage?.inputTokens,
    outputTokens,
    totalTokens: totalUsage?.totalTokens,
    textTokens,
    reasoningTokens: totalUsage?.outputTokenDetails?.reasoningTokens,
  }

  return Object.values(generationStats).some((value) => value != null)
    ? generationStats
    : undefined
}

function extractOpenRouterCostUsd(providerMetadata: unknown) {
  if (!providerMetadata || typeof providerMetadata !== 'object') {
    return undefined
  }

  const openrouterMetadata = (
    providerMetadata as {
      openrouter?: {
        usage?: {
          cost?: number
          costDetails?: {
            upstreamInferenceCost?: number
          }
        }
      }
    }
  ).openrouter

  return (
    openrouterMetadata?.usage?.cost ??
    openrouterMetadata?.usage?.costDetails?.upstreamInferenceCost
  )
}

function resolveOpenRouterApiKey(requestApiKey?: string) {
  const normalizedRequestApiKey = requestApiKey?.trim()
  return normalizedRequestApiKey || null
}

function getOpenRouter(requestApiKey?: string) {
  const apiKey = resolveOpenRouterApiKey(requestApiKey)

  if (!apiKey) {
    throw new Error(
      'An OpenRouter API key is required. Add it in Settings > API Keys and try again.',
    )
  }

  return createOpenRouter({ apiKey })
}

const MIN_WEB_SEARCH_MAX_RESULTS = 1
const MAX_WEB_SEARCH_MAX_RESULTS = 5

function normalizeWebSearchMaxResults(value: number) {
  return Math.min(
    MAX_WEB_SEARCH_MAX_RESULTS,
    Math.max(MIN_WEB_SEARCH_MAX_RESULTS, Math.trunc(value)),
  )
}

function resolveWebSearchConfig(args: {
  webSearchEnabled?: boolean
  webSearchMaxResults?: number
}) {
  const webSearchEnabled = args.webSearchEnabled === true

  if (!webSearchEnabled) {
    return {
      webSearchEnabled: false,
      webSearchMaxResults: undefined,
    }
  }

  const rawMaxResults = args.webSearchMaxResults

  if (
    typeof rawMaxResults !== 'number' ||
    !Number.isFinite(rawMaxResults) ||
    !Number.isInteger(rawMaxResults)
  ) {
    throw new ConvexError(
      `Search max results must be an integer between ${MIN_WEB_SEARCH_MAX_RESULTS} and ${MAX_WEB_SEARCH_MAX_RESULTS}.`,
    )
  }

  if (
    rawMaxResults < MIN_WEB_SEARCH_MAX_RESULTS ||
    rawMaxResults > MAX_WEB_SEARCH_MAX_RESULTS
  ) {
    throw new ConvexError(
      `Search max results must be between ${MIN_WEB_SEARCH_MAX_RESULTS} and ${MAX_WEB_SEARCH_MAX_RESULTS}.`,
    )
  }

  return {
    webSearchEnabled: true,
    webSearchMaxResults: normalizeWebSearchMaxResults(rawMaxResults),
  }
}

function shouldPersistChunk(text: string) {
  return text.includes('.') || text.includes('!') || text.includes('?')
}

function getGeneratedAttachmentKind(
  mediaType: string,
): StoredAttachment['kind'] {
  return mediaType.startsWith('image/') ? 'image' : 'file'
}

function getGeneratedAttachmentExtension(mediaType: string) {
  const normalizedMediaType = mediaType.trim().toLowerCase()
  const knownExtensions: Record<string, string> = {
    'image/png': 'png',
    'image/jpeg': 'jpg',
    'image/webp': 'webp',
    'image/gif': 'gif',
    'image/svg+xml': 'svg',
    'application/pdf': 'pdf',
    'text/plain': 'txt',
    'application/json': 'json',
  }

  const knownExtension = knownExtensions[normalizedMediaType]
  if (knownExtension) {
    return knownExtension
  }

  const subtype = normalizedMediaType.split('/')[1]
  if (!subtype) {
    return undefined
  }

  return subtype.replace(/\+.*/, '').replace(/[^a-z0-9]/g, '') || undefined
}

function buildGeneratedAttachmentFileName(
  mediaType: string,
  index: number,
): string {
  const kind = getGeneratedAttachmentKind(mediaType)
  const extension = getGeneratedAttachmentExtension(mediaType)
  const baseName = kind === 'image' ? 'generated-image' : 'generated-file'

  return extension
    ? `${baseName}-${index}.${extension}`
    : `${baseName}-${index}`
}

async function storeGeneratedAttachment(
  ctx: ActionCtx,
  file: GeneratedFile,
  index: number,
): Promise<ResolvedAttachment> {
  const blob = new Blob([new Uint8Array(file.uint8Array)], {
    type: file.mediaType || 'application/octet-stream',
  })
  const storageId = await ctx.storage.store(blob)

  return {
    kind: getGeneratedAttachmentKind(file.mediaType),
    storageId: storageId as Id<'_storage'>,
    fileName: buildGeneratedAttachmentFileName(file.mediaType, index),
    contentType: file.mediaType || 'application/octet-stream',
    size: blob.size,
    url: await ctx.storage.getUrl(storageId),
  }
}

function encodeStreamEvent(event: StreamEvent) {
  return `${JSON.stringify(event)}\n`
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
    return 'The AI provider rejected the API key or request. Check your OpenRouter key and try again.'
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

function normalizeSourceText(value: unknown, maximumLength: number) {
  if (typeof value !== 'string') {
    return undefined
  }

  const normalized = value.replace(/\s+/g, ' ').trim()
  if (!normalized) {
    return undefined
  }

  if (normalized.length <= maximumLength) {
    return normalized
  }

  return `${normalized.slice(0, maximumLength - 3).trimEnd()}...`
}

function resolveSourceHostname(url: string) {
  try {
    const hostname = new URL(url).hostname.replace(/^www\./, '')
    return hostname || undefined
  } catch {
    return undefined
  }
}

function toMessageSource(part: {
  sourceType?: string
  id?: string
  url?: string
  title?: string
  providerMetadata?: unknown
}) {
  if (part.sourceType !== 'url' || typeof part.url !== 'string') {
    return null
  }

  const providerMetadata =
    part.providerMetadata != null && typeof part.providerMetadata === 'object'
      ? (part.providerMetadata as {
          openrouter?: {
            content?: unknown
          }
        })
      : undefined

  const url = part.url.trim()
  if (!url) {
    return null
  }

  return {
    id:
      typeof part.id === 'string' && part.id.trim().length > 0 ? part.id : url,
    url,
    title: normalizeSourceText(part.title, 180),
    snippet: normalizeSourceText(providerMetadata?.openrouter?.content, 320),
    hostname: resolveSourceHostname(url),
  } satisfies MessageSource
}

function mergeMessageSources(
  currentSources: MessageSource[],
  nextSource: MessageSource,
) {
  const existingSourceIndex = currentSources.findIndex(
    (source) => source.url === nextSource.url || source.id === nextSource.id,
  )

  if (existingSourceIndex === -1) {
    return [...currentSources, nextSource]
  }

  const existingSource = currentSources[existingSourceIndex]!
  const mergedSource: MessageSource = {
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

  if (
    mergedSource.id === existingSource.id &&
    mergedSource.url === existingSource.url &&
    mergedSource.title === existingSource.title &&
    mergedSource.snippet === existingSource.snippet &&
    mergedSource.hostname === existingSource.hostname
  ) {
    return currentSources
  }

  return currentSources.map((source, index) =>
    index === existingSourceIndex ? mergedSource : source,
  )
}

function formatThreadTitlePrompt(
  content: string,
  attachments: StoredAttachment[] | undefined,
) {
  const attachmentSummary =
    attachments && attachments.length > 0
      ? attachments
          .map(
            (attachment) =>
              `${attachment.fileName} (${attachment.contentType})`,
          )
          .join(', ')
      : 'None'

  return [
    'Generate a concise title for a chat thread.',
    'Requirements:',
    '- Maximum 6 words',
    '- No quotation marks',
    '- No trailing punctuation unless essential',
    '- Focus on the user intent',
    '- Return only the title',
    '',
    'First user message:',
    content.trim() || '[No text]',
    '',
    `Attachments: ${attachmentSummary}`,
  ].join('\n')
}

function sanitizeThreadTitle(title: string) {
  const normalized = title
    .replace(/^["'\s]+|["'\s]+$/g, '')
    .replace(/\s+/g, ' ')
    .trim()

  if (!normalized) {
    return null
  }

  if (normalized.length <= 60) {
    return normalized
  }

  return `${normalized.slice(0, 57).trimEnd()}...`
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

async function getUserProfilePromptContext(
  ctx: QueryCtx | MutationCtx,
  user: {
    _id: string
    name?: string | null
  },
): Promise<UserProfilePromptContext> {
  const metadata = await ctx.db
    .query('userMetadata')
    .withIndex('by_userId', (q) => q.eq('userId', user._id))
    .unique()

  return {
    preferredName: metadata?.name ?? user.name ?? undefined,
    role: metadata?.role ?? undefined,
    traits: metadata?.traits ?? [],
    bio: metadata?.bio ?? undefined,
  }
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
      sources: message.sources ?? [],
      attachments: await resolveAttachments(ctx, message.attachments),
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
      webSearchEnabled: targetMessage.webSearchEnabled ?? false,
      webSearchMaxResults: targetMessage.webSearchMaxResults ?? 1,
      systemPrompt: buildSystemPrompt(
        await getUserProfilePromptContext(ctx, user),
      ),
      conversationMessages: await Promise.all(
        carryForwardAssistantImages(
          await Promise.all(
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
        ),
      ),
    }
  },
})

export const getTemporaryStreamSystemPrompt = internalQuery({
  args: {},
  handler: async (ctx) => {
    const user = await requireAuthenticatedUser(ctx)

    return buildSystemPrompt(await getUserProfilePromptContext(ctx, user))
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

export const getThreadTitleContext = internalQuery({
  args: {
    threadId: v.id('threads'),
    messageId: v.id('messages'),
    userId: v.string(),
  },
  handler: async (ctx, args) => {
    const thread = await ctx.db.get(args.threadId)
    if (
      !thread ||
      thread.title !== 'New chat' ||
      thread.userId !== args.userId
    ) {
      return null
    }

    const firstUserMessage = await ctx.db
      .query('messages')
      .withIndex('by_threadId_createdAt', (q) =>
        q.eq('threadId', args.threadId),
      )
      .order('asc')
      .filter((q) => q.eq(q.field('role'), 'user'))
      .first()

    if (!firstUserMessage || firstUserMessage._id !== args.messageId) {
      return null
    }

    return {
      threadId: thread._id,
      content: firstUserMessage.content,
      attachments: firstUserMessage.attachments,
    }
  },
})

export const applyGeneratedThreadTitle = internalMutation({
  args: {
    threadId: v.id('threads'),
    title: v.string(),
  },
  handler: async (ctx, args) => {
    const thread = await ctx.db.get(args.threadId)
    if (!thread || thread.title !== 'New chat') {
      return null
    }

    const title = sanitizeThreadTitle(args.title)
    if (!title) {
      return null
    }

    await ctx.db.patch(args.threadId, {
      title,
      updatedAt: Date.now(),
    })

    return title
  },
})

export const generateThreadTitle: any = action({
  args: {
    threadId: v.id('threads'),
    messageId: v.id('messages'),
    apiKey: v.string(),
  },
  handler: async (ctx, args): Promise<string | null> => {
    const user = await authComponent.safeGetAuthUser(ctx)
    if (!user) {
      throw new ConvexError('Not authenticated')
    }

    const titleContext = await ctx.runQuery(
      internalMessages.getThreadTitleContext,
      {
        threadId: args.threadId,
        messageId: args.messageId,
        userId: user._id,
      },
    )

    if (!titleContext) {
      return null
    }

    let nextTitle = deriveThreadTitle(
      titleContext.content,
      titleContext.attachments,
    )

    try {
      const result = await generateText({
        model: getOpenRouter(args.apiKey)(THREAD_TITLE_MODEL_ID),
        prompt: formatThreadTitlePrompt(
          titleContext.content,
          titleContext.attachments,
        ),
      })

      nextTitle = sanitizeThreadTitle(result.text) ?? nextTitle
    } catch (error) {
      console.error('[thread-title] generation-error', {
        threadId: args.threadId,
        messageId: args.messageId,
        error: extractRawStreamErrorMessage(error),
      })
    }

    return await ctx.runMutation(internalMessages.applyGeneratedThreadTitle, {
      threadId: args.threadId,
      title: nextTitle,
    })
  },
})

export const createThreadWithFirstMessage = mutation({
  args: {
    modelId: v.string(),
    content: v.string(),
    attachments: v.optional(v.array(attachmentValidator)),
  },
  handler: async (ctx, args) => {
    const user = await requireAuthenticatedUser(ctx)
    const content = args.content.trim()
    const attachments = args.attachments ?? []

    if (!content && attachments.length === 0) {
      throw new ConvexError('Message content or an attachment is required')
    }

    const timestamp = Date.now()
    const threadId = await ctx.db.insert('threads', {
      userId: user._id,
      title: 'New chat',
      createdAt: timestamp,
      updatedAt: timestamp,
    })

    const messageId = await ctx.db.insert('messages', {
      threadId,
      userId: user._id,
      role: 'user',
      modelId: args.modelId,
      content,
      attachments: attachments.length > 0 ? attachments : undefined,
      createdAt: timestamp,
      updatedAt: timestamp,
    })

    return {
      thread: {
        _id: threadId,
        title: 'New chat',
        createdAt: timestamp,
        updatedAt: timestamp,
      },
      message: await toClientMessage(ctx, {
        _id: messageId,
        threadId,
        userId: user._id,
        role: 'user',
        modelId: args.modelId,
        content,
        attachments: attachments.length > 0 ? attachments : undefined,
        createdAt: timestamp,
        updatedAt: timestamp,
      }),
    }
  },
})

export const importTemporaryThread = mutation({
  args: {
    messages: v.array(importedTemporaryMessageValidator),
  },
  handler: async (ctx, args) => {
    const user = await requireAuthenticatedUser(ctx)
    const importedMessages = args.messages as ImportedTemporaryMessage[]

    if (importedMessages.length === 0) {
      throw new ConvexError(
        'At least one message is required to store a temporary chat',
      )
    }

    const sortedMessages = [...importedMessages].sort(
      (left, right) =>
        left.createdAt - right.createdAt ||
        (left.updatedAt ?? left.createdAt) -
          (right.updatedAt ?? right.createdAt),
    )
    const lastMessage = sortedMessages[sortedMessages.length - 1]
    const threadCreatedAt = sortedMessages[0]?.createdAt ?? Date.now()
    const threadUpdatedAt =
      lastMessage?.updatedAt ?? lastMessage?.createdAt ?? threadCreatedAt

    const threadId = await ctx.db.insert('threads', {
      userId: user._id,
      title: 'New chat',
      createdAt: threadCreatedAt,
      updatedAt: threadUpdatedAt,
    })

    const persistedMessages = await Promise.all(
      sortedMessages.map(async (message) => {
        const messageId = await ctx.db.insert('messages', {
          threadId,
          userId: user._id,
          role: message.role,
          modelId: message.modelId,
          content: message.content.trim(),
          reasoningText: message.reasoningText,
          sources: message.sources,
          attachments:
            message.attachments && message.attachments.length > 0
              ? message.attachments
              : undefined,
          errorMessage: message.errorMessage,
          generationStats: message.generationStats,
          createdAt: message.createdAt,
          updatedAt: message.updatedAt ?? message.createdAt,
        })

        return await toClientMessage(ctx, {
          _id: messageId,
          threadId,
          userId: user._id,
          role: message.role,
          modelId: message.modelId,
          content: message.content.trim(),
          reasoningText: message.reasoningText,
          sources: message.sources,
          attachments:
            message.attachments && message.attachments.length > 0
              ? message.attachments
              : undefined,
          errorMessage: message.errorMessage,
          generationStats: message.generationStats,
          createdAt: message.createdAt,
          updatedAt: message.updatedAt ?? message.createdAt,
        })
      }),
    )

    return {
      thread: {
        _id: threadId,
        title: 'New chat',
        createdAt: threadCreatedAt,
        updatedAt: threadUpdatedAt,
      },
      messages: persistedMessages,
    }
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
    const { user } = await getAuthorizedThread(ctx, args.threadId)
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
    } = {
      updatedAt: timestamp,
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
    webSearchEnabled: v.optional(v.boolean()),
    webSearchMaxResults: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const webSearchConfig = resolveWebSearchConfig({
      webSearchEnabled: args.webSearchEnabled,
      webSearchMaxResults: args.webSearchMaxResults,
    })
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
      reasoningText: undefined,
      sources: undefined,
      streamId,
      webSearchEnabled: webSearchConfig.webSearchEnabled,
      webSearchMaxResults: webSearchConfig.webSearchMaxResults,
      stopRequestedAt: undefined,
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
      reasoningText: undefined,
      sources: [],
      streamId,
      errorMessage: undefined,
      createdAt: timestamp,
      updatedAt: timestamp,
    })
  },
})

export const abortAssistantReply = mutation({
  args: {
    streamId: v.string(),
  },
  handler: async (ctx, args) => {
    const message = await getMessageByStreamId(ctx, args.streamId)
    if (!message) {
      return null
    }

    await getAuthorizedThread(ctx, message.threadId)

    if (
      !message.streamId ||
      (message.errorMessage && message.errorMessage.length > 0)
    ) {
      return null
    }

    await ctx.db.patch(message._id, {
      stopRequestedAt: Date.now(),
    })

    return {
      messageId: message._id,
    }
  },
})

export const forceStopAssistantReply = mutation({
  args: {
    streamId: v.string(),
  },
  handler: async (ctx, args) => {
    const message = await getMessageByStreamId(ctx, args.streamId)
    if (!message?.streamId) {
      return null
    }

    await getAuthorizedThread(ctx, message.threadId)

    const streamBody = await persistentTextStreaming.getStreamBody(
      ctx,
      message.streamId as StreamId,
    )
    if (
      streamBody.status === 'done' ||
      streamBody.status === 'error' ||
      streamBody.status === 'timeout'
    ) {
      return null
    }

    const timestamp = Date.now()
    const errorMessage = 'Stopped generating.'

    await ctx.db.patch(message._id, {
      stopRequestedAt: message.stopRequestedAt ?? timestamp,
      errorMessage,
      updatedAt: timestamp,
    })
    await ctx.runMutation(persistentTextStreaming.component.lib.setStreamStatus, {
      streamId: message.streamId as StreamId,
      status: 'error',
    })

    return {
      messageId: message._id,
      errorMessage,
    }
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

export const appendAssistantReplyAttachment = internalMutation({
  args: {
    streamId: v.string(),
    attachment: attachmentValidator,
  },
  handler: async (ctx, args) => {
    const message = await getMessageByStreamId(ctx, args.streamId)
    if (!message) {
      return
    }

    const currentAttachments = message.attachments ?? []
    const alreadyExists = currentAttachments.some(
      (attachment) => attachment.storageId === args.attachment.storageId,
    )

    if (alreadyExists) {
      return
    }

    await ctx.db.patch(message._id, {
      attachments: [...currentAttachments, args.attachment],
      updatedAt: Date.now(),
    })
  },
})

export const markAssistantReplyCompleted = internalMutation({
  args: {
    streamId: v.string(),
    generationStats: generationStatsValidator,
  },
  handler: async (ctx, args) => {
    const message = await getMessageByStreamId(ctx, args.streamId)
    if (!message) {
      return
    }

    await ctx.db.patch(message._id, {
      generationStats: args.generationStats,
      updatedAt: Date.now(),
    })
  },
})

export const setAssistantReplyReasoning = internalMutation({
  args: {
    streamId: v.string(),
    reasoningText: v.string(),
  },
  handler: async (ctx, args) => {
    const message = await getMessageByStreamId(ctx, args.streamId)
    if (!message) {
      return
    }

    await ctx.db.patch(message._id, {
      reasoningText: args.reasoningText,
    })
  },
})

export const setAssistantReplySources = internalMutation({
  args: {
    streamId: v.string(),
    sources: v.array(sourceValidator),
  },
  handler: async (ctx, args) => {
    const message = await getMessageByStreamId(ctx, args.streamId)
    if (!message) {
      return
    }

    await ctx.db.patch(message._id, {
      sources: args.sources.length > 0 ? args.sources : undefined,
      updatedAt: Date.now(),
    })
  },
})

export const getAssistantReplyStopState = internalQuery({
  args: {
    streamId: v.string(),
  },
  returns: v.object({
    stopRequested: v.boolean(),
    errorMessage: v.optional(v.string()),
  }),
  handler: async (ctx, args) => {
    const message = await getMessageByStreamId(ctx, args.streamId)

    return {
      stopRequested: Boolean(message?.stopRequestedAt),
      errorMessage: message?.errorMessage,
    }
  },
})

export const streamAssistantReply = httpAction(async (ctx, request) => {
  const payload = (await request.json()) as {
    streamId?: string
    apiKey?: string
  }
  const streamId = payload.streamId
  const requestApiKey =
    typeof payload.apiKey === 'string' && payload.apiKey.trim().length > 0
      ? payload.apiKey.trim()
      : undefined
  const hasAuthorizationHeader = Boolean(request.headers.get('authorization'))
  const hasOpenRouterApiKey = Boolean(resolveOpenRouterApiKey(requestApiKey))

  console.log('[stream:http] request', {
    streamId,
    hasAuthorizationHeader,
    hasOpenRouterApiKey,
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
    webSearchEnabled: boolean
    webSearchMaxResults: number
    systemPrompt: string
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
      internalMessages.getStreamGenerationContext,
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
    await Promise.all(
      generationContext.conversationMessages.map(async (message) => ({
        ...message,
        attachments: await resolveModelAttachments(ctx, message.attachments),
      })),
    ),
  )
  let webSearchConfig:
    | {
        webSearchEnabled: boolean
        webSearchMaxResults?: number
      }
    | undefined
  try {
    webSearchConfig = resolveWebSearchConfig({
      webSearchEnabled: generationContext.webSearchEnabled,
      webSearchMaxResults: generationContext.webSearchMaxResults,
    })
  } catch (error) {
    const errorMessage =
      error instanceof Error
        ? error.message
        : 'Invalid web search configuration.'
    return applyCorsHeaders(
      new Response(errorMessage, { status: 400 }),
      request,
    )
  }
  const modelId = await getOpenRouterModelId(generationContext.modelId)
  let openrouter: ReturnType<typeof createOpenRouter>
  try {
    openrouter = getOpenRouter(requestApiKey)
  } catch (error) {
    const errorMessage =
      error instanceof Error
        ? error.message
        : 'An OpenRouter API key is required. Add it in Settings > API Keys and try again.'

    console.warn('[stream:http] missing-provider-key', {
      streamId,
      userId: user._id,
      modelId,
    })

    return applyCorsHeaders(
      new Response(errorMessage, { status: 400 }),
      request,
    )
  }

  console.log('[stream:http] generation-start', {
    streamId,
    userId: user._id,
    modelId,
    messageCount: conversationMessages.length,
    hasOpenRouterApiKey,
  })

  const streamState = await ctx.runQuery(
    persistentTextStreaming.component.lib.getStreamStatus,
    {
      streamId: streamId as StreamId,
    },
  )
  if (streamState !== 'pending') {
    return applyCorsHeaders(
      new Response('', {
        status: 205,
      }),
      request,
    )
  }

  let chunkCount = 0
  let response: Response
  try {
    const { readable, writable } = new TransformStream()
    const writer = writable.getWriter()
    const textEncoder = new TextEncoder()
    let writerClosed = false
    let writerDisconnected = false

    const closeWriter = async () => {
      if (writerClosed || writerDisconnected) {
        return
      }

      writerClosed = true
      try {
        await writer.close()
      } catch {
        writerDisconnected = true
      }
    }

    const writeEvent = async (event: StreamEvent) => {
      if (writerClosed || writerDisconnected) {
        return
      }

      try {
        await writer.write(textEncoder.encode(encodeStreamEvent(event)))
      } catch {
        writerDisconnected = true
      }
    }

    const doStream = async () => {
      let streamFailureMessage: string | undefined
      let rawStreamFailureMessage: string | undefined
      const generationStartedAt = Date.now()
      const reasoningFlushThreshold = 96
      const generationAbortController = new AbortController()
      let firstTextDeltaAt: number | undefined
      let reasoningText = ''
      let sources: MessageSource[] = []
      let lastPersistedReasoningText = ''
      let costUsd: number | undefined
      let persistedText = ''
      let generatedAttachmentCount = 0
      let totalUsage:
        | {
            inputTokens?: number
            outputTokens?: number
            totalTokens?: number
            outputTokenDetails?: {
              textTokens?: number
              reasoningTokens?: number
            }
          }
        | undefined
      const stopPollingInterval = setInterval(() => {
        void ctx
          .runQuery(internalMessages.getAssistantReplyStopState, {
            streamId,
          })
          .then(({ stopRequested }) => {
            if (stopRequested) {
              generationAbortController.abort()
            }
          })
          .catch((error) => {
            console.error('[stream:http] stop-state-error', {
              streamId,
              userId: user._id,
              modelId,
              error: error instanceof Error ? error.message : String(error),
            })
          })
      }, 250)

      const flushPersistedText = async (final = false) => {
        if (!persistedText) {
          if (final) {
            await ctx.runMutation(
              persistentTextStreaming.component.lib.setStreamStatus,
              {
                streamId: streamId as StreamId,
                status: 'done',
              },
            )
          }
          return
        }

        await ctx.runMutation(persistentTextStreaming.component.lib.addChunk, {
          streamId: streamId as StreamId,
          text: persistedText,
          final,
        })
        persistedText = ''
      }

      try {
        const result = streamText({
          model: openrouter(modelId),
          system: generationContext.systemPrompt,
          messages: conversationMessages,
          providerOptions: getOpenRouterChatProviderOptions(webSearchConfig),
          abortSignal: generationAbortController.signal,
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

        const flushReasoningText = async (force = false) => {
          if (!reasoningText || reasoningText === lastPersistedReasoningText) {
            return
          }

          if (
            !force &&
            reasoningText.length - lastPersistedReasoningText.length <
              reasoningFlushThreshold
          ) {
            return
          }

          lastPersistedReasoningText = reasoningText
          await ctx.runMutation(internalMessages.setAssistantReplyReasoning, {
            streamId,
            reasoningText,
          })
        }

        for await (const part of result.fullStream) {
          switch (part.type) {
            case 'source': {
              const nextSource = toMessageSource(part)
              if (!nextSource) {
                break
              }

              const nextSources = mergeMessageSources(sources, nextSource)
              if (nextSources === sources) {
                break
              }

              sources = nextSources
              await writeEvent({
                type: 'source',
                source: nextSource,
              })
              await ctx.runMutation(internalMessages.setAssistantReplySources, {
                streamId,
                sources,
              })
              break
            }
            case 'reasoning-delta': {
              reasoningText += part.text
              await writeEvent({
                type: 'reasoning-delta',
                text: part.text,
              })
              await flushReasoningText()
              break
            }
            case 'text-delta': {
              chunkCount += 1
              firstTextDeltaAt ??= Date.now()
              if (chunkCount <= 3 || chunkCount % 25 === 0) {
                console.log('[stream:http] chunk', {
                  streamId,
                  userId: user._id,
                  chunkCount,
                  chunkLength: part.text.length,
                })
              }

              await writeEvent({
                type: 'text-delta',
                text: part.text,
              })
              persistedText += part.text
              if (shouldPersistChunk(part.text)) {
                await flushPersistedText(false)
              }
              break
            }
            case 'reasoning-end': {
              await flushReasoningText(true)
              break
            }
            case 'file': {
              generatedAttachmentCount += 1
              const attachment = await storeGeneratedAttachment(
                ctx,
                part.file,
                generatedAttachmentCount,
              )
              await writeEvent({
                type: 'attachment',
                attachment,
              })
              await ctx.runMutation(
                internalMessages.appendAssistantReplyAttachment,
                {
                  streamId,
                  attachment: {
                    kind: attachment.kind,
                    storageId: attachment.storageId,
                    fileName: attachment.fileName,
                    contentType: attachment.contentType,
                    size: attachment.size,
                  },
                },
              )
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
            case 'finish': {
              totalUsage = part.totalUsage
              break
            }
            case 'finish-step': {
              costUsd = extractOpenRouterCostUsd(part.providerMetadata)
              break
            }
            default: {
              break
            }
          }
        }

        if (streamFailureMessage) {
          throw new Error(streamFailureMessage)
        }

        await flushReasoningText(true)
        await flushPersistedText(true)

        const generationStats = buildGenerationStats({
          startedAt: generationStartedAt,
          firstTextDeltaAt,
          completedAt: Date.now(),
          costUsd,
          totalUsage,
        })

        if (generationStats) {
          await ctx.runMutation(internalMessages.markAssistantReplyCompleted, {
            streamId,
            generationStats,
          })
        }

        await closeWriter()
      } catch (error) {
        const errorMessage =
          streamFailureMessage ?? formatStreamErrorMessage(error)
        const rawErrorMessage =
          rawStreamFailureMessage ?? extractRawStreamErrorMessage(error)

        await ctx.runMutation(
          persistentTextStreaming.component.lib.setStreamStatus,
          {
            streamId: streamId as StreamId,
            status: 'error',
          },
        )
        await ctx.runMutation(internalMessages.markAssistantReplyError, {
          streamId,
          errorMessage,
        })
        await writeEvent({
          type: 'error',
          errorMessage,
        })
        await closeWriter()
        throw error instanceof Error ? error : new Error(rawErrorMessage)
      } finally {
        clearInterval(stopPollingInterval)
      }
    }

    void doStream().catch((error) => {
      console.error('[stream:http] stream-task-failed', {
        streamId,
        userId: user._id,
        modelId,
        error: error instanceof Error ? error.message : String(error),
      })
    })

    response = new Response(readable, {
      headers: {
        'Content-Type': 'application/x-ndjson; charset=utf-8',
        'Cache-Control': 'no-cache, no-transform',
      },
    })
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

function isTemporaryStreamAttachment(
  attachment: unknown,
): attachment is TemporaryStreamAttachment {
  return (
    attachment != null &&
    typeof attachment === 'object' &&
    'kind' in attachment &&
    ((attachment as { kind?: unknown }).kind === 'image' ||
      (attachment as { kind?: unknown }).kind === 'file') &&
    typeof (attachment as { storageId?: unknown }).storageId === 'string' &&
    typeof (attachment as { fileName?: unknown }).fileName === 'string' &&
    typeof (attachment as { contentType?: unknown }).contentType === 'string' &&
    typeof (attachment as { size?: unknown }).size === 'number'
  )
}

function isTemporaryStreamMessage(
  message: unknown,
): message is TemporaryStreamRequestMessage {
  return (
    message != null &&
    typeof message === 'object' &&
    'role' in message &&
    ((message as { role?: unknown }).role === 'user' ||
      (message as { role?: unknown }).role === 'system') &&
    typeof (message as { content?: unknown }).content === 'string' &&
    (!('attachments' in message) ||
      (Array.isArray((message as { attachments?: unknown }).attachments) &&
        ((message as { attachments?: unknown[] }).attachments ?? []).every(
          isTemporaryStreamAttachment,
        )))
  )
}

export const streamTemporaryAssistantReply = httpAction(
  async (ctx, request) => {
    const payload = (await request.json()) as {
      modelId?: string
      messages?: unknown
      apiKey?: string
      webSearchEnabled?: boolean
      webSearchMaxResults?: number
    }
    const requestApiKey =
      typeof payload.apiKey === 'string' && payload.apiKey.trim().length > 0
        ? payload.apiKey.trim()
        : undefined

    if (
      typeof payload.modelId !== 'string' ||
      payload.modelId.trim().length === 0 ||
      !Array.isArray(payload.messages) ||
      !payload.messages.every(isTemporaryStreamMessage)
    ) {
      return applyCorsHeaders(
        new Response('Invalid temporary chat payload', {
          status: 400,
        }),
        request,
      )
    }

    const user = await authComponent.safeGetAuthUser(ctx)
    if (!user) {
      return applyCorsHeaders(
        new Response('Not authenticated', {
          status: 401,
        }),
        request,
      )
    }

    const systemPrompt = await ctx.runQuery(
      internalMessages.getTemporaryStreamSystemPrompt,
      {},
    )
    let webSearchConfig:
      | {
          webSearchEnabled: boolean
          webSearchMaxResults?: number
        }
      | undefined
    try {
      webSearchConfig = resolveWebSearchConfig({
        webSearchEnabled: payload.webSearchEnabled,
        webSearchMaxResults: payload.webSearchMaxResults,
      })
    } catch (error) {
      const errorMessage =
        error instanceof Error
          ? error.message
          : 'Invalid web search configuration.'
      return applyCorsHeaders(
        new Response(errorMessage, { status: 400 }),
        request,
      )
    }
  const conversationMessages = toModelMessages(
    await Promise.all(
      carryForwardAssistantImages(payload.messages).map(async (message) => ({
        role: message.role,
        content: message.content,
        attachments: await resolveTemporaryModelAttachments(ctx, message.attachments),
      })),
    ),
  )
    const modelId = await getOpenRouterModelId(payload.modelId)
    let openrouter: ReturnType<typeof createOpenRouter>
    try {
      openrouter = getOpenRouter(requestApiKey)
    } catch (error) {
      const errorMessage =
        error instanceof Error
          ? error.message
          : 'An OpenRouter API key is required. Add it in Settings > API Keys and try again.'
      return applyCorsHeaders(
        new Response(errorMessage, { status: 400 }),
        request,
      )
    }

    let response: Response
    try {
      const { readable, writable } = new TransformStream()
      const writer = writable.getWriter()
      const textEncoder = new TextEncoder()
      let writerClosed = false
      let writerDisconnected = false

      const closeWriter = async () => {
        if (writerClosed || writerDisconnected) {
          return
        }

        writerClosed = true
        try {
          await writer.close()
        } catch {
          writerDisconnected = true
        }
      }

      const writeEvent = async (event: StreamEvent) => {
        if (writerClosed || writerDisconnected) {
          return
        }

        try {
          await writer.write(textEncoder.encode(encodeStreamEvent(event)))
        } catch {
          writerDisconnected = true
        }
      }

      const doStream = async () => {
        let streamFailureMessage: string | undefined
        let rawStreamFailureMessage: string | undefined
        const generationStartedAt = Date.now()
        const generationAbortController = new AbortController()
        let firstTextDeltaAt: number | undefined
        let reasoningText = ''
        let sources: MessageSource[] = []
        let costUsd: number | undefined
        let generatedAttachmentCount = 0
        let totalUsage:
          | {
              inputTokens?: number
              outputTokens?: number
              totalTokens?: number
              outputTokenDetails?: {
                textTokens?: number
                reasoningTokens?: number
              }
            }
          | undefined

        request.signal.addEventListener(
          'abort',
          () => {
            generationAbortController.abort()
          },
          { once: true },
        )

        try {
          const result = streamText({
            model: openrouter(modelId),
            system: systemPrompt,
            messages: conversationMessages,
            providerOptions: getOpenRouterChatProviderOptions(webSearchConfig),
            abortSignal: generationAbortController.signal,
            onError({ error }) {
              rawStreamFailureMessage = extractRawStreamErrorMessage(error)
              streamFailureMessage = formatStreamErrorMessage(error)
            },
          })

          for await (const part of result.fullStream) {
            switch (part.type) {
              case 'source': {
                const nextSource = toMessageSource(part)
                if (!nextSource) {
                  break
                }

                const nextSources = mergeMessageSources(sources, nextSource)
                if (nextSources === sources) {
                  break
                }

                sources = nextSources
                await writeEvent({
                  type: 'source',
                  source: nextSource,
                })
                break
              }
              case 'reasoning-delta': {
                reasoningText += part.text
                await writeEvent({
                  type: 'reasoning-delta',
                  text: part.text,
                })
                break
              }
              case 'text-delta': {
                firstTextDeltaAt ??= Date.now()
                await writeEvent({
                  type: 'text-delta',
                  text: part.text,
                })
                break
              }
              case 'file': {
                generatedAttachmentCount += 1
                const attachment = await storeGeneratedAttachment(
                  ctx,
                  part.file,
                  generatedAttachmentCount,
                )
                await writeEvent({
                  type: 'attachment',
                  attachment,
                })
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
              case 'finish': {
                totalUsage = part.totalUsage
                break
              }
              case 'finish-step': {
                costUsd = extractOpenRouterCostUsd(part.providerMetadata)
                break
              }
              default: {
                break
              }
            }
          }

          if (streamFailureMessage) {
            throw new Error(streamFailureMessage)
          }

          await writeEvent({
            type: 'finish',
            generationStats: buildGenerationStats({
              startedAt: generationStartedAt,
              firstTextDeltaAt,
              completedAt: Date.now(),
              costUsd,
              totalUsage,
            }),
          })
          await closeWriter()
        } catch (error) {
          const errorMessage =
            streamFailureMessage ?? formatStreamErrorMessage(error)
          const rawErrorMessage =
            rawStreamFailureMessage ?? extractRawStreamErrorMessage(error)

          await writeEvent({
            type: 'error',
            errorMessage,
          })
          await closeWriter()
          throw error instanceof Error ? error : new Error(rawErrorMessage)
        }
      }

      void doStream().catch((error) => {
        console.error('[temp-stream:http] stream-task-failed', {
          userId: user._id,
          modelId,
          error: error instanceof Error ? error.message : String(error),
        })
      })

      response = new Response(readable, {
        headers: {
          'Content-Type': 'application/x-ndjson; charset=utf-8',
          'Cache-Control': 'no-cache, no-transform',
        },
      })
    } catch (error) {
      console.error('[temp-stream:http] generation-error', {
        userId: user._id,
        modelId,
        error: error instanceof Error ? error.message : String(error),
      })
      return applyCorsHeaders(
        new Response('Temporary reply failed to stream', {
          status: 500,
        }),
        request,
      )
    }

    return applyCorsHeaders(response, request)
  },
)

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

export const getUsageStats = query({
  args: {},
  handler: async (ctx) => {
    const user = await authComponent.safeGetAuthUser(ctx)
    if (!user) {
      return null
    }

    const messages = await ctx.db
      .query('messages')
      .withIndex('by_userId', (q) => q.eq('userId', user._id))
      .collect()

    let totalInputTokens = 0
    let totalOutputTokens = 0
    let totalTokens = 0
    let totalCostUsd = 0
    let messageCount = 0

    for (const msg of messages) {
      if (msg.generationStats) {
        totalInputTokens += msg.generationStats.inputTokens ?? 0
        totalOutputTokens += msg.generationStats.outputTokens ?? 0
        totalTokens += msg.generationStats.totalTokens ?? 0
        totalCostUsd += msg.generationStats.costUsd ?? 0
        messageCount++
      }
    }

    return {
      totalInputTokens,
      totalOutputTokens,
      totalTokens,
      totalCostUsd,
      messageCount,
    }
  },
})
