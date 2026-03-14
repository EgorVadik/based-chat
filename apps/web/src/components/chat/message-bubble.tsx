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
  Pencil,
  RotateCcw,
  Sparkles,
  X,
  Zap,
} from 'lucide-react'
import { toast } from 'sonner'

import type { ChatMessage } from '@/lib/chat'
import type { Model } from '@/lib/models'

import ModelSelector from './model-selector'
import MarkdownRenderer from './markdown-renderer'

function getFakeMessageStats(message: ChatMessage) {
  const contentLength = message.content.trim().length
  const fakeTokenCount = Math.max(128, Math.round(contentLength / 3.4))
  const fakeSpeed = Math.max(18, (52 - fakeTokenCount / 28).toFixed(2))
  const fakeTtfb = (0.42 + (fakeTokenCount % 7) * 0.07).toFixed(2)

  return {
    tokenCount: fakeTokenCount,
    speed: `${fakeSpeed} tok/sec`,
    ttfb: `${fakeTtfb} sec`,
  }
}

export default function MessageBubble({
  message,
  onRetry,
  onEdit,
  isEditing = false,
  editingValue = '',
  editingModel,
  onEditingValueChange,
  onEditingModelChange,
  onCancelEdit,
  onSaveEdit,
}: {
  message: ChatMessage
  onRetry?: () => void
  onEdit?: () => void
  isEditing?: boolean
  editingValue?: string
  editingModel?: Model
  onEditingValueChange?: (value: string) => void
  onEditingModelChange?: (model: Model) => void
  onCancelEdit?: () => void
  onSaveEdit?: () => void
}) {
  const isUser = message.role === 'user'
  const isStreaming = !isUser && message.isStreaming
  const stats = getFakeMessageStats(message)
  const modelLabel = message.model?.name ?? message.modelId ?? 'Assistant'
  const handleCopy = async () => {
    await navigator.clipboard.writeText(message.content)
    toast.success('Message copied')
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
                        rows={1}
                        className='min-h-[120px] resize-none border-0 bg-transparent px-0 py-0 text-sm leading-relaxed shadow-none ring-0 focus-visible:bg-transparent focus-visible:ring-0 dark:bg-transparent'
                      />
                      <div className='mt-4 flex items-center justify-between border-t border-border/50 pt-3'>
                        <ModelSelector
                          model={editingModel}
                          onModelChange={(model) => onEditingModelChange?.(model)}
                        />
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
    </div>
  )
}
