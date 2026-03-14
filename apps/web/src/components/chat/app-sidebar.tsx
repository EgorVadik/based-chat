import { Button } from '@based-chat/ui/components/button'
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
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
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@based-chat/ui/components/dropdown-menu'
import { Avatar, AvatarFallback } from '@based-chat/ui/components/avatar'
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
} from 'lucide-react'
import { useEffect, useRef } from 'react'
import { useRouter } from '@tanstack/react-router'
import { toast } from 'sonner'

import { authClient } from '@/lib/auth-client'
import { getThreadsByTimeGroup, type ThreadSummary } from '@/lib/threads'

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

export default function AppSidebar({
  threads,
  activeThreadId,
  streamingThreadIds,
  onSelectThread,
  onPrefetchThread,
  onNewChat,
  onLoadMoreThreads,
  threadPaginationStatus,
  user,
}: {
  threads: ThreadSummary[]
  activeThreadId: ThreadSummary['_id'] | null
  streamingThreadIds: ThreadSummary['_id'][]
  onSelectThread: (id: ThreadSummary['_id']) => void
  onPrefetchThread: (id: ThreadSummary['_id']) => void
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
  }
}) {
  const router = useRouter()
  const groups = getThreadsByTimeGroup(threads)
  const loadMoreRef = useRef<HTMLDivElement>(null)
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
        {groups.map((group) => (
          <SidebarGroup key={group.label}>
            <SidebarGroupLabel className='text-[10px] uppercase tracking-widest font-mono text-sidebar-foreground/40 font-normal px-3'>
              {group.label}
            </SidebarGroupLabel>
            <SidebarGroupContent>
              <SidebarMenu>
                {group.threads.map((thread) => {
                  const isStreamingThread = streamingThreadIds.includes(
                    thread._id,
                  )

                  return (
                    <SidebarMenuItem key={thread._id}>
                      <SidebarMenuButton
                        isActive={thread._id === activeThreadId}
                        onClick={() => onSelectThread(thread._id)}
                        onMouseEnter={() => onPrefetchThread(thread._id)}
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
                        <span className='truncate'>{thread.title}</span>
                        {isStreamingThread ? (
                          <LoaderCircle className='ml-auto size-3 animate-spin text-primary' />
                        ) : (
                          <button
                            className='ml-auto opacity-0 group-hover/conv:opacity-100 transition-opacity text-muted-foreground hover:text-destructive'
                            onClick={(e) => {
                              e.stopPropagation()
                            }}
                          >
                            <Trash2 className='size-3' />
                          </button>
                        )}
                      </SidebarMenuButton>
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
              <button className='flex w-full items-center gap-2.5 rounded-lg p-1.5 text-left hover:bg-sidebar-accent transition-colors'>
                <Avatar size='sm'>
                  <AvatarFallback className='bg-primary/15 text-primary text-[10px] font-semibold'>
                    {initials}
                  </AvatarFallback>
                </Avatar>
                <div className='flex-1 min-w-0'>
                  <p className='text-xs font-medium truncate'>{displayName}</p>
                  <p className='text-[10px] text-muted-foreground truncate'>
                    {displayEmail}
                  </p>
                </div>
                <ChevronsUpDown className='size-3.5 text-muted-foreground' />
              </button>
            }
          />
          <DropdownMenuContent
            side='top'
            align='start'
            sideOffset={8}
            className='w-56'
          >
            <DropdownMenuItem
              onClick={() =>
                router.navigate({
                  to: '/settings',
                  search: {
                    tab: 'profile',
                  },
                })
              }
            >
              <Settings className='size-3.5' />
              <span>Settings</span>
            </DropdownMenuItem>
            <DropdownMenuSeparator />
            <DropdownMenuItem>
              <MessageSquare className='size-3.5' />
              <span>Feedback</span>
            </DropdownMenuItem>
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
                      toast.error(error.error.message || error.error.statusText)
                    },
                  },
                })
              }}
            >
              <LogOut className='size-3.5' />
              <span>Sign out</span>
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </SidebarFooter>
    </Sidebar>
  )
}
