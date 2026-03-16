import { api } from '@based-chat/backend/convex/_generated/api'
import { Button } from '@based-chat/ui/components/button'
import { Textarea } from '@based-chat/ui/components/textarea'
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from '@based-chat/ui/components/tooltip'
import { cn } from '@based-chat/ui/lib/utils'
import {
  ArrowUp,
  Brain,
  ChevronDown,
  Clock3,
  Copy,
  Cpu,
  ExternalLink,
  FileCode2,
  FileText,
  Globe,
  Pencil,
  Paperclip,
  RotateCcw,
  Sparkles,
  X,
  Zap,
} from 'lucide-react'
import { memo, type ReactNode, useEffect, useMemo, useRef, useState } from 'react'
import { toast } from 'sonner'

import type { ComposerAttachment } from '@/lib/attachments'
import {
  isImageAttachment,
  MAX_ATTACHMENTS,
  prepareDraftAttachments,
  revokeComposerAttachmentPreview,
} from '@/lib/attachments'
import { usePersistentTextStream } from '@/lib/persistent-text-stream'
import type { ChatMessage, ChatMessageSource } from '@/lib/chat'
import {
  getModelAttachmentInputAccept,
  modelCanAcceptAttachments,
  modelSupportsAttachment,
  type Model,
} from '@/lib/models'

import ChatAttachmentStrip from './chat-attachment-strip'
import ChatAttachmentDialog from './chat-attachment-dialog'
import ModelSelector from './model-selector'
import MarkdownRenderer from './markdown-renderer'
import type { StreamId } from '@convex-dev/persistent-text-streaming'

function areMessageAttachmentsEqual(
  left: ChatMessage['attachments'],
  right: ChatMessage['attachments'],
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

function areComposerAttachmentsEqual(
  left: ComposerAttachment[],
  right: ComposerAttachment[],
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
      attachment.id === otherAttachment.id &&
      attachment.source === otherAttachment.source &&
      attachment.kind === otherAttachment.kind &&
      attachment.fileName === otherAttachment.fileName &&
      attachment.contentType === otherAttachment.contentType &&
      attachment.size === otherAttachment.size &&
      attachment.previewUrl === otherAttachment.previewUrl &&
      ('storageId' in attachment
        ? attachment.storageId ===
          (('storageId' in otherAttachment
            ? otherAttachment.storageId
            : undefined) ?? undefined)
        : !('storageId' in (otherAttachment ?? {})))
    )
  })
}

function areMessageSourcesEqual(
  left: ChatMessage['sources'],
  right: ChatMessage['sources'],
) {
  if (left.length !== right.length) {
    return false
  }

  return left.every((source, index) => {
    const otherSource = right[index]
    if (!otherSource) {
      return false
    }

    return (
      source.id === otherSource.id &&
      source.url === otherSource.url &&
      source.title === otherSource.title &&
      source.snippet === otherSource.snippet &&
      source.hostname === otherSource.hostname
    )
  })
}

function areMessagesEqual(left: ChatMessage, right: ChatMessage) {
  return (
    left.id === right.id &&
    left.threadId === right.threadId &&
    left.role === right.role &&
    left.content === right.content &&
    left.reasoningText === right.reasoningText &&
    areMessageSourcesEqual(left.sources, right.sources) &&
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

const integerFormatter = new Intl.NumberFormat('en-US')

function formatTokensPerSecond(tokensPerSecond: number) {
  return `${tokensPerSecond.toFixed(2)} tok/sec`
}

function formatCostUsd(costUsd: number) {
  return costUsd.toFixed(costUsd >= 0.01 ? 4 : 6)
}

function formatTokenCount(tokenCount: number) {
  return `${integerFormatter.format(tokenCount)} tokens`
}

function formatTimeToFirstToken(timeToFirstTokenMs: number) {
  return `Time-to-First: ${(timeToFirstTokenMs / 1000).toFixed(1)} sec`
}

function getSourceTitle(source: ChatMessageSource) {
  return source.title || source.hostname || formatSourceUrl(source.url)
}

function formatSourceUrl(url: string) {
  try {
    const parsedUrl = new URL(url)
    const hostname = parsedUrl.hostname.replace(/^www\./, '')
    const pathname =
      parsedUrl.pathname === '/' ? '' : parsedUrl.pathname.replace(/\/$/, '')

    return `${hostname}${pathname}${parsedUrl.search}`
  } catch {
    return url.replace(/^https?:\/\//, '')
  }
}

function getSourceHostname(source: ChatMessageSource) {
  return source.hostname || formatSourceUrl(source.url).split('/')[0] || 'web'
}

function SearchSection({
  icon,
  label,
  isOpen,
  onToggle,
  children,
  className,
}: {
  icon: ReactNode
  label: string
  isOpen: boolean
  onToggle: () => void
  children: ReactNode
  className?: string
}) {
  return (
    <div className={cn('w-full max-w-full md:max-w-[min(56rem,86vw)]', className)}>
      <button
        type='button'
        onClick={onToggle}
        className='inline-flex items-center gap-2 rounded-full px-1 py-1 text-sm font-medium text-foreground/90 transition-colors hover:text-foreground'
        aria-expanded={isOpen}
      >
        {icon}
        <span>{label}</span>
        <ChevronDown
          className={cn(
            'size-4 text-muted-foreground transition-transform duration-200',
            isOpen && 'rotate-180',
          )}
        />
      </button>
      <div
        className={cn(
          'grid transition-all duration-200 ease-out',
          isOpen
            ? 'mt-3 grid-rows-[1fr] opacity-100'
            : 'mt-1 grid-rows-[0fr] opacity-80',
        )}
      >
        <div className='overflow-hidden'>{children}</div>
      </div>
    </div>
  )
}

function SearchGroundingList({
  sources,
}: {
  sources: ChatMessage['sources']
}) {
  return (
    <div className='rounded-[26px] border border-border/50 bg-card/55 px-5 py-5 shadow-sm backdrop-blur-sm'>
      <div className='flex flex-col gap-3'>
        {sources.map((source) => {
          const sourceTitle = getSourceTitle(source)
          const sourceHostname = getSourceHostname(source)

          return (
            <div
              key={source.id}
              className='rounded-[22px] border border-border/40 bg-background/25 px-4 py-4'
            >
              <div className='flex flex-wrap items-center gap-x-2 gap-y-1 text-[11px] uppercase tracking-[0.16em] text-muted-foreground/70'>
                <span>{sourceHostname}</span>
                <a
                  href={source.url}
                  target='_blank'
                  rel='noreferrer'
                  className='inline-flex items-center gap-1 text-foreground/75 transition-colors hover:text-foreground'
                >
                  <span>Open source</span>
                  <ExternalLink className='size-3' />
                </a>
              </div>
              <a
                href={source.url}
                target='_blank'
                rel='noreferrer'
                className='mt-2 block text-[15px] font-medium leading-6 text-foreground transition-colors hover:text-primary'
              >
                {sourceTitle}
              </a>
              {source.snippet ? (
                <p className='mt-2 text-sm leading-7 text-muted-foreground/92'>
                  {source.snippet}
                </p>
              ) : (
                <p className='mt-2 text-sm leading-7 text-muted-foreground/75'>
                  {formatSourceUrl(source.url)}
                </p>
              )}
            </div>
          )
        })}
      </div>
    </div>
  )
}

function MessageAttachmentGrid({
  attachments,
  align = 'start',
  onOpen,
}: {
  attachments: ChatMessage['attachments']
  align?: 'start' | 'end'
  onOpen: (attachmentId: string) => void
}) {
  if (attachments.length === 0) {
    return null
  }

  const imageAttachments = attachments.filter(isImageAttachment)
  const fileAttachments = attachments.filter(
    (attachment) => !isImageAttachment(attachment),
  )

  const getFileIcon = (contentType: string) => {
    if (
      contentType.startsWith('text/') ||
      contentType.includes('json') ||
      contentType.includes('javascript') ||
      contentType.includes('typescript')
    ) {
      return FileCode2
    }

    return FileText
  }

  return (
    <div className={cn('space-y-2', align === 'end' && 'self-end')}>
      {imageAttachments.length > 0 ? (
        <div
          className={cn(
            'grid max-w-full grid-cols-2 gap-2 sm:max-w-[min(36rem,72vw)]',
            imageAttachments.length === 1 && 'grid-cols-1',
          )}
        >
          {imageAttachments.map((attachment) => (
            <button
              key={attachment.storageId}
              type='button'
              onClick={() => onOpen(attachment.storageId)}
              className='group/attachment relative overflow-hidden rounded-[22px] border border-border/60 bg-card/60 text-left shadow-sm transition-transform hover:-translate-y-0.5'
            >
              {attachment.url ? (
                <img
                  src={attachment.url}
                  alt={attachment.fileName}
                  loading='lazy'
                  decoding='async'
                  className={cn(
                    'w-full object-cover transition-transform duration-300 group-hover/attachment:scale-[1.03]',
                    imageAttachments.length === 1 ? 'max-h-104' : 'h-44',
                  )}
                />
              ) : (
                <div
                  className={cn(
                    'flex items-center justify-center bg-muted/40 text-xs text-muted-foreground',
                    imageAttachments.length === 1 ? 'h-64' : 'h-44',
                  )}
                >
                  Preview unavailable
                </div>
              )}
              <div className='absolute inset-x-0 bottom-0 bg-linear-to-t from-black/80 via-black/35 to-transparent px-3 py-2 text-white'>
                <p className='truncate text-xs font-medium'>
                  {attachment.fileName}
                </p>
              </div>
            </button>
          ))}
        </div>
      ) : null}

      {fileAttachments.length > 0 ? (
        <div className='flex flex-wrap gap-2'>
          {fileAttachments.map((attachment) => {
            const FileIcon = getFileIcon(attachment.contentType)

            return (
              <button
                key={attachment.storageId}
                type='button'
                onClick={() => onOpen(attachment.storageId)}
                className='flex w-full min-w-0 items-start gap-3 rounded-2xl border border-border/50 bg-card/50 px-3 py-2.5 text-left shadow-sm transition-transform hover:-translate-y-0.5 sm:min-w-48 sm:max-w-[16rem]'
              >
                <div className='flex size-10 shrink-0 items-center justify-center rounded-2xl bg-muted/50 text-muted-foreground'>
                  <FileIcon className='size-4' />
                </div>
                <div className='min-w-0 flex-1'>
                  <p className='truncate text-xs font-medium'>
                    {attachment.fileName}
                  </p>
                  <p className='mt-1 text-[11px] text-muted-foreground/70'>
                    {Math.max(1, Math.round(attachment.size / 1024))} KB
                  </p>
                </div>
              </button>
            )
          })}
        </div>
      ) : null}
    </div>
  )
}

function MessageBubble({
  message,
  driveStream = false,
  streamUrl,
  onStreamStatusChange,
  onRetry,
  onEdit,
  isEditing = false,
  editingValue = '',
  editingModel,
  editingAttachments = [],
  onEditingValueChange,
  onEditingModelChange,
  onEditingAttachmentsChange,
  onCancelEdit,
  onSaveEdit,
}: {
  message: ChatMessage
  driveStream?: boolean
  streamUrl: URL
  onStreamStatusChange?: (status: ChatMessage['streamStatus']) => void
  onRetry?: () => void
  onEdit?: () => void
  isEditing?: boolean
  editingValue?: string
  editingModel?: Model
  editingAttachments?: ComposerAttachment[]
  onEditingValueChange?: (value: string) => void
  onEditingModelChange?: (model: Model) => void
  onEditingAttachmentsChange?: (attachments: ComposerAttachment[]) => void
  onCancelEdit?: () => void
  onSaveEdit?: () => void
}) {
  const isUser = message.role === 'user'
  const modelLabel = message.model?.name ?? message.modelId ?? 'Assistant'
  const [selectedAttachmentId, setSelectedAttachmentId] = useState<
    string | null
  >(null)
  const [fileInputKey, setFileInputKey] = useState(0)
  const reportedStreamStatusRef = useRef<
    ChatMessage['streamStatus'] | undefined
  >(undefined)
  const liveStreamId =
    message.streamId &&
    (driveStream ||
      message.streamStatus === 'pending' ||
      message.streamStatus === 'streaming' ||
      message.streamStatus === 'error' ||
      message.streamStatus === 'timeout')
      ? message.streamId
      : undefined
  const liveStream = usePersistentTextStream(
    (api.messages as { getStreamBody: any }).getStreamBody,
    streamUrl,
    driveStream,
    liveStreamId as StreamId,
  )
  const streamStatus = liveStreamId ? liveStream.status : message.streamStatus
  const streamErrorMessage = liveStreamId
    ? (liveStream.errorMessage ?? message.errorMessage)
    : message.errorMessage
  const displayContent =
    liveStreamId && liveStream.text.length > 0
      ? liveStream.text
      : message.content
  const reasoningText =
    (liveStreamId ? liveStream.reasoningText : undefined)?.trim() ??
    message.reasoningText?.trim()
  const sources = liveStreamId ? liveStream.sources : message.sources
  const isStreaming =
    !isUser && (streamStatus === 'pending' || streamStatus === 'streaming')
  const hasStreamError =
    !isUser && (streamStatus === 'error' || streamStatus === 'timeout')
  const tokenCount =
    message.generationStats?.textTokens ??
    message.generationStats?.outputTokens ??
    message.generationStats?.totalTokens
  const dialogAttachments = useMemo(
    () =>
      message.attachments.map((attachment) => ({
        id: attachment.storageId,
        kind: attachment.kind,
        fileName: attachment.fileName,
        contentType: attachment.contentType,
        size: attachment.size,
        url: attachment.url,
      })),
    [message.attachments],
  )
  const [isReasoningOpen, setIsReasoningOpen] = useState(false)
  const [isGroundingOpen, setIsGroundingOpen] = useState(false)
  const canAttachToEditingModel = editingModel
    ? modelCanAcceptAttachments(editingModel)
    : false
  const editingAttachmentInputAccept = editingModel
    ? getModelAttachmentInputAccept(editingModel)
    : undefined

  useEffect(() => {
    reportedStreamStatusRef.current = undefined
  }, [message.id, message.streamId])

  useEffect(() => {
    setIsReasoningOpen(false)
    setIsGroundingOpen(false)
  }, [message.id])

  useEffect(() => {
    if (!message.streamId || !streamStatus) {
      return
    }

    if (reportedStreamStatusRef.current === streamStatus) {
      return
    }

    reportedStreamStatusRef.current = streamStatus
    onStreamStatusChange?.(streamStatus)
  }, [message.streamId, onStreamStatusChange, streamStatus])

  const handleCopy = async () => {
    await navigator.clipboard.writeText(displayContent || reasoningText || '')
    toast.success('Message copied')
  }

  const handleAddEditingFiles = (files: File[]) => {
    const result = prepareDraftAttachments(editingAttachments, files)

    if (result.blockedCount > 0) {
      toast.error(
        'Compressed files like zip, rar, or archive bundles are not allowed.',
      )
    }

    if (result.overLimitCount > 0) {
      toast.error(`You can attach up to ${MAX_ATTACHMENTS} files per message.`)
    }

    if (result.attachments.length === 0) {
      return
    }

    const supportedAttachments = editingModel
      ? result.attachments.filter((attachment) =>
          modelSupportsAttachment(editingModel, attachment),
        )
      : []
    const blockedImageAttachments = editingModel
      ? result.attachments.filter(
          (attachment) =>
            attachment.kind === 'image' &&
            !modelSupportsAttachment(editingModel, attachment),
        ).length
      : 0
    const blockedFileAttachments = editingModel
      ? result.attachments.filter(
          (attachment) =>
            attachment.kind === 'file' &&
            !modelSupportsAttachment(editingModel, attachment),
        ).length
      : result.attachments.length

    if (blockedImageAttachments > 0) {
      toast.error("This model doesn't support image attachments.")
    }

    if (blockedFileAttachments > 0) {
      toast.error("This model doesn't support file attachments.")
    }

    if (supportedAttachments.length === 0) {
      return
    }

    onEditingAttachmentsChange?.([...editingAttachments, ...supportedAttachments])
    setFileInputKey((currentKey) => currentKey + 1)
  }

  const handleRemoveEditingAttachment = (attachmentId: string) => {
    const attachmentToRemove = editingAttachments.find(
      (attachment) => attachment.id === attachmentId,
    )

    if (attachmentToRemove) {
      revokeComposerAttachmentPreview(attachmentToRemove)
    }

    onEditingAttachmentsChange?.(
      editingAttachments.filter((attachment) => attachment.id !== attachmentId),
    )
  }

  const handlePasteEditingFiles = (
    event: React.ClipboardEvent<HTMLTextAreaElement>,
  ) => {
    const pastedFiles = Array.from(event.clipboardData.items)
      .filter((item) => item.kind === 'file')
      .map((item) => item.getAsFile())
      .filter((file): file is File => file !== null)

    if (pastedFiles.length === 0) {
      return
    }

    event.preventDefault()
    if (!canAttachToEditingModel) {
      toast.error("This model can't accept attachments.")
      return
    }
    handleAddEditingFiles(pastedFiles)
  }

  return (
    <div
      className={cn('flex px-4 py-3', isUser ? 'justify-end' : 'justify-start')}
    >
      <div
        className={cn(
          'group/message flex min-w-0 flex-col text-left',
          isUser
            ? 'max-w-full items-end sm:max-w-[85%]'
            : 'w-full max-w-full items-start md:max-w-[85%]',
        )}
      >
        {isUser ? (
          <>
            <div
              className={cn(
                'relative origin-top-right overflow-hidden transition-all duration-500 ease-[cubic-bezier(0.22,1,0.36,1)]',
                isEditing
                  ? 'w-full min-w-[min(32rem,80vw)] rounded-[28px] border border-border/70 bg-card/80 p-4 shadow-lg backdrop-blur-sm'
                  : 'inline-block rounded-2xl bg-muted/50 px-3.5 py-2.5',
              )}
            >
              {message.attachments.length > 0 && !isEditing ? (
                <div className={cn(!isEditing && message.content && 'mb-3')}>
                  <MessageAttachmentGrid
                    attachments={message.attachments}
                    align='end'
                    onOpen={setSelectedAttachmentId}
                  />
                </div>
              ) : null}
              {message.content ? (
                <div
                  className={cn(
                    'text-left text-sm leading-relaxed transition-all duration-300 ease-[cubic-bezier(0.22,1,0.36,1)]',
                    isEditing
                      ? 'pointer-events-none absolute inset-0 translate-y-1 scale-[0.98] opacity-0'
                      : 'relative translate-y-0 scale-100 opacity-100',
                  )}
                >
                  {message.content}
                </div>
              ) : null}
              <div
                className={cn(
                  'grid transition-all duration-500 ease-[cubic-bezier(0.22,1,0.36,1)]',
                  isEditing
                    ? 'mt-0 grid-rows-[1fr] opacity-100'
                    : 'mt-0 grid-rows-[0fr] opacity-0',
                )}
              >
                <div className='overflow-hidden'>
                  {isEditing && editingModel ? (
                    <div
                      className={cn(
                        'transition-all duration-500 ease-[cubic-bezier(0.22,1,0.36,1)]',
                        isEditing
                          ? 'translate-y-0 scale-100 opacity-100'
                          : 'translate-y-2 scale-[0.98] opacity-0',
                      )}
                    >
                      <Textarea
                        value={editingValue}
                        onChange={(event) =>
                          onEditingValueChange?.(event.target.value)
                        }
                        onPaste={handlePasteEditingFiles}
                        rows={1}
                        className='min-h-[120px] resize-none border-0 bg-transparent px-0 py-0 text-sm leading-relaxed shadow-none ring-0 focus-visible:bg-transparent focus-visible:ring-0 dark:bg-transparent'
                      />
                      {editingAttachments.length > 0 ? (
                        <div className='mt-4'>
                          <ChatAttachmentStrip
                            attachments={editingAttachments}
                            onRemove={handleRemoveEditingAttachment}
                          />
                        </div>
                      ) : null}
                      <div className='mt-4 flex items-center justify-between border-t border-border/50 pt-3'>
                        <div className='flex items-center gap-2'>
                          <input
                            key={fileInputKey}
                            type='file'
                            className='hidden'
                            multiple
                            accept={editingAttachmentInputAccept}
                            onChange={(event) => {
                              handleAddEditingFiles(
                                Array.from(event.target.files ?? []),
                              )
                              event.target.value = ''
                            }}
                            id={`edit-attachments-${message.id}`}
                          />
                          <Button
                            type='button'
                            variant='ghost'
                            size='icon-sm'
                            onClick={() => {
                              document
                                .getElementById(
                                  `edit-attachments-${message.id}`,
                                )
                                ?.click()
                            }}
                            disabled={!canAttachToEditingModel}
                            className='rounded-full text-muted-foreground hover:text-foreground disabled:opacity-40'
                          >
                            <Paperclip className='size-4' />
                          </Button>
                          <ModelSelector
                            model={editingModel}
                            pendingAttachments={editingAttachments}
                            onModelChange={(model) =>
                              onEditingModelChange?.(model)
                            }
                          />
                        </div>
                        <div className='flex items-center gap-2'>
                          <Button
                            type='button'
                            variant='ghost'
                            size='icon-sm'
                            onClick={onCancelEdit}
                            className='rounded-full text-muted-foreground hover:text-foreground'
                          >
                            <X className='size-4' />
                          </Button>
                          <Button
                            type='button'
                            size='icon-sm'
                            onClick={onSaveEdit}
                            className='rounded-full bg-primary text-primary-foreground'
                          >
                            <ArrowUp className='size-4' />
                          </Button>
                        </div>
                      </div>
                    </div>
                  ) : null}
                </div>
              </div>
            </div>
            <div
              className={cn(
                'mt-2 flex items-center justify-end gap-1 self-end opacity-0 transition-opacity group-hover/message:opacity-100',
                isEditing && 'hidden',
              )}
            >
              <Tooltip>
                <TooltipTrigger
                  render={
                    <Button
                      type='button'
                      variant='ghost'
                      size='icon-xs'
                      onClick={onRetry}
                      className='rounded-full text-muted-foreground hover:text-foreground'
                    >
                      <RotateCcw className='size-3.5' />
                    </Button>
                  }
                />
                <TooltipContent side='bottom'>Retry message</TooltipContent>
              </Tooltip>
              <Tooltip>
                <TooltipTrigger
                  render={
                    <Button
                      type='button'
                      variant='ghost'
                      size='icon-xs'
                      onClick={onEdit}
                      className='rounded-full text-muted-foreground hover:text-foreground'
                    >
                      <Pencil className='size-3.5' />
                    </Button>
                  }
                />
                <TooltipContent side='bottom'>Edit message</TooltipContent>
              </Tooltip>
              <Tooltip>
                <TooltipTrigger
                  render={
                    <Button
                      type='button'
                      variant='ghost'
                      size='icon-xs'
                      onClick={() => void handleCopy()}
                      className='rounded-full text-muted-foreground hover:text-foreground'
                    >
                      <Copy className='size-3.5' />
                    </Button>
                  }
                />
                <TooltipContent side='bottom'>Copy message</TooltipContent>
              </Tooltip>
            </div>
          </>
        ) : (
          <div className='min-w-0 w-full'>
            {message.attachments.length > 0 ? (
              <div className='mb-3'>
                <MessageAttachmentGrid
                  attachments={message.attachments}
                  onOpen={setSelectedAttachmentId}
                />
              </div>
            ) : null}
            {reasoningText ? (
              <SearchSection
                className='mb-4'
                icon={<Brain className='size-4 text-foreground/75' />}
                label='Reasoning'
                isOpen={isReasoningOpen}
                onToggle={() => setIsReasoningOpen((open) => !open)}
              >
                <div className='rounded-[26px] border border-border/50 bg-card/55 px-6 py-5 shadow-sm backdrop-blur-sm'>
                  <div className='whitespace-pre-wrap break-words text-[15px] leading-8 text-muted-foreground/95'>
                    {reasoningText}
                  </div>
                </div>
              </SearchSection>
            ) : null}
            {displayContent ? (
              <>
                <MarkdownRenderer
                  content={displayContent}
                  className='min-w-0 w-full max-w-full'
                />
                {hasStreamError ? (
                  <div className='mt-3 inline-flex max-w-full items-center gap-2 rounded-2xl border border-destructive/30 bg-destructive/5 px-3 py-2 text-xs text-destructive/90'>
                    <span>
                      {streamErrorMessage ??
                        'Reply failed to stream. Retry to generate again.'}
                    </span>
                  </div>
                ) : null}
              </>
            ) : hasStreamError ? (
              <div className='inline-flex max-w-full items-center gap-2 rounded-2xl border border-destructive/30 bg-destructive/5 px-3 py-2 text-xs text-destructive/90'>
                <span>
                  {streamErrorMessage ??
                    'Reply failed to stream. Retry to generate again.'}
                </span>
              </div>
            ) : !reasoningText ? (
              <div className='inline-flex items-center gap-2 rounded-full border border-border/60 bg-card/60 px-3 py-1.5 text-xs text-muted-foreground'>
                <span className='size-1.5 animate-pulse rounded-full bg-primary/70' />
                <span>Thinking</span>
              </div>
            ) : null}
            {sources.length > 0 ? (
              <SearchSection
                className='mt-5'
                icon={<Globe className='size-4 text-foreground/75' />}
                label='Search grounding'
                isOpen={isGroundingOpen}
                onToggle={() => setIsGroundingOpen((open) => !open)}
              >
                <SearchGroundingList sources={sources} />
              </SearchSection>
            ) : null}
            {(displayContent || reasoningText) && !isStreaming ? (
              <div className='mt-3 flex min-h-6 flex-wrap items-center gap-x-3 gap-y-2 overflow-hidden text-[12px] text-muted-foreground/80'>
                <div className='pointer-events-none flex items-center gap-3 whitespace-nowrap opacity-0 transition-opacity duration-200 group-hover/message:pointer-events-auto group-hover/message:opacity-100'>
                  <Tooltip>
                    <TooltipTrigger
                      render={
                        <Button
                          type='button'
                          variant='ghost'
                          size='icon-xs'
                          onClick={() => void handleCopy()}
                          className='rounded-full text-muted-foreground hover:text-foreground'
                        >
                          <Copy className='size-3.5' />
                        </Button>
                      }
                    />
                    <TooltipContent side='bottom'>Copy message</TooltipContent>
                  </Tooltip>
                  <Tooltip>
                    <TooltipTrigger
                      render={
                        <Button
                          type='button'
                          variant='ghost'
                          size='icon-xs'
                          onClick={onRetry}
                          className='rounded-full text-muted-foreground hover:text-foreground'
                        >
                          <RotateCcw className='size-3.5' />
                        </Button>
                      }
                    />
                    <TooltipContent side='bottom'>
                      Retry response
                    </TooltipContent>
                  </Tooltip>
                </div>
                <div className='pointer-events-none flex flex-wrap items-center gap-x-3 gap-y-2 whitespace-nowrap opacity-0 transition-opacity duration-200 group-hover/message:pointer-events-auto group-hover/message:opacity-100'>
                  <div className='inline-flex items-center gap-1.5 font-medium text-foreground/90'>
                    <Sparkles className='size-3.5 text-primary/80' />
                    <span>{modelLabel}</span>
                  </div>
                  {message.generationStats?.costUsd != null ? (
                    <div className='inline-flex items-center gap-1.5'>
                      <span className='text-muted-foreground/70'>$</span>
                      <span>{formatCostUsd(message.generationStats.costUsd)}</span>
                    </div>
                  ) : null}
                  {message.generationStats?.tokensPerSecond != null ? (
                    <div className='inline-flex items-center gap-1.5'>
                      <Zap className='size-3.5 text-muted-foreground/70' />
                      <span>
                        {formatTokensPerSecond(
                          message.generationStats.tokensPerSecond,
                        )}
                      </span>
                    </div>
                  ) : null}
                  {tokenCount != null ? (
                    <div className='inline-flex items-center gap-1.5'>
                      <Cpu className='size-3.5 text-muted-foreground/70' />
                      <span>{formatTokenCount(tokenCount)}</span>
                    </div>
                  ) : null}
                  {message.generationStats?.timeToFirstTokenMs != null ? (
                    <div className='inline-flex items-center gap-1.5'>
                      <Clock3 className='size-3.5 text-muted-foreground/70' />
                      <span>
                        {formatTimeToFirstToken(
                          message.generationStats.timeToFirstTokenMs,
                        )}
                      </span>
                    </div>
                  ) : null}
                </div>
              </div>
            ) : null}
          </div>
        )}
      </div>
      <ChatAttachmentDialog
        attachments={dialogAttachments}
        selectedAttachmentId={selectedAttachmentId}
        onSelectAttachment={setSelectedAttachmentId}
        onClose={() => setSelectedAttachmentId(null)}
      />
    </div>
  )
}

function areMessageBubblePropsEqual(
  previousProps: Readonly<Parameters<typeof MessageBubble>[0]>,
  nextProps: Readonly<Parameters<typeof MessageBubble>[0]>,
) {
  if (
    !areMessagesEqual(previousProps.message, nextProps.message) ||
    previousProps.driveStream !== nextProps.driveStream ||
    previousProps.streamUrl.href !== nextProps.streamUrl.href ||
    previousProps.isEditing !== nextProps.isEditing ||
    previousProps.editingValue !== nextProps.editingValue ||
    previousProps.editingModel?.id !== nextProps.editingModel?.id
  ) {
    return false
  }

  if (
    previousProps.isEditing &&
    !areComposerAttachmentsEqual(
      previousProps.editingAttachments ?? [],
      nextProps.editingAttachments ?? [],
    )
  ) {
    return false
  }

  return true
}

export default memo(MessageBubble, areMessageBubblePropsEqual)
