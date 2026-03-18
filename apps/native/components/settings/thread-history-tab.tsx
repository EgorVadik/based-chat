import { api } from '@based-chat/backend/convex/_generated/api'
import type { Id } from '@based-chat/backend/convex/_generated/dataModel'
import { Ionicons } from '@expo/vector-icons'
import { useMutation, usePaginatedQuery } from 'convex/react'
import { useToast } from 'heroui-native'
import { useEffect, useMemo, useState } from 'react'
import {
  ActivityIndicator,
  Alert,
  Pressable,
  Text,
  View,
} from 'react-native'

import { useColors } from '@/lib/use-colors'
import { ThemedButton } from './themed-button'

type ThreadId = Id<'threads'>

const THREAD_PAGE_SIZE = 10

function formatRelativeDate(timestamp: number) {
  const diff = Math.max(0, Date.now() - timestamp)
  const days = Math.floor(diff / (1000 * 60 * 60 * 24))

  if (days === 0) return 'today'
  if (days === 1) return 'yesterday'
  if (days < 7) return `${days} days ago`
  if (days < 30) return `${Math.floor(days / 7)} weeks ago`
  if (days < 60) return 'about a month ago'
  return `about ${Math.floor(days / 30)} months ago`
}

function formatAbsoluteDate(timestamp: number) {
  return new Intl.DateTimeFormat('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  }).format(timestamp)
}

export default function ThreadHistoryTab() {
  const colors = useColors()
  const { toast } = useToast()
  const { results: threads, status, loadMore } = usePaginatedQuery(
    api.threads.listPaginated,
    {},
    { initialNumItems: THREAD_PAGE_SIZE },
  )
  const deleteManyThreads = useMutation(api.threads.deleteMany)
  const [selectedIds, setSelectedIds] = useState<Set<ThreadId>>(new Set())
  const [sortAsc, setSortAsc] = useState(false)
  const [isDeleting, setIsDeleting] = useState(false)
  const [currentPage, setCurrentPage] = useState(0)

  const threadIdSet = useMemo(() => new Set(threads.map((t) => t._id)), [threads])

  useEffect(() => {
    setSelectedIds((prev) => {
      const next = new Set([...prev].filter((id) => threadIdSet.has(id)))
      return next.size === prev.size ? prev : next
    })
  }, [threadIdSet])

  const sortedThreads = useMemo(() => {
    return [...threads].sort((a, b) =>
      sortAsc ? a.updatedAt - b.updatedAt : b.updatedAt - a.updatedAt,
    )
  }, [threads, sortAsc])

  const totalPages = sortedThreads.length > 0
    ? Math.ceil(sortedThreads.length / THREAD_PAGE_SIZE)
    : 1
  const pageStart = currentPage * THREAD_PAGE_SIZE
  const visibleThreads = sortedThreads.slice(pageStart, pageStart + THREAD_PAGE_SIZE)
  const allSelected =
    visibleThreads.length > 0 &&
    visibleThreads.every((t) => selectedIds.has(t._id))

  const isLoadingFirstPage = status === 'LoadingFirstPage'
  const isLoadingMore = status === 'LoadingMore'
  const canLoadMore = status === 'CanLoadMore'
  const hasLoadedNextPage = currentPage < totalPages - 1
  const canGoPrev = currentPage > 0
  const canGoNext = hasLoadedNextPage || canLoadMore

  useEffect(() => {
    setCurrentPage((v) => Math.min(v, totalPages - 1))
  }, [totalPages])

  const toggleSelect = (id: ThreadId) => {
    setSelectedIds((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  const toggleSelectAll = () => {
    if (allSelected) {
      setSelectedIds((prev) => {
        const next = new Set(prev)
        for (const t of visibleThreads) next.delete(t._id)
        return next
      })
    } else {
      setSelectedIds((prev) => {
        const next = new Set(prev)
        for (const t of visibleThreads) next.add(t._id)
        return next
      })
    }
  }

  const handleNextPage = () => {
    if (hasLoadedNextPage) {
      setCurrentPage((v) => v + 1)
      return
    }
    if (!canLoadMore || isLoadingMore) return
    loadMore(THREAD_PAGE_SIZE)
    setCurrentPage((v) => v + 1)
  }

  const handleDelete = (threadIds: ThreadId[]) => {
    if (threadIds.length === 0 || isDeleting) return

    Alert.alert(
      'Delete threads?',
      `Delete ${threadIds.length} thread${threadIds.length === 1 ? '' : 's'} permanently?`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete',
          style: 'destructive',
          onPress: async () => {
            setIsDeleting(true)
            try {
              const { deletedCount } = await deleteManyThreads({ threadIds })
              setSelectedIds((prev) => {
                const next = new Set(prev)
                for (const id of threadIds) next.delete(id)
                return next
              })
              toast.show({
                variant: 'success',
                label: `Deleted ${deletedCount} thread${deletedCount === 1 ? '' : 's'}.`,
              })
            } catch (error) {
              toast.show({
                variant: 'danger',
                label: error instanceof Error ? error.message : 'Failed to delete threads.',
              })
            } finally {
              setIsDeleting(false)
            }
          },
        },
      ],
    )
  }

  return (
    <View className='gap-6'>
      <View>
        <Text
          className='text-xl font-semibold'
          style={{ color: colors.foreground, letterSpacing: -0.3 }}
        >
          Chat History
        </Text>
        <Text className='mt-1 text-sm' style={{ color: colors.mutedForeground }}>
          Review your conversation history or delete threads you no longer need.
        </Text>
      </View>

      <View
        className='rounded-xl overflow-hidden'
        style={{ borderWidth: 1, borderColor: `${colors.border}80` }}
      >
        <View
          className='flex-row items-center gap-3 px-3 py-2.5'
          style={{ backgroundColor: `${colors.muted}33`, borderBottomWidth: 1, borderBottomColor: `${colors.border}60` }}
        >
          <Pressable onPress={toggleSelectAll} disabled={visibleThreads.length === 0 || isDeleting}>
            <Ionicons
              name={allSelected ? 'checkbox' : 'square-outline'}
              size={18}
              color={allSelected ? colors.primary : `${colors.mutedForeground}60`}
            />
          </Pressable>

          <Text
            className='flex-1 text-[11px] font-medium uppercase'
            style={{ color: colors.mutedForeground, letterSpacing: 1 }}
          >
            Title
          </Text>

          {selectedIds.size > 0 && (
            <ThemedButton
              variant='danger'
              size='sm'
              onPress={() => handleDelete([...selectedIds])}
              disabled={isDeleting}
            >
              {`Delete (${selectedIds.size})`}
            </ThemedButton>
          )}

          <Pressable onPress={() => setSortAsc((v) => !v)} disabled={isDeleting}>
            <Ionicons
              name='swap-vertical-outline'
              size={16}
              color={colors.mutedForeground}
            />
          </Pressable>
        </View>

        {isLoadingFirstPage && (
          <View className='py-12 items-center'>
            <ActivityIndicator size='small' color={colors.primary} />
          </View>
        )}

        {!isLoadingFirstPage && visibleThreads.length === 0 && (
          <View className='py-12 items-center'>
            <Text className='text-xs' style={{ color: `${colors.mutedForeground}60` }}>
              No threads.
            </Text>
          </View>
        )}

        {!isLoadingFirstPage &&
          visibleThreads.map((thread, index) => {
            const isSelected = selectedIds.has(thread._id)

            return (
              <Pressable
                key={thread._id}
                onPress={() => toggleSelect(thread._id)}
                className='flex-row items-center gap-3 px-3 py-3'
                style={{
                  backgroundColor: isSelected ? `${colors.primary}0D` : 'transparent',
                  borderBottomWidth: index < visibleThreads.length - 1 ? 1 : 0,
                  borderBottomColor: `${colors.border}40`,
                }}
              >
                <Ionicons
                  name={isSelected ? 'checkbox' : 'square-outline'}
                  size={18}
                  color={isSelected ? colors.primary : `${colors.mutedForeground}40`}
                />

                <View className='flex-1 min-w-0'>
                  <Text
                    className='text-xs font-medium'
                    numberOfLines={1}
                    style={{ color: colors.foreground }}
                  >
                    {thread.title}
                  </Text>
                  <Text
                    className='mt-0.5 text-[11px]'
                    style={{ color: `${colors.mutedForeground}80` }}
                  >
                    Updated {formatRelativeDate(thread.updatedAt)} on{' '}
                    {formatAbsoluteDate(thread.updatedAt)}
                  </Text>
                </View>

                <Pressable
                  onPress={(e) => {
                    e.stopPropagation()
                    handleDelete([thread._id])
                  }}
                  className='p-1'
                  disabled={isDeleting}
                >
                  <Ionicons
                    name='trash-outline'
                    size={14}
                    color={`${colors.mutedForeground}40`}
                  />
                </Pressable>
              </Pressable>
            )
          })}

        {!isLoadingFirstPage && sortedThreads.length > 0 && (
          <View
            className='flex-row justify-end items-center gap-2 px-3 py-3'
            style={{ borderTopWidth: 1, borderTopColor: `${colors.border}40` }}
          >
            <ThemedButton
              variant='outline'
              size='sm'
              onPress={() => setCurrentPage((v) => Math.max(0, v - 1))}
              disabled={!canGoPrev || isDeleting || isLoadingMore}
            >
              Prev
            </ThemedButton>
            <ThemedButton
              variant='outline'
              size='sm'
              onPress={handleNextPage}
              disabled={!canGoNext || isDeleting || isLoadingMore}
            >
              {isLoadingMore ? 'Loading...' : 'Next'}
            </ThemedButton>
          </View>
        )}
      </View>
    </View>
  )
}
