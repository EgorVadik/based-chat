import { Button } from '@based-chat/ui/components/button'
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarMenuAction,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarSeparator,
} from '@based-chat/ui/components/sidebar'
import { Input } from '@based-chat/ui/components/input'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuShortcut,
  DropdownMenuTrigger,
} from '@based-chat/ui/components/dropdown-menu'
import {
  Avatar,
  AvatarFallback,
  AvatarImage,
} from '@based-chat/ui/components/avatar'
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@based-chat/ui/components/tooltip'
import { cn } from '@based-chat/ui/lib/utils'
import {
  MessageSquarePlus,
  Search,
  Settings,
  LogOut,
  ChevronsUpDown,
  MessageSquare,
  Trash2,
  LoaderCircle,
  Clock3,
  Ellipsis,
  ExternalLink,
  PencilLine,
  FileText,
  User,
  Key,
  Cpu,
  Shield,
} from 'lucide-react'
import { memo, useEffect, useMemo, useRef, useState } from 'react'
import { useRouter } from '@tanstack/react-router'
import { toast } from 'sonner'

import { authClient } from '@/lib/auth-client'
import { getThreadsByTimeGroup, type ThreadSummary } from '@/lib/threads'
import type { TemporaryChatThread } from '@/lib/temporary-chat'

function BrandMark() {
  return (
    <div className='flex items-center gap-2.5'>
      <div className='flex size-7 items-center justify-center rounded-lg bg-primary'>
        <span className='text-xs font-bold text-primary-foreground tracking-tighter font-mono'>
          B
        </span>
      </div>
      <div className='flex flex-col'>
        <span className='text-sm font-semibold tracking-tight leading-none'>
          Based Chat
        </span>
        <span className='text-[10px] text-muted-foreground mt-0.5 font-mono uppercase tracking-widest'>
          v0.1.0
        </span>
      </div>
    </div>
  )
}

function ThreadTitle({ title }: { title: string }) {
  return <span className='min-w-0 flex-1 truncate'>{title}</span>
}

function AppSidebar({
  threads,
  activeThreadId,
  temporaryThread,
  isTemporaryActive,
  isTemporaryStreaming,
  temporaryMessageCount,
  streamingThreadIds,
  onSelectThread,
  onSelectTemporaryChat,
  onPrefetchThread,
  onClearTemporaryChat,
  onExportTemporaryChatAsMarkdown,
  onConvertTemporaryChatToStored,
  onOpenThreadInNewTab,
  onRenameThread,
  onDeleteThread,
  onExportThreadAsMarkdown,
  onNewChat,
  onLoadMoreThreads,
  threadPaginationStatus,
  user,
}: {
  threads: ThreadSummary[]
  activeThreadId: ThreadSummary['_id'] | null
  temporaryThread: TemporaryChatThread
  isTemporaryActive: boolean
  isTemporaryStreaming: boolean
  temporaryMessageCount: number
  streamingThreadIds: ThreadSummary['_id'][]
  onSelectThread: (id: ThreadSummary['_id']) => void
  onSelectTemporaryChat: () => void
  onPrefetchThread: (id: ThreadSummary['_id']) => void
  onClearTemporaryChat: () => Promise<void> | void
  onExportTemporaryChatAsMarkdown: () => Promise<void>
  onConvertTemporaryChatToStored: () => Promise<void>
  onOpenThreadInNewTab: (id: ThreadSummary['_id']) => void
  onRenameThread: (id: ThreadSummary['_id'], title: string) => Promise<void>
  onDeleteThread: (id: ThreadSummary['_id']) => Promise<void>
  onExportThreadAsMarkdown: (id: ThreadSummary['_id']) => Promise<void>
  onNewChat: () => void
  onLoadMoreThreads: () => void
  threadPaginationStatus:
    | 'LoadingFirstPage'
    | 'CanLoadMore'
    | 'LoadingMore'
    | 'Exhausted'
  user: {
    name?: string | null
    email?: string | null
    image?: string | null
  }
}) {
  const router = useRouter()
  const groups = getThreadsByTimeGroup(threads)
  const loadMoreRef = useRef<HTMLDivElement>(null)
  const renameInputRef = useRef<HTMLInputElement>(null)
  const streamingThreadIdSet = useMemo(
    () => new Set(streamingThreadIds),
    [streamingThreadIds],
  )
  const [renamingThreadId, setRenamingThreadId] = useState<
    ThreadSummary['_id'] | null
  >(null)
  const [renameValue, setRenameValue] = useState('')
  const [pendingThreadActionId, setPendingThreadActionId] = useState<
    ThreadSummary['_id'] | null
  >(null)
  const displayName =
    user.name?.trim() || user.email?.split('@')[0] || 'Signed in'
  const displayEmail = user.email || 'No email available'
  const initials =
    displayName
      .split(' ')
      .filter(Boolean)
      .slice(0, 2)
      .map((part) => part[0]?.toUpperCase())
      .join('') || 'BC'
  const isTemporaryActionPending = pendingThreadActionId === temporaryThread._id

  useEffect(() => {
    if (threadPaginationStatus !== 'CanLoadMore') {
      return
    }

    const node = loadMoreRef.current
    if (!node) {
      return
    }

    const observer = new IntersectionObserver(
      (entries) => {
        if (entries.some((entry) => entry.isIntersecting)) {
          onLoadMoreThreads()
        }
      },
      {
        rootMargin: '120px',
      },
    )

    observer.observe(node)

    return () => observer.disconnect()
  }, [onLoadMoreThreads, threadPaginationStatus])

  useEffect(() => {
    if (!renamingThreadId) {
      return
    }

    renameInputRef.current?.focus()
    renameInputRef.current?.select()
  }, [renamingThreadId])

  useEffect(() => {
    if (
      renamingThreadId &&
      !threads.some((thread) => thread._id === renamingThreadId)
    ) {
      setRenamingThreadId(null)
      setRenameValue('')
    }
  }, [renamingThreadId, threads])

  const beginRenamingThread = (thread: ThreadSummary) => {
    setRenamingThreadId(thread._id)
    setRenameValue(thread.title)
  }

  const cancelRenamingThread = () => {
    setRenamingThreadId(null)
    setRenameValue('')
  }

  const submitThreadRename = async (thread: ThreadSummary) => {
    if (pendingThreadActionId === thread._id) {
      return
    }

    const normalizedTitle = renameValue.trim()

    if (normalizedTitle.length === 0) {
      cancelRenamingThread()
      return
    }

    if (normalizedTitle === thread.title) {
      cancelRenamingThread()
      return
    }

    setPendingThreadActionId(thread._id)

    try {
      await onRenameThread(thread._id, normalizedTitle)
      cancelRenamingThread()
    } catch (error) {
      toast.error(
        error instanceof Error ? error.message : 'Failed to rename thread.',
      )
    } finally {
      setPendingThreadActionId((currentThreadId) =>
        currentThreadId === thread._id ? null : currentThreadId,
      )
    }
  }

  const handleThreadAction = async (
    threadId: ThreadSummary['_id'],
    action: () => Promise<void>,
  ) => {
    setPendingThreadActionId(threadId)

    try {
      await action()
    } catch (error) {
      toast.error(
        error instanceof Error ? error.message : 'Thread action failed.',
      )
    } finally {
      setPendingThreadActionId((currentThreadId) =>
        currentThreadId === threadId ? null : currentThreadId,
      )
    }
  }

  return (
    <Sidebar>
      <SidebarHeader className='gap-3'>
        <div className='flex items-center justify-between'>
          <BrandMark />
          <Button
            variant='ghost'
            size='icon-sm'
            onClick={onNewChat}
            className='text-muted-foreground hover:text-foreground'
          >
            <MessageSquarePlus className='size-4' />
          </Button>
        </div>
        <div className='relative'>
          <Search className='absolute left-2.5 top-1/2 -translate-y-1/2 size-3.5 text-muted-foreground/60' />
          <Input
            placeholder='Search threads...'
            className='h-8 rounded-lg border-0 bg-sidebar-accent/50 pl-8 text-xs shadow-none placeholder:text-muted-foreground/40 focus-visible:bg-sidebar-accent focus-visible:ring-0 dark:bg-sidebar-accent/60'
          />
        </div>
      </SidebarHeader>

      <SidebarSeparator />

      <SidebarContent>
        <SidebarGroup>
          <SidebarGroupLabel className='px-3 text-[10px] font-mono font-normal uppercase tracking-widest text-sidebar-foreground/40'>
            Temporary
          </SidebarGroupLabel>
          <SidebarGroupContent>
            <SidebarMenu>
              <SidebarMenuItem>
                <DropdownMenu>
                  <TooltipProvider delay={300}>
                    <Tooltip>
                      <TooltipTrigger
                        render={
                          <SidebarMenuButton
                            isActive={isTemporaryActive}
                            onClick={onSelectTemporaryChat}
                            className='group/conv cursor-pointer'
                          >
                            <Clock3
                              className={cn(
                                'size-3.5 shrink-0',
                                isTemporaryActive
                                  ? 'text-primary'
                                  : 'text-muted-foreground/70',
                              )}
                            />
                            <ThreadTitle title={temporaryThread.title} />
                            {isTemporaryStreaming ? (
                              <LoaderCircle className='ml-auto size-3 animate-spin text-primary' />
                            ) : (
                              <span className='ml-auto text-[10px] font-mono uppercase tracking-widest text-sidebar-foreground/35'>
                                Local
                              </span>
                            )}
                          </SidebarMenuButton>
                        }
                      />
                      <TooltipContent side='bottom'>
                        {temporaryThread.title}
                      </TooltipContent>
                    </Tooltip>
                  </TooltipProvider>
                  <DropdownMenuTrigger
                    render={
                      <SidebarMenuAction
                        showOnHover
                        className='text-muted-foreground/70 hover:text-foreground'
                        onClick={(event) => {
                          event.stopPropagation()
                        }}
                      >
                        <Ellipsis className='size-3.5' />
                        <span className='sr-only'>Temporary chat actions</span>
                      </SidebarMenuAction>
                    }
                  />
                  <DropdownMenuContent
                    align='end'
                    side='bottom'
                    sideOffset={8}
                    className='w-48'
                  >
                    <DropdownMenuItem
                      disabled={
                        isTemporaryActionPending ||
                        isTemporaryStreaming ||
                        temporaryMessageCount === 0
                      }
                      onClick={() =>
                        void handleThreadAction(temporaryThread._id, () =>
                          onConvertTemporaryChatToStored(),
                        )
                      }
                    >
                      <MessageSquare className='size-3.5' />
                      <span>Convert to stored chat</span>
                    </DropdownMenuItem>
                    <DropdownMenuItem
                      disabled={
                        isTemporaryActionPending || temporaryMessageCount === 0
                      }
                      onClick={() =>
                        void handleThreadAction(temporaryThread._id, () =>
                          onExportTemporaryChatAsMarkdown(),
                        )
                      }
                    >
                      <FileText className='size-3.5' />
                      <span>Export as markdown</span>
                    </DropdownMenuItem>
                    <DropdownMenuSeparator />
                    <DropdownMenuItem
                      variant='destructive'
                      disabled={
                        isTemporaryActionPending || temporaryMessageCount === 0
                      }
                      onClick={() =>
                        void handleThreadAction(
                          temporaryThread._id,
                          async () => {
                            await onClearTemporaryChat()
                          },
                        )
                      }
                    >
                      <Trash2 className='size-3.5' />
                      <span>Clear chat</span>
                    </DropdownMenuItem>
                  </DropdownMenuContent>
                </DropdownMenu>
              </SidebarMenuItem>
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>
        {groups.map((group) => (
          <SidebarGroup key={group.label}>
            <SidebarGroupLabel className='text-[10px] uppercase tracking-widest font-mono text-sidebar-foreground/40 font-normal px-3'>
              {group.label}
            </SidebarGroupLabel>
            <SidebarGroupContent>
              <SidebarMenu>
                {group.threads.map((thread) => {
                  const isStreamingThread =
                    thread.isStreaming || streamingThreadIdSet.has(thread._id)
                  const isRenamingThread = renamingThreadId === thread._id
                  const isThreadActionPending =
                    pendingThreadActionId === thread._id

                  return (
                    <SidebarMenuItem key={thread._id}>
                      {isRenamingThread ? (
                        <form
                          className='flex items-center gap-2 rounded-md bg-sidebar-accent/80 px-2 py-1.5 shadow-sm ring-1 ring-sidebar-border/70'
                          onSubmit={(event) => {
                            event.preventDefault()
                            void submitThreadRename(thread)
                          }}
                        >
                          <div
                            className={cn(
                              'size-1.5 shrink-0 rounded-full',
                              isStreamingThread
                                ? 'bg-primary/70'
                                : 'bg-muted-foreground/50',
                            )}
                          />
                          <Input
                            ref={renameInputRef}
                            value={renameValue}
                            onChange={(event) =>
                              setRenameValue(event.target.value)
                            }
                            onBlur={() => {
                              void submitThreadRename(thread)
                            }}
                            onKeyDown={(event) => {
                              if (event.key === 'Escape') {
                                event.preventDefault()
                                cancelRenamingThread()
                              }
                            }}
                            disabled={isThreadActionPending}
                            className='h-7 border-0 bg-transparent px-0 text-xs shadow-none focus-visible:ring-0'
                          />
                          {isThreadActionPending ? (
                            <LoaderCircle className='size-3 animate-spin text-primary' />
                          ) : null}
                        </form>
                      ) : (
                        <DropdownMenu>
                          <TooltipProvider delay={500}>
                            <Tooltip>
                              <TooltipTrigger
                                render={
                                  <SidebarMenuButton
                                    isActive={thread._id === activeThreadId}
                                    onClick={() => onSelectThread(thread._id)}
                                    onMouseEnter={() =>
                                      onPrefetchThread(thread._id)
                                    }
                                    onFocus={() => onPrefetchThread(thread._id)}
                                    className='group/conv cursor-pointer'
                                  >
                                    <div
                                      className={cn(
                                        'size-1.5 shrink-0 rounded-full',
                                        isStreamingThread
                                          ? 'bg-primary/70'
                                          : 'bg-muted-foreground/50',
                                      )}
                                    />
                                    <ThreadTitle title={thread.title} />
                                    {isStreamingThread ? (
                                      <LoaderCircle className='ml-auto size-3 animate-spin text-primary' />
                                    ) : null}
                                  </SidebarMenuButton>
                                }
                              />
                              <TooltipContent side='bottom'>
                                {thread.title}
                              </TooltipContent>
                            </Tooltip>
                          </TooltipProvider>
                          <>
                            <DropdownMenuTrigger
                              render={
                                <SidebarMenuAction
                                  showOnHover
                                  className='text-muted-foreground/70 hover:text-foreground'
                                  onClick={(event) => {
                                    event.stopPropagation()
                                  }}
                                >
                                  <Ellipsis className='size-3.5' />
                                  <span className='sr-only'>
                                    Thread actions
                                  </span>
                                </SidebarMenuAction>
                              }
                            />
                            <DropdownMenuContent
                              align='end'
                              side='bottom'
                              sideOffset={8}
                              className='w-44'
                            >
                              <DropdownMenuItem
                                disabled={isThreadActionPending}
                                onClick={() => onOpenThreadInNewTab(thread._id)}
                              >
                                <ExternalLink className='size-3.5' />
                                <span>Open in new tab</span>
                              </DropdownMenuItem>
                              <DropdownMenuItem
                                disabled={isThreadActionPending}
                                onClick={() => beginRenamingThread(thread)}
                              >
                                <PencilLine className='size-3.5' />
                                <span>Rename</span>
                              </DropdownMenuItem>
                              <DropdownMenuSeparator />
                              <DropdownMenuItem
                                disabled={isThreadActionPending}
                                onClick={() =>
                                  void handleThreadAction(thread._id, () =>
                                    onExportThreadAsMarkdown(thread._id),
                                  )
                                }
                              >
                                <FileText className='size-3.5' />
                                <span>Export as markdown</span>
                              </DropdownMenuItem>
                              <DropdownMenuItem
                                variant='destructive'
                                disabled={isThreadActionPending}
                                onClick={() =>
                                  void handleThreadAction(thread._id, () =>
                                    onDeleteThread(thread._id),
                                  )
                                }
                              >
                                <Trash2 className='size-3.5' />
                                <span>Delete</span>
                              </DropdownMenuItem>
                            </DropdownMenuContent>
                          </>
                        </DropdownMenu>
                      )}
                    </SidebarMenuItem>
                  )
                })}
              </SidebarMenu>
            </SidebarGroupContent>
          </SidebarGroup>
        ))}
        {threads.length === 0 &&
        threadPaginationStatus !== 'LoadingFirstPage' ? (
          <div className='px-4 py-6 text-xs text-sidebar-foreground/50'>
            No threads yet.
          </div>
        ) : null}
        <div ref={loadMoreRef} className='px-4 py-3'>
          {threadPaginationStatus === 'LoadingFirstPage' ? (
            <p className='text-[10px] font-mono uppercase tracking-widest text-sidebar-foreground/40'>
              Loading threads...
            </p>
          ) : null}
          {threadPaginationStatus === 'LoadingMore' ? (
            <p className='text-[10px] font-mono uppercase tracking-widest text-sidebar-foreground/40'>
              Loading more threads...
            </p>
          ) : null}
        </div>
      </SidebarContent>

      <SidebarSeparator />

      <SidebarFooter>
        <DropdownMenu>
          <DropdownMenuTrigger
            render={
              <button className='flex w-full items-center gap-2.5 rounded-lg p-1.5 text-left hover:bg-sidebar-accent/80 transition-colors group/user'>
                <div className='relative'>
                  <Avatar size='sm'>
                    <AvatarFallback className='bg-primary/15 text-primary text-[10px] font-semibold'>
                      {initials}
                    </AvatarFallback>
                    <AvatarImage src={user.image || undefined} />
                  </Avatar>
                  <span className='absolute -bottom-px -right-px size-2 rounded-full bg-emerald-500 ring-2 ring-sidebar' />
                </div>
                <div className='flex-1 min-w-0'>
                  <p className='text-xs font-medium truncate'>{displayName}</p>
                  <p className='text-[10px] text-muted-foreground truncate'>
                    {displayEmail}
                  </p>
                </div>
                <ChevronsUpDown className='size-3.5 text-muted-foreground/50 group-hover/user:text-muted-foreground transition-colors' />
              </button>
            }
          />
          <DropdownMenuContent
            side='top'
            align='start'
            sideOffset={8}
            className='w-64 p-0'
          >
            <div className='flex items-center gap-3 px-3 py-3 border-b border-border/50'>
              <Avatar size='sm'>
                <AvatarFallback className='bg-primary/15 text-primary text-[10px] font-semibold'>
                  {initials}
                </AvatarFallback>
                <AvatarImage src={user.image || undefined} />
              </Avatar>
              <div className='flex-1 min-w-0'>
                <p className='text-xs font-medium truncate'>{displayName}</p>
                <p className='text-[10px] text-muted-foreground truncate'>
                  {displayEmail}
                </p>
              </div>
            </div>

            <div className='p-1'>
              <DropdownMenuGroup>
                <DropdownMenuLabel>Account</DropdownMenuLabel>
                <DropdownMenuItem
                  onClick={() =>
                    router.navigate({
                      to: '/settings',
                      search: { tab: 'profile' },
                    })
                  }
                >
                  <User className='size-3.5' />
                  <span>Profile</span>
                </DropdownMenuItem>
                <DropdownMenuItem
                  onClick={() =>
                    router.navigate({
                      to: '/settings',
                      search: { tab: 'api-keys' },
                    })
                  }
                >
                  <Key className='size-3.5' />
                  <span>API Keys</span>
                </DropdownMenuItem>
                <DropdownMenuItem
                  onClick={() =>
                    router.navigate({
                      to: '/settings',
                      search: { tab: 'security' },
                    })
                  }
                >
                  <Shield className='size-3.5' />
                  <span>Security</span>
                </DropdownMenuItem>
              </DropdownMenuGroup>

              <DropdownMenuSeparator />

              <DropdownMenuItem
                variant='destructive'
                onClick={() => {
                  authClient.signOut({
                    fetchOptions: {
                      onSuccess: () => {
                        toast.success('Signed out.')
                      },
                      onError: (error) => {
                        toast.error(
                          error.error.message || error.error.statusText,
                        )
                      },
                    },
                  })
                }}
              >
                <LogOut className='size-3.5' />
                <span>Sign out</span>
              </DropdownMenuItem>
            </div>
          </DropdownMenuContent>
        </DropdownMenu>
      </SidebarFooter>
    </Sidebar>
  )
}

function areThreadListsEqual(left: ThreadSummary[], right: ThreadSummary[]) {
  if (left.length !== right.length) {
    return false
  }

  return left.every((thread, index) => {
    const otherThread = right[index]
    if (!otherThread) {
      return false
    }

    return (
      thread._id === otherThread._id &&
      thread.title === otherThread.title &&
      thread.updatedAt === otherThread.updatedAt &&
      thread.isStreaming === otherThread.isStreaming
    )
  })
}

function areSidebarPropsEqual(
  previousProps: Readonly<Parameters<typeof AppSidebar>[0]>,
  nextProps: Readonly<Parameters<typeof AppSidebar>[0]>,
) {
  return (
    previousProps.activeThreadId === nextProps.activeThreadId &&
    previousProps.isTemporaryActive === nextProps.isTemporaryActive &&
    previousProps.isTemporaryStreaming === nextProps.isTemporaryStreaming &&
    previousProps.temporaryThread.updatedAt ===
      nextProps.temporaryThread.updatedAt &&
    previousProps.temporaryThread.title === nextProps.temporaryThread.title &&
    previousProps.threadPaginationStatus === nextProps.threadPaginationStatus &&
    previousProps.user.name === nextProps.user.name &&
    previousProps.user.email === nextProps.user.email &&
    previousProps.user.image === nextProps.user.image &&
    previousProps.streamingThreadIds.length ===
      nextProps.streamingThreadIds.length &&
    previousProps.streamingThreadIds.every(
      (threadId, index) => threadId === nextProps.streamingThreadIds[index],
    ) &&
    areThreadListsEqual(previousProps.threads, nextProps.threads)
  )
}

export default memo(AppSidebar, areSidebarPropsEqual)
