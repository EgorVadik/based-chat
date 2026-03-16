import { api } from '@based-chat/backend/convex/_generated/api'
import {
  Avatar,
  AvatarFallback,
  AvatarImage,
} from '@based-chat/ui/components/avatar'
import { cn } from '@based-chat/ui/lib/utils'
import { useRouter } from '@tanstack/react-router'
import { useQuery } from 'convex/react'
import { ArrowLeft, Info } from 'lucide-react'
import { toast } from 'sonner'

import { authClient } from '@/lib/auth-client'
import { SETTINGS_TABS, type SettingsTabId } from '@/lib/settings-tabs'

import ProfileTab from './profile-tab'
import ThreadHistoryTab from './thread-history-tab'
import ModelsTab from './models-tab'
import AttachmentsTab from './attachments-tab'
import ApiKeysTab from './api-keys-tab'
import SecurityTab from './security-tab'

export default function SettingsPage({
  user,
  activeTab,
  onTabChange,
}: {
  user: {
    name?: string | null
    email?: string | null
    role?: string | null
    traits?: string[] | null
    bio?: string | null
    image?: string | null
  }
  activeTab: SettingsTabId
  onTabChange: (tab: SettingsTabId) => void
}) {
  const router = useRouter()
  const usageStats = useQuery(api.messages.getUsageStats, {})

  const displayName = user.name?.trim() || user.email?.split('@')[0] || 'User'
  const displayEmail = user.email || 'No email'
  const initials =
    displayName
      .split(' ')
      .filter(Boolean)
      .slice(0, 2)
      .map((part) => part[0]?.toUpperCase())
      .join('') || 'BC'

  return (
    <div className='min-h-svh bg-background'>
      {/* Top header */}
      <header className='sticky top-0 z-10 border-b border-border/50 bg-background/80 backdrop-blur-sm'>
        <div className='mx-auto flex max-w-6xl items-center justify-between px-6 py-3'>
          <button
            onClick={() => router.navigate({ to: '/' })}
            className='flex items-center gap-2 text-xs text-muted-foreground hover:text-foreground transition-colors cursor-pointer'
          >
            <ArrowLeft className='size-3.5' />
            <span>Back to Chat</span>
          </button>

          <button
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
            className='flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground transition-colors cursor-pointer'
          >
            Sign out
          </button>
        </div>
      </header>

      <div className='mx-auto max-w-6xl px-6 py-8'>
        <div className='flex gap-10'>
          {/* Left panel — user card */}
          <aside className='hidden lg:flex w-60 shrink-0 flex-col items-center pt-4'>
            {/* Avatar */}
            <div className='relative'>
              <div className='size-32 rounded-full bg-linear-to-br from-primary/30 via-primary/10 to-transparent p-0.5'>
                <div className='flex size-full items-center justify-center rounded-full bg-background'>
                  <Avatar className='size-28'>
                    <AvatarFallback className='bg-primary/10 text-primary text-3xl font-semibold'>
                      {initials}
                    </AvatarFallback>
                    <AvatarImage src={user.image || undefined} />
                  </Avatar>
                </div>
              </div>
            </div>

            <h2 className='mt-4 text-sm font-semibold truncate max-w-full'>
              {displayName}
            </h2>
            <p className='mt-0.5 text-[11px] text-muted-foreground truncate max-w-full'>
              {displayEmail}
            </p>

            {/* Usage stats */}
            <div className='mt-8 w-full rounded-xl border border-border/50 bg-card/30 p-4 space-y-3'>
              <h3 className='text-xs font-medium'>Usage</h3>
              <div className='flex items-start gap-2 rounded-lg border border-border/50 bg-background/40 px-3 py-2 text-[11px] leading-relaxed text-muted-foreground'>
                <Info className='mt-0.5 size-3 shrink-0 text-foreground/60' />
                <p>Temporary chats are not included in these totals.</p>
              </div>
              <div className='space-y-2'>
                <div className='flex items-center justify-between'>
                  <span className='text-[11px] text-muted-foreground'>
                    Total Tokens
                  </span>
                  <span className='text-[11px] font-mono text-foreground'>
                    {usageStats?.totalTokens.toLocaleString() ?? '—'}
                  </span>
                </div>
                <div className='flex items-center justify-between'>
                  <span className='text-[11px] text-muted-foreground'>
                    Input Tokens
                  </span>
                  <span className='text-[11px] font-mono text-foreground'>
                    {usageStats?.totalInputTokens.toLocaleString() ?? '—'}
                  </span>
                </div>
                <div className='flex items-center justify-between'>
                  <span className='text-[11px] text-muted-foreground'>
                    Output Tokens
                  </span>
                  <span className='text-[11px] font-mono text-foreground'>
                    {usageStats?.totalOutputTokens.toLocaleString() ?? '—'}
                  </span>
                </div>
                <div className='flex items-center justify-between'>
                  <span className='text-[11px] text-muted-foreground'>
                    Total Cost
                  </span>
                  <span className='text-[11px] font-mono text-foreground'>
                    {usageStats
                      ? `$${usageStats.totalCostUsd.toFixed(4)}`
                      : '—'}
                  </span>
                </div>
                <div className='flex items-center justify-between'>
                  <span className='text-[11px] text-muted-foreground'>
                    Messages
                  </span>
                  <span className='text-[11px] font-mono text-foreground'>
                    {usageStats?.messageCount.toLocaleString() ?? '—'}
                  </span>
                </div>
              </div>
            </div>
          </aside>

          {/* Right panel — tabs + content */}
          <div className='flex-1 min-w-0'>
            {/* Horizontal tab bar */}
            <nav className='flex items-center gap-1 border-b border-border/50 overflow-x-auto'>
              {SETTINGS_TABS.map((tab) => {
                const isActive = activeTab === tab.id

                return (
                  <button
                    key={tab.id}
                    onClick={() => onTabChange(tab.id)}
                    className={cn(
                      'relative shrink-0 px-3 py-2.5 text-xs font-medium transition-colors cursor-pointer whitespace-nowrap',
                      isActive
                        ? 'text-foreground'
                        : 'text-muted-foreground hover:text-foreground',
                    )}
                  >
                    {tab.label}
                    {isActive && (
                      <span className='absolute inset-x-3 -bottom-px h-0.5 rounded-full bg-foreground' />
                    )}
                  </button>
                )
              })}
            </nav>

            {/* Tab content */}
            <div className='py-8'>
              {activeTab === 'profile' && <ProfileTab user={user} />}
              {activeTab === 'threads' && <ThreadHistoryTab />}
              {activeTab === 'models' && <ModelsTab />}
              {activeTab === 'attachments' && <AttachmentsTab />}
              {activeTab === 'api-keys' && <ApiKeysTab />}
              {activeTab === 'security' && <SecurityTab />}
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
