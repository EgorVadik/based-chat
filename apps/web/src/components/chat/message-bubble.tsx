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
  Clock3,
  Copy,
  Cpu,
  FileCode2,
  FileText,
  Pencil,
  Paperclip,
  RotateCcw,
  Sparkles,
  X,
  Zap,
} from 'lucide-react'
import { useMemo, useState } from 'react'
import { toast } from 'sonner'

import type { ComposerAttachment } from '@/lib/attachments'
import {
  isImageAttachment,
  MAX_ATTACHMENTS,
  prepareDraftAttachments,
  revokeComposerAttachmentPreview,
} from '@/lib/attachments'
import type { ChatMessage } from '@/lib/chat'
import type { Model } from '@/lib/models'

import ChatAttachmentStrip from './chat-attachment-strip'
import ChatAttachmentDialog from './chat-attachment-dialog'
import ModelSelector from './model-selector'
import MarkdownRenderer from './markdown-renderer'

function getFakeMessageStats(message: ChatMessage) {
  const contentLength = message.content.trim().length
  const fakeTokenCount = Math.max(128, Math.round(contentLength / 3.4))
  const fakeSpeed = Math.max(18, 52 - fakeTokenCount / 28).toFixed(2)
  const fakeTtfb = (0.42 + (fakeTokenCount % 7) * 0.07).toFixed(2)

  return {
    tokenCount: fakeTokenCount,
    speed: `${fakeSpeed} tok/sec`,
    ttfb: `${fakeTtfb} sec`,
  }
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
  const fileAttachments = attachments.filter((attachment) => !isImageAttachment(attachment))

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
    <div
      className={cn(
        'space-y-2',
        align === 'end' && 'self-end',
      )}
    >
      {imageAttachments.length > 0 ? (
        <div
          className={cn(
            'grid max-w-[min(36rem,72vw)] grid-cols-2 gap-2',
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
                  className={cn(
                    'w-full object-cover transition-transform duration-300 group-hover/attachment:scale-[1.03]',
                    imageAttachments.length === 1 ? 'max-h-[26rem]' : 'h-44',
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
              <div className='absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/80 via-black/35 to-transparent px-3 py-2 text-white'>
                <p className='truncate text-xs font-medium'>{attachment.fileName}</p>
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
                className='flex min-w-[12rem] max-w-[16rem] items-start gap-3 rounded-2xl border border-border/50 bg-card/50 px-3 py-2.5 text-left shadow-sm transition-transform hover:-translate-y-0.5'
              >
                <div className='flex size-10 shrink-0 items-center justify-center rounded-2xl bg-muted/50 text-muted-foreground'>
                  <FileIcon className='size-4' />
                </div>
                <div className='min-w-0 flex-1'>
                  <p className='truncate text-xs font-medium'>{attachment.fileName}</p>
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

export default function MessageBubble({
  message,
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
  const isStreaming = !isUser && message.isStreaming
  const stats = getFakeMessageStats(message)
  const modelLabel = message.model?.name ?? message.modelId ?? 'Assistant'
  const [selectedAttachmentId, setSelectedAttachmentId] = useState<string | null>(null)
  const [fileInputKey, setFileInputKey] = useState(0)
  const dialogAttachments = useMemo(
    () =>
      message.attachments
        .map((attachment) => ({
          id: attachment.storageId,
          kind: attachment.kind,
          fileName: attachment.fileName,
          contentType: attachment.contentType,
          size: attachment.size,
          url: attachment.url,
        })),
    [message.attachments],
  )
  const handleCopy = async () => {
    await navigator.clipboard.writeText(message.content)
    toast.success('Message copied')
  }

  const handleAddEditingFiles = (files: File[]) => {
    const result = prepareDraftAttachments(editingAttachments, files)

    if (result.blockedCount > 0) {
      toast.error('Compressed files like zip, rar, or archive bundles are not allowed.')
    }

    if (result.overLimitCount > 0) {
      toast.error(`You can attach up to ${MAX_ATTACHMENTS} files per message.`)
    }

    if (result.attachments.length === 0) {
      return
    }

    onEditingAttachmentsChange?.([
      ...editingAttachments,
      ...result.attachments,
    ])
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
    handleAddEditingFiles(pastedFiles)
  }

  return (
    <div
      className={cn(
        'flex px-4 py-3',
        isUser ? 'justify-end' : 'justify-start',
      )}
    >
      <div
        className={cn(
          'group/message flex min-w-0 max-w-[85%] flex-col text-left',
          isUser ? 'items-end' : 'items-start',
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
                            onChange={(event) => {
                              handleAddEditingFiles(Array.from(event.target.files ?? []))
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
                                .getElementById(`edit-attachments-${message.id}`)
                                ?.click()
                            }}
                            className='rounded-full text-muted-foreground hover:text-foreground'
                          >
                            <Paperclip className='size-4' />
                          </Button>
                          <ModelSelector
                            model={editingModel}
                            onModelChange={(model) => onEditingModelChange?.(model)}
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
          <div>
            {message.attachments.length > 0 ? (
              <div className='mb-3'>
                <MessageAttachmentGrid
                  attachments={message.attachments}
                  onOpen={setSelectedAttachmentId}
                />
              </div>
            ) : null}
            {message.content ? (
              <MarkdownRenderer content={message.content} />
            ) : (
              <div className='inline-flex items-center gap-2 rounded-full border border-border/60 bg-card/60 px-3 py-1.5 text-xs text-muted-foreground'>
                <span className='size-1.5 animate-pulse rounded-full bg-primary/70' />
                <span>Thinking</span>
              </div>
            )}
            {message.content && !isStreaming ? (
              <div className='mt-3 min-h-6 translate-y-0 overflow-hidden text-[12px] text-muted-foreground/80 opacity-0 transition-opacity duration-200 pointer-events-none group-hover/message:opacity-100 group-hover/message:pointer-events-auto'>
                <div className='flex items-center gap-3 whitespace-nowrap'>
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
                    <TooltipContent side='bottom'>Retry response</TooltipContent>
                  </Tooltip>
                  <div className='inline-flex items-center gap-1.5 font-medium text-foreground/90'>
                    <Sparkles className='size-3.5 text-primary/80' />
                    <span>{modelLabel}</span>
                  </div>
                  <div className='inline-flex items-center gap-1.5'>
                    <Zap className='size-3.5' />
                    <span>{stats.speed}</span>
                  </div>
                  <div className='inline-flex items-center gap-1.5'>
                    <Cpu className='size-3.5' />
                    <span>{stats.tokenCount} tokens</span>
                  </div>
                  <div className='inline-flex items-center gap-1.5'>
                    <Clock3 className='size-3.5' />
                    <span>Time-to-First: {stats.ttfb}</span>
                  </div>
                </div>
              </div>
            ) : null}
            {isStreaming ? (
              <div className='mt-2 inline-flex items-center gap-2 rounded-full border border-primary/15 bg-primary/5 px-2.5 py-1 text-[11px] text-primary/80'>
                <span className='size-1.5 animate-pulse rounded-full bg-primary' />
                <span>Streaming reply</span>
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
