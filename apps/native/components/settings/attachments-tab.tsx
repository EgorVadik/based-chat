import { api } from '@based-chat/backend/convex/_generated/api'
import type { Id } from '@based-chat/backend/convex/_generated/dataModel'
import { Ionicons } from '@expo/vector-icons'
import { useMutation, useQuery } from 'convex/react'
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

type StorageId = Id<'_storage'>

type SettingsAttachment = {
  id: StorageId
  storageId: StorageId
  messageId: Id<'messages'>
  threadId: Id<'threads'>
  threadTitle: string
  kind: 'image' | 'file'
  fileName: string
  contentType: string
  size: number
  createdAt: number
  updatedAt: number
  url: string | null
}

const ATTACHMENTS_PAGE_SIZE = 10

function getFileIconName(contentType: string) {
  if (contentType.startsWith('image/')) return 'image-outline' as const
  if (contentType.includes('pdf')) return 'document-text-outline' as const
  if (
    contentType.includes('typescript') ||
    contentType.includes('javascript') ||
    contentType.includes('json')
  )
    return 'code-slash-outline' as const
  return 'document-outline' as const
}

function getFileColor(contentType: string, colors: ReturnType<typeof useColors>) {
  if (contentType.startsWith('image/')) return '#60a5faB3'
  if (contentType.includes('pdf')) return '#f87171B3'
  if (
    contentType.includes('typescript') ||
    contentType.includes('javascript') ||
    contentType.includes('json')
  )
    return '#4ade80B3'
  return colors.mutedForeground
}

function formatDate(timestamp: number) {
  return new Intl.DateTimeFormat('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  }).format(timestamp)
}

function formatSize(size: number) {
  if (size >= 1024 * 1024) return `${(size / (1024 * 1024)).toFixed(1)} MB`
  return `${Math.max(1, Math.round(size / 1024))} KB`
}

export default function AttachmentsTab() {
  const colors = useColors()
  const { toast } = useToast()
  const attachmentResults = useQuery(
    (api.messages as { listUserAttachments: any }).listUserAttachments,
    {},
  ) as SettingsAttachment[] | undefined
  const attachments = attachmentResults ?? []
  const deleteManyAttachments = useMutation(
    (api.messages as { deleteManyAttachments: any }).deleteManyAttachments,
  )

  const [selectedIds, setSelectedIds] = useState<Set<StorageId>>(new Set())
  const [sortAsc, setSortAsc] = useState(false)
  const [isDeleting, setIsDeleting] = useState(false)
  const [currentPage, setCurrentPage] = useState(0)

  const attachmentIdSet = useMemo(
    () => new Set(attachments.map((a) => a.storageId)),
    [attachments],
  )

  useEffect(() => {
    setSelectedIds((prev) => {
      const next = new Set([...prev].filter((id) => attachmentIdSet.has(id)))
      return next.size === prev.size ? prev : next
    })
  }, [attachmentIdSet])

  const sortedAttachments = useMemo(() => {
    return [...attachments].sort((a, b) =>
      sortAsc ? a.createdAt - b.createdAt : b.createdAt - a.createdAt,
    )
  }, [attachments, sortAsc])

  const totalPages = sortedAttachments.length > 0
    ? Math.ceil(sortedAttachments.length / ATTACHMENTS_PAGE_SIZE)
    : 1
  const pageStart = currentPage * ATTACHMENTS_PAGE_SIZE
  const visibleAttachments = sortedAttachments.slice(pageStart, pageStart + ATTACHMENTS_PAGE_SIZE)
  const allSelected =
    visibleAttachments.length > 0 &&
    visibleAttachments.every((a) => selectedIds.has(a.storageId))
  const canGoPrev = currentPage > 0
  const canGoNext = currentPage < totalPages - 1

  useEffect(() => {
    setCurrentPage((v) => Math.min(v, totalPages - 1))
  }, [totalPages])

  const toggleSelect = (id: StorageId) => {
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
        for (const a of visibleAttachments) next.delete(a.storageId)
        return next
      })
    } else {
      setSelectedIds((prev) => {
        const next = new Set(prev)
        for (const a of visibleAttachments) next.add(a.storageId)
        return next
      })
    }
  }

  const handleDelete = (storageIds: StorageId[]) => {
    if (storageIds.length === 0 || isDeleting) return

    Alert.alert(
      'Delete attachments?',
      `Delete ${storageIds.length} attachment${storageIds.length === 1 ? '' : 's'} permanently?`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete',
          style: 'destructive',
          onPress: async () => {
            setIsDeleting(true)
            try {
              const { deletedCount } = await deleteManyAttachments({ storageIds })
              setSelectedIds((prev) => {
                const next = new Set(prev)
                for (const id of storageIds) next.delete(id)
                return next
              })
              toast.show({
                variant: 'success',
                label: `Deleted ${deletedCount} attachment${deletedCount === 1 ? '' : 's'}.`,
              })
            } catch (error) {
              toast.show({
                variant: 'danger',
                label: error instanceof Error ? error.message : 'Failed to delete attachments.',
              })
            } finally {
              setIsDeleting(false)
            }
          },
        },
      ],
    )
  }

  const isLoading = attachmentResults === undefined

  return (
    <View className='gap-6'>
      <View>
        <Text
          className='text-xl font-semibold'
          style={{ color: colors.foreground, letterSpacing: -0.3 }}
        >
          Attachments
        </Text>
        <Text className='mt-1 text-sm' style={{ color: colors.mutedForeground }}>
          Browse your uploaded files and manage storage.
        </Text>
      </View>

      <View className='flex-row items-center justify-between'>
        <Text className='text-xs' style={{ color: colors.mutedForeground }}>
          {attachments.length} file{attachments.length !== 1 ? 's' : ''}
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
      </View>

      <View
        className='rounded-xl overflow-hidden'
        style={{ borderWidth: 1, borderColor: `${colors.border}80` }}
      >
        <View
          className='flex-row items-center gap-3 px-3 py-2.5'
          style={{ backgroundColor: `${colors.muted}33`, borderBottomWidth: 1, borderBottomColor: `${colors.border}60` }}
        >
          <Pressable onPress={toggleSelectAll} disabled={visibleAttachments.length === 0 || isDeleting}>
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
            Name
          </Text>
          <Pressable onPress={() => setSortAsc((v) => !v)} disabled={isDeleting}>
            <Ionicons name='swap-vertical-outline' size={16} color={colors.mutedForeground} />
          </Pressable>
        </View>

        {isLoading && (
          <View className='py-12 items-center'>
            <ActivityIndicator size='small' color={colors.primary} />
          </View>
        )}

        {!isLoading && visibleAttachments.length === 0 && (
          <View className='py-12 items-center'>
            <Text className='text-xs' style={{ color: `${colors.mutedForeground}60` }}>
              No attachments.
            </Text>
          </View>
        )}

        {!isLoading &&
          visibleAttachments.map((attachment, index) => {
            const isSelected = selectedIds.has(attachment.storageId)
            const iconName = getFileIconName(attachment.contentType)
            const iconColor = getFileColor(attachment.contentType, colors)

            return (
              <Pressable
                key={attachment.storageId}
                onPress={() => toggleSelect(attachment.storageId)}
                className='flex-row items-center gap-3 px-3 py-3'
                style={{
                  backgroundColor: isSelected ? `${colors.primary}0D` : 'transparent',
                  borderBottomWidth: index < visibleAttachments.length - 1 ? 1 : 0,
                  borderBottomColor: `${colors.border}40`,
                }}
              >
                <Ionicons
                  name={isSelected ? 'checkbox' : 'square-outline'}
                  size={18}
                  color={isSelected ? colors.primary : `${colors.mutedForeground}40`}
                />

                <View
                  className='w-9 h-9 rounded-md items-center justify-center'
                  style={{ backgroundColor: `${colors.muted}50`, borderWidth: 1, borderColor: `${colors.border}40` }}
                >
                  <Ionicons name={iconName} size={16} color={iconColor} />
                </View>

                <View className='flex-1 min-w-0'>
                  <Text
                    className='text-xs font-medium'
                    numberOfLines={1}
                    style={{ color: colors.foreground }}
                  >
                    {attachment.fileName}
                  </Text>
                  <Text
                    className='mt-0.5 text-[10px]'
                    numberOfLines={1}
                    style={{ color: `${colors.mutedForeground}80` }}
                  >
                    {attachment.threadTitle} &middot; {formatSize(attachment.size)}
                  </Text>
                </View>

                <Text
                  className='text-[10px]'
                  style={{ color: `${colors.mutedForeground}80` }}
                >
                  {formatDate(attachment.createdAt)}
                </Text>

                <Pressable
                  onPress={(e) => {
                    e.stopPropagation()
                    handleDelete([attachment.storageId])
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

        {!isLoading && sortedAttachments.length > 0 && (
          <View
            className='flex-row justify-end items-center gap-2 px-3 py-3'
            style={{ borderTopWidth: 1, borderTopColor: `${colors.border}40` }}
          >
            <ThemedButton
              variant='outline'
              size='sm'
              onPress={() => setCurrentPage((v) => Math.max(0, v - 1))}
              disabled={!canGoPrev || isDeleting}
            >
              Prev
            </ThemedButton>
            <ThemedButton
              variant='outline'
              size='sm'
              onPress={() => setCurrentPage((v) => Math.min(totalPages - 1, v + 1))}
              disabled={!canGoNext || isDeleting}
            >
              Next
            </ThemedButton>
          </View>
        )}
      </View>
    </View>
  )
}
