import { api } from '@based-chat/backend/convex/_generated/api'
import { Ionicons } from '@expo/vector-icons'
import { FlashList } from '@shopify/flash-list'
import * as Haptics from 'expo-haptics'
import { BottomSheet, Button, Input, useToast } from 'heroui-native'
import {
  useConvex,
  useMutation,
  usePaginatedQuery,
  useQuery,
} from 'convex/react'
import { router } from 'expo-router'
import { useCallback, useMemo, useRef, useState } from 'react'
import {
  ActivityIndicator,
  Alert,
  Platform,
  Pressable,
  Share,
  Text,
  View,
} from 'react-native'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { useMMKVString } from 'react-native-mmkv'

import { ThemeToggle } from '@/components/theme-toggle'
import { authClient } from '@/lib/auth-client'
import { appStorage } from '@/lib/mmkv'
import {
  getTemporaryChatMessageCount,
  getTemporaryChatStreamingState,
  TEMPORARY_CHAT_ROUTE,
  TEMPORARY_CHAT_STORAGE_KEY,
} from '@/lib/temporary-chat'
import { getThreadsByTimeGroup, type ThreadSummary } from '@/lib/threads'
import { useColors } from '@/lib/use-colors'

const THREAD_PAGE_SIZE = 25

type ThreadActionMode = 'menu' | 'rename'

type ThreadActionType = 'rename' | 'export' | 'delete'

type ThreadMessage = {
  role: 'user' | 'system'
  modelId?: string
  content: string
  reasoningText?: string
  sources?: Array<{
    title?: string
    hostname?: string
    url: string
    snippet?: string
  }>
  attachments?: Array<{
    fileName: string
  }>
}

function formatMarkdownTimestamp(timestamp: number) {
  return new Intl.DateTimeFormat('en-US', {
    year: 'numeric',
    month: 'numeric',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
    second: '2-digit',
  }).format(timestamp)
}

function buildThreadMarkdown(thread: ThreadSummary, messages: ThreadMessage[]) {
  const sections = [
    `# ${thread.title}`,
    `Created: ${formatMarkdownTimestamp(thread.createdAt)}`,
    `Last Updated: ${formatMarkdownTimestamp(thread.updatedAt)}`,
    '---',
  ]

  for (const message of messages) {
    const attachments = message.attachments ?? []
    const sources = message.sources ?? []
    const label =
      message.role === 'user'
        ? 'User'
        : `Assistant${message.modelId ? ` (${message.modelId})` : ''}`
    const reasoning = message.reasoningText?.trim()
    const content = message.content.trim()

    sections.push(`### ${label}`)

    if (reasoning) {
      sections.push(
        '<details>',
        '<summary>Reasoning</summary>',
        '',
        reasoning,
        '</details>',
      )
    }

    if (content) {
      sections.push(content)
    }

    if (sources.length > 0) {
      sections.push(
        '<details>',
        '<summary>Search grounding</summary>',
        '',
        ...sources.map((source) => {
          const sourceLabel = source.title || source.hostname || source.url
          return source.snippet
            ? `- **${sourceLabel}**: ${source.snippet}`
            : `- **${sourceLabel}**: ${source.url}`
        }),
        '</details>',
      )
    }

    if (!content && attachments.length > 0) {
      sections.push(
        'Attachments:',
        ...attachments.map((attachment) => `- ${attachment.fileName}`),
      )
    }

    if (!content && attachments.length === 0) {
      sections.push('*No text content.*')
    }

    sections.push('---')
  }

  return `${sections.join('\n\n')}\n`
}

function BrandMark({ colors }: { colors: ReturnType<typeof useColors> }) {
  return (
    <View className='flex-row items-center gap-2.5'>
      <View
        className='w-7 h-7 items-center justify-center rounded-lg'
        style={{ backgroundColor: colors.primary }}
      >
        <Text
          className='text-xs font-bold'
          style={{
            fontFamily: Platform.OS === 'ios' ? 'Menlo' : 'monospace',
            color: colors.primaryForeground,
            letterSpacing: -0.5,
          }}
        >
          B
        </Text>
      </View>
      <View>
        <Text
          className='text-sm font-semibold leading-none'
          style={{ color: colors.foreground, letterSpacing: -0.3 }}
        >
          Based Chat
        </Text>
        <Text
          className='text-[10px] mt-0.5 uppercase'
          style={{
            fontFamily: Platform.OS === 'ios' ? 'Menlo' : 'monospace',
            color: colors.mutedForeground,
            letterSpacing: 2,
            opacity: 0.5,
          }}
        >
          v0.1.0
        </Text>
      </View>
    </View>
  )
}

function ThreadItem({
  title,
  isStreaming,
  onPress,
  onLongPress,
  colors,
}: {
  title: string
  isStreaming?: boolean
  onPress: () => void
  onLongPress: () => void
  colors: ReturnType<typeof useColors>
}) {
  const didLongPressRef = useRef(false)

  return (
    <Pressable
      onPress={() => {
        if (didLongPressRef.current) {
          didLongPressRef.current = false
          return
        }

        onPress()
      }}
      onLongPress={() => {
        didLongPressRef.current = true
        onLongPress()
      }}
      delayLongPress={220}
      className='flex-row items-center gap-2.5 px-3 py-2 rounded-lg'
      style={({ pressed }) => ({
        backgroundColor: pressed ? `${colors.accent}80` : 'transparent',
      })}
    >
      <View
        className='w-1.5 h-1.5 rounded-full'
        style={{
          backgroundColor: isStreaming
            ? `${colors.primary}B3`
            : `${colors.mutedForeground}80`,
        }}
      />
      <Text
        className='flex-1 text-xs'
        numberOfLines={1}
        style={{ color: colors.foreground }}
      >
        {title}
      </Text>
      {isStreaming ? (
        <ActivityIndicator size={12} color={colors.primary} />
      ) : null}
    </Pressable>
  )
}

function ThreadActionsMenu({
  thread,
  colors,
}: {
  thread: ThreadSummary
  colors: ReturnType<typeof useColors>
}) {
  const convex = useConvex()
  const renameThread = useMutation(api.threads.rename)
  const deleteManyThreads = useMutation(api.threads.deleteMany)
  const { toast } = useToast()
  const [isOpen, setIsOpen] = useState(false)
  const [actionMode, setActionMode] = useState<ThreadActionMode>('menu')
  const [renameValue, setRenameValue] = useState(thread.title)
  const [pendingAction, setPendingAction] = useState<ThreadActionType | null>(
    null,
  )

  const resetMenuState = useCallback(() => {
    setActionMode('menu')
    setRenameValue(thread.title)
  }, [thread.title])

  const handleOpenMenu = useCallback(() => {
    resetMenuState()
    void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light)
    setIsOpen(true)
  }, [resetMenuState])

  const handleOpenChange = useCallback(
    (open: boolean) => {
      setIsOpen(open)

      if (!open) {
        resetMenuState()
      }
    },
    [resetMenuState],
  )

  const closeMenu = useCallback(() => {
    setIsOpen(false)
  }, [])

  const handleRenameThread = useCallback(async () => {
    const nextTitle = renameValue.trim()

    if (!nextTitle) {
      toast.show({
        variant: 'danger',
        label: 'Thread title cannot be empty',
      })
      return
    }

    if (nextTitle === thread.title) {
      closeMenu()
      return
    }

    setPendingAction('rename')

    try {
      await renameThread({
        threadId: thread._id,
        title: nextTitle,
      })
      toast.show({
        variant: 'success',
        label: 'Thread renamed',
      })
      closeMenu()
    } catch (error) {
      toast.show({
        variant: 'danger',
        label:
          error instanceof Error ? error.message : 'Failed to rename thread',
      })
    } finally {
      setPendingAction(null)
    }
  }, [closeMenu, renameThread, renameValue, thread, toast])

  const handleExportThread = useCallback(async () => {
    setPendingAction('export')

    try {
      const messages = (await convex.query(api.messages.listByThread, {
        threadId: thread._id,
      })) as ThreadMessage[]
      const markdown = buildThreadMarkdown(thread, messages)
      const shareResult = await Share.share({
        title: `${thread.title}.md`,
        message: markdown,
      })

      if (shareResult.action !== Share.dismissedAction) {
        toast.show({
          variant: 'success',
          label: 'Markdown export ready to share',
        })
        closeMenu()
      }
    } catch (error) {
      toast.show({
        variant: 'danger',
        label:
          error instanceof Error ? error.message : 'Failed to export thread',
      })
    } finally {
      setPendingAction(null)
    }
  }, [convex, thread, toast])

  const handleDeleteThread = useCallback(() => {
    Alert.alert('Delete thread?', `Delete "${thread.title}" permanently?`, [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Delete',
        style: 'destructive',
        onPress: async () => {
          setPendingAction('delete')

          try {
            await deleteManyThreads({ threadIds: [thread._id] })
            toast.show({
              variant: 'success',
              label: 'Thread deleted',
            })
            closeMenu()
          } catch (error) {
            toast.show({
              variant: 'danger',
              label:
                error instanceof Error
                  ? error.message
                  : 'Failed to delete thread',
            })
          } finally {
            setPendingAction(null)
          }
        },
      },
    ])
  }, [closeMenu, deleteManyThreads, thread, toast])

  return (
    <>
      <ThreadItem
        title={thread.title}
        isStreaming={thread.isStreaming}
        onPress={() => {
          router.navigate({
            pathname: '/(drawer)/chat/[threadId]',
            params: { threadId: thread._id },
          })
        }}
        onLongPress={handleOpenMenu}
        colors={colors}
      />

      <BottomSheet isOpen={isOpen} onOpenChange={handleOpenChange}>
        <BottomSheet.Portal>
          {isOpen ? (
            <>
              <BottomSheet.Overlay isCloseOnPress className='bg-transparent' />
              <Pressable
                className='absolute inset-0'
                onPress={closeMenu}
                style={{ backgroundColor: 'rgba(0, 0, 0, 0.24)' }}
              />
            </>
          ) : null}
          <BottomSheet.Content
            snapPoints={actionMode === 'menu' ? ['48%'] : ['40%']}
            contentContainerClassName='px-4 pt-2 pb-safe-offset-4'
            backgroundStyle={{
              backgroundColor: colors.card,
              borderTopLeftRadius: 28,
              borderTopRightRadius: 28,
              borderWidth: 1,
              borderColor: colors.border,
            }}
            handleIndicatorClassName='bg-muted'
            enablePanDownToClose
          >
            {actionMode === 'menu' ? (
              <View className='gap-2'>
                <View className='px-1 pb-1'>
                  <BottomSheet.Title
                    className='text-base font-semibold'
                    style={{ color: colors.foreground }}
                  >
                    Thread actions
                  </BottomSheet.Title>
                  <BottomSheet.Description
                    className='mt-1 text-sm'
                    style={{ color: colors.mutedForeground }}
                  >
                    {thread.title}
                  </BottomSheet.Description>
                </View>

                <Pressable
                  onPress={() => {
                    setActionMode('rename')
                    setRenameValue(thread.title)
                  }}
                  className='flex-row items-center gap-3 rounded-2xl px-4 py-3'
                  style={({ pressed }) => ({
                    backgroundColor: pressed ? colors.accent : `${colors.accent}B3`,
                  })}
                >
                  <Ionicons
                    name='create-outline'
                    size={18}
                    color={colors.foreground}
                  />
                  <View className='flex-1 min-w-0'>
                    <Text
                      className='text-sm font-medium'
                      style={{ color: colors.foreground }}
                    >
                      Rename
                    </Text>
                    <Text
                      className='mt-0.5 text-xs'
                      style={{ color: colors.mutedForeground }}
                    >
                      Change this thread title
                    </Text>
                  </View>
                </Pressable>

                <Pressable
                  onPress={() => {
                    void handleExportThread()
                  }}
                  className='flex-row items-center gap-3 rounded-2xl px-4 py-3'
                  style={({ pressed }) => ({
                    backgroundColor: pressed ? colors.accent : `${colors.accent}B3`,
                  })}
                >
                  {pendingAction === 'export' ? (
                    <ActivityIndicator size='small' color={colors.primary} />
                  ) : (
                    <Ionicons
                      name='document-text-outline'
                      size={18}
                      color={colors.foreground}
                    />
                  )}
                  <View className='flex-1 min-w-0'>
                    <Text
                      className='text-sm font-medium'
                      style={{ color: colors.foreground }}
                    >
                      Export as markdown
                    </Text>
                    <Text
                      className='mt-0.5 text-xs'
                      style={{ color: colors.mutedForeground }}
                    >
                      Share this thread as a markdown file
                    </Text>
                  </View>
                </Pressable>

                <View
                  className='mx-1 my-1 h-px'
                  style={{ backgroundColor: colors.border }}
                />

                <Text
                  className='px-1 text-[11px] font-medium uppercase'
                  style={{
                    color: colors.mutedForeground,
                    letterSpacing: 1.2,
                  }}
                >
                  Danger zone
                </Text>

                <Pressable
                  onPress={handleDeleteThread}
                  className='flex-row items-center gap-3 rounded-2xl px-4 py-3'
                  style={({ pressed }) => ({
                    backgroundColor: pressed
                      ? `${colors.destructive}1F`
                      : `${colors.destructive}14`,
                  })}
                >
                  {pendingAction === 'delete' ? (
                    <ActivityIndicator
                      size='small'
                      color={colors.destructive}
                    />
                  ) : (
                    <Ionicons
                      name='trash-outline'
                      size={18}
                      color={colors.destructive}
                    />
                  )}
                  <View className='flex-1 min-w-0'>
                    <Text
                      className='text-sm font-medium'
                      style={{ color: colors.destructive }}
                    >
                      Delete thread
                    </Text>
                    <Text
                      className='mt-0.5 text-xs'
                      style={{ color: colors.mutedForeground }}
                    >
                      Permanently remove this chat
                    </Text>
                  </View>
                </Pressable>
              </View>
            ) : (
              <View className='gap-3 px-1'>
                <View>
                  <BottomSheet.Title
                    className='text-base font-semibold'
                    style={{ color: colors.foreground }}
                  >
                    Rename thread
                  </BottomSheet.Title>
                  <BottomSheet.Description
                    className='mt-1 text-sm'
                    style={{ color: colors.mutedForeground }}
                  >
                    Update the title shown in your thread list.
                  </BottomSheet.Description>
                </View>

                <Input
                  value={renameValue}
                  onChangeText={setRenameValue}
                  autoFocus
                  placeholder='Thread title'
                  onSubmitEditing={() => {
                    void handleRenameThread()
                  }}
                />

                <View className='flex-row gap-2'>
                  <Pressable
                    onPress={() => {
                      setActionMode('menu')
                      setRenameValue(thread.title)
                    }}
                    disabled={pendingAction === 'rename'}
                    className='flex-1 items-center justify-center rounded-2xl px-4 py-3'
                    style={({ pressed }) => ({
                      backgroundColor: pressed
                        ? colors.accent
                        : `${colors.accent}B3`,
                      opacity: pendingAction === 'rename' ? 0.6 : 1,
                    })}
                  >
                    <Text
                      className='text-sm font-medium'
                      style={{ color: colors.foreground }}
                    >
                      Back
                    </Text>
                  </Pressable>
                  <Pressable
                    onPress={() => {
                      void handleRenameThread()
                    }}
                    disabled={pendingAction === 'rename'}
                    className='flex-1 items-center justify-center rounded-2xl px-4 py-3'
                    style={({ pressed }) => ({
                      backgroundColor: pressed
                        ? `${colors.primary}CC`
                        : colors.primary,
                      opacity: pendingAction === 'rename' ? 0.6 : 1,
                    })}
                  >
                    {pendingAction === 'rename' ? (
                      <ActivityIndicator
                        size='small'
                        color={colors.primaryForeground}
                      />
                    ) : (
                      <Text
                        className='text-sm font-medium'
                        style={{ color: colors.primaryForeground }}
                      >
                        Save
                      </Text>
                    )}
                  </Pressable>
                </View>
              </View>
            )}
          </BottomSheet.Content>
        </BottomSheet.Portal>
      </BottomSheet>
    </>
  )
}

type DrawerListItem =
  | { type: 'hint' }
  | { type: 'header'; label: string }
  | { type: 'thread'; thread: ThreadSummary }
  | { type: 'load-more' }
  | { type: 'loading-more' }

function SectionHeader({
  label,
  colors,
}: {
  label: string
  colors: ReturnType<typeof useColors>
}) {
  return (
    <Text
      className='px-3 py-2 text-[10px] font-medium uppercase'
      style={{
        fontFamily: Platform.OS === 'ios' ? 'Menlo' : 'monospace',
        color: colors.foreground,
        opacity: 0.4,
        letterSpacing: 2,
      }}
    >
      {label}
    </Text>
  )
}

function UserFooter({ colors }: { colors: ReturnType<typeof useColors> }) {
  const user = useQuery(api.auth.getCurrentUser)
  const displayName =
    user?.name?.trim() || user?.email?.split('@')[0] || 'Signed in'
  const displayEmail = user?.email || ''
  const initials =
    displayName
      .split(' ')
      .filter(Boolean)
      .slice(0, 2)
      .map((part) => part[0]?.toUpperCase())
      .join('') || 'BC'

  return (
    <View className='gap-3'>
      <View className='flex-row items-center gap-2.5'>
        <Pressable
          onPress={() => router.navigate('/(drawer)/settings')}
          className='flex-1 flex-row items-center gap-2.5 rounded-lg px-2 py-1.5'
          style={({ pressed }) => ({
            backgroundColor: pressed ? `${colors.accent}80` : 'transparent',
          })}
        >
          <View
            className='w-8 h-8 rounded-full items-center justify-center'
            style={{ backgroundColor: `${colors.primary}26` }}
          >
            <Text
              className='text-[10px] font-semibold'
              style={{ color: colors.primary }}
            >
              {initials}
            </Text>
          </View>

          <View className='flex-1 min-w-0'>
            <Text
              className='text-xs font-medium'
              numberOfLines={1}
              style={{ color: colors.foreground }}
            >
              {displayName}
            </Text>
            {displayEmail ? (
              <Text
                className='text-[10px]'
                numberOfLines={1}
                style={{ color: colors.mutedForeground }}
              >
                {displayEmail}
              </Text>
            ) : null}
          </View>
        </Pressable>

        <ThemeToggle />
      </View>

      <Pressable
        onPress={() => authClient.signOut()}
        className='flex-row items-center gap-2 px-2 py-2 rounded-lg'
        style={({ pressed }) => ({
          backgroundColor: pressed ? `${colors.accent}80` : 'transparent',
        })}
      >
        <Ionicons
          name='log-out-outline'
          size={16}
          color={colors.mutedForeground}
        />
        <Text className='text-xs' style={{ color: colors.mutedForeground }}>
          Sign out
        </Text>
      </Pressable>
    </View>
  )
}

function TemporaryChatShortcut({
  colors,
}: {
  colors: ReturnType<typeof useColors>
}) {
  const [storedTemporaryChatState] = useMMKVString(
    TEMPORARY_CHAT_STORAGE_KEY,
    appStorage,
  )
  const messageCount = useMemo(
    () => getTemporaryChatMessageCount(storedTemporaryChatState),
    [storedTemporaryChatState],
  )
  const isStreaming = useMemo(
    () => getTemporaryChatStreamingState(storedTemporaryChatState),
    [storedTemporaryChatState],
  )

  return (
    <Pressable
      onPress={() => router.navigate(TEMPORARY_CHAT_ROUTE)}
      className='mx-2 mt-2 mb-3 flex-row items-center gap-3 rounded-2xl px-3 py-3'
      style={({ pressed }) => ({
        backgroundColor: pressed ? colors.accent : `${colors.card}80`,
        borderWidth: 1,
        borderColor: `${colors.border}80`,
      })}
    >
      <View
        className='w-9 h-9 rounded-xl items-center justify-center'
        style={{ backgroundColor: `${colors.primary}14` }}
      >
        <Ionicons name='flash-outline' size={18} color={colors.primary} />
      </View>
      <View className='flex-1 min-w-0'>
        <Text
          className='text-sm font-semibold'
          style={{ color: colors.foreground }}
        >
          Temporary chat
        </Text>
        <Text
          className='mt-0.5 text-[11px]'
          style={{ color: colors.mutedForeground }}
          numberOfLines={1}
        >
          {messageCount > 0
            ? `${messageCount} message${messageCount === 1 ? '' : 's'} stored locally`
            : 'Local only, not in your history'}
        </Text>
      </View>
      {isStreaming ? (
        <ActivityIndicator size='small' color={colors.primary} />
      ) : (
        <Ionicons
          name='chevron-forward'
          size={14}
          color={colors.mutedForeground}
        />
      )}
    </Pressable>
  )
}

export function DrawerContent() {
  const colors = useColors()
  const insets = useSafeAreaInsets()

  const {
    results: threads,
    status,
    loadMore,
  } = usePaginatedQuery(
    api.threads.listPaginated,
    {},
    {
      initialNumItems: THREAD_PAGE_SIZE,
    },
  )

  const groups = useMemo(() => getThreadsByTimeGroup(threads), [threads])
  const isLoadingFirst = status === 'LoadingFirstPage'
  const canLoadMore = status === 'CanLoadMore'
  const isLoadingMore = status === 'LoadingMore'

  const listData = useMemo(() => {
    if (isLoadingFirst) return []
    if (threads.length === 0) return []

    const items: DrawerListItem[] = [{ type: 'hint' }]

    for (const group of groups) {
      items.push({ type: 'header', label: group.label })
      for (const thread of group.threads) {
        items.push({ type: 'thread', thread })
      }
    }

    if (canLoadMore) {
      items.push({ type: 'load-more' })
    }
    if (isLoadingMore) {
      items.push({ type: 'loading-more' })
    }

    return items
  }, [groups, threads.length, isLoadingFirst, canLoadMore, isLoadingMore])

  const renderItem = useCallback(
    ({ item }: { item: DrawerListItem }) => {
      switch (item.type) {
        case 'hint':
          return (
            <Text
              className='px-3 pb-2 text-[11px]'
              style={{ color: colors.mutedForeground }}
            >
              Long press any thread for actions.
            </Text>
          )
        case 'header':
          return <SectionHeader label={item.label} colors={colors} />
        case 'thread':
          return (
            <ThreadActionsMenu thread={item.thread} colors={colors} />
          )
        case 'load-more':
          return (
            <Pressable
              onPress={() => loadMore(THREAD_PAGE_SIZE)}
              className='px-3 py-3 items-center'
            >
              <Text
                className='text-[10px] uppercase font-medium'
                style={{
                  fontFamily: Platform.OS === 'ios' ? 'Menlo' : 'monospace',
                  color: colors.primary,
                  letterSpacing: 1,
                }}
              >
                Load more
              </Text>
            </Pressable>
          )
        case 'loading-more':
          return (
            <View className='px-3 py-3 items-center'>
              <ActivityIndicator size='small' color={colors.primary} />
            </View>
          )
      }
    },
    [colors, loadMore],
  )

  const keyExtractor = useCallback(
    (item: DrawerListItem, index: number) => {
      switch (item.type) {
        case 'hint':
          return 'hint'
        case 'header':
          return `header-${item.label}`
        case 'thread':
          return item.thread._id
        case 'load-more':
          return 'load-more'
        case 'loading-more':
          return 'loading-more'
        default:
          return `item-${index}`
      }
    },
    [],
  )

  const getItemType = useCallback((item: DrawerListItem) => item.type, [])

  return (
    <View className='flex-1' style={{ backgroundColor: colors.background }}>
      <View
        className='px-4 pb-3 flex-row items-center justify-between'
        style={{
          paddingTop: insets.top + 12,
          borderBottomWidth: 1,
          borderBottomColor: `${colors.border}80`,
        }}
      >
        <BrandMark colors={colors} />
        <Pressable
          onPress={() => {
            router.navigate('/(drawer)')
          }}
          className='w-8 h-8 items-center justify-center rounded-lg'
          style={({ pressed }) => ({
            backgroundColor: pressed ? colors.accent : 'transparent',
          })}
        >
          <Ionicons
            name='add-circle-outline'
            size={20}
            color={colors.mutedForeground}
          />
        </Pressable>
      </View>

      <View className='flex-1' style={{ paddingHorizontal: 8 }}>
        <TemporaryChatShortcut colors={colors} />
        {isLoadingFirst ? (
          <Text
            className='px-3 py-6 text-[10px] uppercase'
            style={{
              fontFamily: Platform.OS === 'ios' ? 'Menlo' : 'monospace',
              color: colors.foreground,
              opacity: 0.4,
              letterSpacing: 2,
            }}
          >
            Loading threads...
          </Text>
        ) : threads.length === 0 ? (
          <Text
            className='px-3 py-6 text-xs'
            style={{ color: colors.foreground, opacity: 0.5 }}
          >
            No threads yet.
          </Text>
        ) : (
          <FlashList
            data={listData}
            renderItem={renderItem}
            keyExtractor={keyExtractor}
            getItemType={getItemType}

            contentContainerStyle={{
              paddingTop: 8,
              paddingBottom: 8,
            }}
            keyboardShouldPersistTaps='handled'
          />
        )}
      </View>

      <View
        className='px-4 pt-3'
        style={{
          paddingBottom: insets.bottom + 12,
          borderTopWidth: 1,
          borderTopColor: `${colors.border}80`,
        }}
      >
        <UserFooter colors={colors} />
      </View>
    </View>
  )
}
