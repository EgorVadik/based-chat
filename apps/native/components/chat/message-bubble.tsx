import { Ionicons } from '@expo/vector-icons'
import * as Clipboard from 'expo-clipboard'
import * as Haptics from 'expo-haptics'
import { useToast } from 'heroui-native'
import { memo, useCallback, useMemo, useState } from 'react'
import {
  Dimensions,
  Image,
  Linking,
  Modal,
  Platform,
  Pressable,
  Text,
  TextInput,
  View,
} from 'react-native'
import { Markdown } from 'react-native-remark'

import ModelSelector from '@/components/chat/model-selector'
import { DEFAULT_MODEL, getModelById } from '@/lib/models'
import { useColors } from '@/lib/use-colors'

const SCREEN_WIDTH = Dimensions.get('window').width
const TOAST_DURATION_MS = 5000

export type MessageAttachment = {
  kind: string
  storageId: string
  fileName: string
  contentType: string
  size: number
  url?: string
}

export type MessageSource = {
  id: string
  url: string
  title?: string
  snippet?: string
  hostname?: string
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

export type ChatMessage = {
  id: string
  role: 'user' | 'system'
  content: string
  reasoningText?: string
  sources?: MessageSource[]
  attachments?: MessageAttachment[]
  modelId?: string
  modelName?: string
  streamId?: string
  createdAt: number
  updatedAt?: number
  streamStatus?: 'pending' | 'streaming' | 'done' | 'error' | 'timeout'
  errorMessage?: string
  generationStats?: GenerationStats
}

const integerFormatter = new Intl.NumberFormat('en-US')

function formatTokensPerSecond(tokensPerSecond: number) {
  return `${tokensPerSecond.toFixed(1)} tok/s`
}

function formatCostUsd(costUsd: number) {
  return `$${costUsd.toFixed(costUsd >= 0.01 ? 4 : 6)}`
}

function formatTokenCount(tokenCount: number) {
  return `${integerFormatter.format(tokenCount)} tokens`
}

const monoFont = Platform.OS === 'ios' ? 'Menlo' : 'monospace'

function useMarkdownStyles(colors: ReturnType<typeof useColors>) {
  return useMemo(
    () => ({
      text: {
        color: colors.foreground,
        fontSize: 14,
        lineHeight: 24,
      },
      paragraph: {
        marginTop: 0,
        marginBottom: 8,
      },
      heading: (level: number) => ({
        color: colors.foreground,
        fontWeight: '700' as const,
        marginTop: level <= 2 ? 16 : 12,
        marginBottom: level <= 2 ? 8 : 4,
        fontSize: level === 1 ? 22 : level === 2 ? 19 : level === 3 ? 16 : 14,
        lineHeight: level === 1 ? 30 : level === 2 ? 26 : level === 3 ? 24 : 22,
      }),
      strong: {
        fontWeight: '600' as const,
        color: colors.foreground,
      },
      emphasis: {
        fontStyle: 'italic' as const,
        color: colors.foreground,
      },
      link: {
        color: colors.primary,
        textDecorationLine: 'underline' as const,
      },
      blockquote: {
        backgroundColor: `${colors.card}CC`,
        borderLeftWidth: 3,
        borderLeftColor: colors.primary,
        paddingLeft: 12,
        paddingVertical: 6,
        marginVertical: 8,
        borderRadius: 4,
      },
      inlineCode: {
        backgroundColor: `${colors.muted}CC`,
        color: colors.foreground,
        fontFamily: monoFont,
        fontSize: 12.5,
        paddingHorizontal: 5,
        paddingVertical: 2,
        borderRadius: 4,
      },
      codeBlock: {
        headerBackgroundColor: `${colors.muted}`,
        contentBackgroundColor: colors.card,
        headerTextStyle: {
          color: colors.mutedForeground,
          fontFamily: monoFont,
          fontSize: 12,
        },
        contentTextStyle: {
          color: colors.foreground,
          fontFamily: monoFont,
          fontSize: 12,
          lineHeight: 20,
        },
      },
      list: {
        marginVertical: 4,
      },
      listItem: {
        marginVertical: 2,
        color: colors.foreground,
      },
      tableCell: {
        padding: 8,
        color: colors.foreground,
        fontSize: 12,
        borderWidth: 1,
        borderColor: `${colors.border}60`,
      },
      thematicBreak: {
        backgroundColor: `${colors.border}80`,
        height: 1,
        marginVertical: 12,
      },
      delete: {
        textDecorationLine: 'line-through' as const,
        color: colors.mutedForeground,
      },
      image: {
        borderRadius: 12,
        marginVertical: 8,
      },
      container: {
        overflow: 'hidden' as const,
      },
    }),
    [colors],
  )
}

function isImageAttachment(attachment: MessageAttachment) {
  return (
    attachment.kind === 'image' ||
    attachment.contentType.startsWith('image/')
  )
}

function ImageAttachmentGrid({
  attachments,
  colors,
}: {
  attachments: MessageAttachment[]
  colors: ReturnType<typeof useColors>
}) {
  const images = attachments.filter(isImageAttachment)
  const files = attachments.filter((a) => !isImageAttachment(a))
  const [viewingImage, setViewingImage] = useState<string | null>(null)

  if (images.length === 0 && files.length === 0) return null

  const maxImageWidth = SCREEN_WIDTH * 0.7
  const isSingle = images.length === 1
  const imageWidth = isSingle ? maxImageWidth : (maxImageWidth - 6) / 2
  const imageHeight = isSingle ? 220 : 140

  return (
    <>
      {images.length > 0 ? (
        <View
          className='flex-row flex-wrap gap-1.5'
          style={{ maxWidth: maxImageWidth }}
        >
          {images.map((attachment) =>
            attachment.url ? (
              <Pressable
                key={attachment.storageId}
                onPress={() => setViewingImage(attachment.url!)}
                style={{
                  width: imageWidth,
                  height: imageHeight,
                  borderRadius: 14,
                  overflow: 'hidden',
                  borderWidth: 1,
                  borderColor: `${colors.border}60`,
                }}
              >
                <Image
                  source={{ uri: attachment.url }}
                  style={{ width: '100%', height: '100%' }}
                  resizeMode='cover'
                />
                <View
                  style={{
                    position: 'absolute',
                    bottom: 0,
                    left: 0,
                    right: 0,
                    paddingHorizontal: 8,
                    paddingVertical: 5,
                    backgroundColor: 'rgba(0,0,0,0.55)',
                  }}
                >
                  <Text
                    numberOfLines={1}
                    style={{ color: '#fff', fontSize: 10 }}
                  >
                    {attachment.fileName}
                  </Text>
                </View>
              </Pressable>
            ) : (
              <View
                key={attachment.storageId}
                style={{
                  width: imageWidth,
                  height: imageHeight,
                  borderRadius: 14,
                  backgroundColor: `${colors.muted}80`,
                  alignItems: 'center',
                  justifyContent: 'center',
                }}
              >
                <Text
                  className='text-xs'
                  style={{ color: colors.mutedForeground }}
                >
                  Preview unavailable
                </Text>
              </View>
            ),
          )}
        </View>
      ) : null}

      {files.length > 0 ? (
        <View className='gap-1.5' style={{ maxWidth: maxImageWidth }}>
          {files.map((attachment) => (
            <View
              key={attachment.storageId}
              className='flex-row items-center gap-2 rounded-xl px-2.5 py-2'
              style={{
                backgroundColor: `${colors.card}CC`,
                borderWidth: 1,
                borderColor: `${colors.border}80`,
              }}
            >
              <Ionicons
                name='document-outline'
                size={14}
                color={colors.mutedForeground}
              />
              <Text
                className='flex-1 text-xs'
                numberOfLines={1}
                style={{ color: colors.foreground }}
              >
                {attachment.fileName}
              </Text>
              <Text
                className='text-[10px]'
                style={{ color: colors.mutedForeground }}
              >
                {Math.max(1, Math.round(attachment.size / 1024))} KB
              </Text>
            </View>
          ))}
        </View>
      ) : null}

      {/* Full-screen image viewer */}
      <Modal
        visible={viewingImage !== null}
        transparent
        animationType='fade'
        onRequestClose={() => setViewingImage(null)}
      >
        <Pressable
          onPress={() => setViewingImage(null)}
          style={{
            flex: 1,
            backgroundColor: 'rgba(0,0,0,0.92)',
            alignItems: 'center',
            justifyContent: 'center',
          }}
        >
          {viewingImage ? (
            <Image
              source={{ uri: viewingImage }}
              style={{
                width: SCREEN_WIDTH - 32,
                height: SCREEN_WIDTH - 32,
              }}
              resizeMode='contain'
            />
          ) : null}
          <View
            style={{
              position: 'absolute',
              top: 60,
              right: 20,
            }}
          >
            <Ionicons name='close-circle' size={32} color='#ffffffCC' />
          </View>
        </Pressable>
      </Modal>
    </>
  )
}

function ActionButton({
  icon,
  label,
  onPress,
  colors,
}: {
  icon: keyof typeof Ionicons.glyphMap
  label: string
  onPress: () => void
  colors: ReturnType<typeof useColors>
}) {
  return (
    <Pressable
      onPress={onPress}
      hitSlop={8}
      className='flex-row items-center gap-1 rounded-full px-2 py-1'
      style={({ pressed }) => ({
        backgroundColor: pressed ? `${colors.muted}B3` : 'transparent',
      })}
    >
      <Ionicons name={icon} size={13} color={colors.mutedForeground} />
      <Text className='text-[11px]' style={{ color: colors.mutedForeground }}>
        {label}
      </Text>
    </Pressable>
  )
}

function MessageBubble({
  message,
  onRetry,
  onSaveEdit,
}: {
  message: ChatMessage
  onRetry?: (message: ChatMessage) => void
  onSaveEdit?: (
    message: ChatMessage,
    nextValue: string,
    nextModelId: string,
  ) => Promise<void> | void
}) {
  const colors = useColors()
  const { toast } = useToast()
  const markdownStyles = useMarkdownStyles(colors)
  const isUser = message.role === 'user'
  const isStreaming =
    !isUser &&
    (message.streamStatus === 'pending' || message.streamStatus === 'streaming')
  const hasError =
    !isUser &&
    (message.streamStatus === 'error' || message.streamStatus === 'timeout')
  const [showReasoning, setShowReasoning] = useState(false)
  const [showSources, setShowSources] = useState(false)
  const [isEditing, setIsEditing] = useState(false)
  const [editingValue, setEditingValue] = useState(message.content)
  const [editingModelId, setEditingModelId] = useState(
    message.modelId ?? DEFAULT_MODEL.id,
  )
  const [isSavingEdit, setIsSavingEdit] = useState(false)
  const modelLabel = message.modelName ?? message.modelId ?? 'Assistant'
  const editingModel = getModelById(editingModelId) ?? DEFAULT_MODEL
  const canSaveEdit =
    !isSavingEdit &&
    (editingValue.trim().length > 0 ||
      (message.attachments?.length ?? 0) > 0)
  const tokenCount =
    message.generationStats?.textTokens ??
    message.generationStats?.outputTokens ??
    message.generationStats?.totalTokens

  const handleCopy = async () => {
    await Clipboard.setStringAsync(message.content || message.reasoningText || '')
    void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success)
    toast.show({
      variant: 'success',
      label: 'Copied to clipboard',
      duration: TOAST_DURATION_MS,
    })
  }

  const handleLinkPress = (url: string) => {
    void Linking.openURL(url)
  }

  const openEdit = useCallback(() => {
    setEditingValue(message.content)
    setEditingModelId(message.modelId ?? DEFAULT_MODEL.id)
    setIsEditing(true)
  }, [message.content, message.modelId])

  const handleSaveEdit = useCallback(async () => {
    if (!onSaveEdit) {
      return
    }

    setIsSavingEdit(true)
    try {
      await onSaveEdit(message, editingValue.trim(), editingModel.id)
      setIsEditing(false)
    } finally {
      setIsSavingEdit(false)
    }
  }, [editingModel.id, editingValue, message, onSaveEdit])

  if (isUser) {
    return (
      <View className='px-4 py-1.5 items-end'>
        <View
          className='max-w-[85%] rounded-2xl px-3.5 py-2.5'
          style={{
            backgroundColor: isEditing ? `${colors.card}E6` : colors.muted,
            borderWidth: isEditing ? 1 : 0,
            borderColor: isEditing ? `${colors.border}80` : 'transparent',
          }}
        >
          {message.attachments && message.attachments.length > 0 ? (
            <View className='mb-2'>
              <ImageAttachmentGrid
                attachments={message.attachments}
                colors={colors}
              />
            </View>
          ) : null}
          {isEditing ? (
            <View className='gap-3'>
              <TextInput
                value={editingValue}
                onChangeText={setEditingValue}
                multiline
                className='text-sm'
                style={{
                  color: colors.foreground,
                  minHeight: 110,
                  textAlignVertical: 'top',
                }}
                placeholder='Edit message...'
                placeholderTextColor={`${colors.mutedForeground}80`}
              />

              <View className='flex-row items-center justify-between gap-3'>
                <View className='flex-1'>
                  <ModelSelector
                    model={editingModel}
                    onModelChange={(nextModel) => setEditingModelId(nextModel.id)}
                  />
                </View>
                <View className='flex-row items-center gap-2'>
                  <ActionButton
                    icon='close-outline'
                    label='Cancel'
                    onPress={() => setIsEditing(false)}
                    colors={colors}
                  />
                  <ActionButton
                    icon={isSavingEdit ? 'time-outline' : 'arrow-up-outline'}
                    label='Save'
                    onPress={() => {
                      if (canSaveEdit) {
                        void handleSaveEdit()
                      }
                    }}
                    colors={colors}
                  />
                </View>
              </View>

              {(message.attachments?.length ?? 0) > 0 ? (
                <Text
                  className='text-[11px]'
                  style={{ color: colors.mutedForeground }}
                >
                  Existing attachments will be preserved.
                </Text>
              ) : null}
            </View>
          ) : message.content ? (
            <Text
              className='text-sm leading-relaxed'
              style={{ color: colors.foreground }}
              selectable
            >
              {message.content}
            </Text>
          ) : null}
        </View>

        {!isEditing ? (
          <View className='mt-2 flex-row items-center gap-1 flex-wrap justify-end'>
            {onRetry ? (
              <ActionButton
                icon='refresh-outline'
                label='Retry'
                onPress={() => onRetry(message)}
                colors={colors}
              />
            ) : null}
            {onSaveEdit ? (
              <ActionButton
                icon='create-outline'
                label='Edit'
                onPress={openEdit}
                colors={colors}
              />
            ) : null}
            <ActionButton
              icon='copy-outline'
              label='Copy'
              onPress={() => {
                void handleCopy()
              }}
              colors={colors}
            />
          </View>
        ) : null}
      </View>
    )
  }

  return (
    <View className='px-4 py-1.5'>
      <View className='w-full'>
        {message.reasoningText ? (
          <Pressable
            onPress={() => setShowReasoning((open) => !open)}
            className='flex-row items-center gap-1.5 mb-2'
          >
            <Ionicons
              name='bulb-outline'
              size={14}
              color={`${colors.foreground}BF`}
            />
            <Text
              className='text-xs font-medium'
              style={{ color: `${colors.foreground}E6` }}
            >
              Reasoning
            </Text>
            <Ionicons
              name={showReasoning ? 'chevron-up' : 'chevron-down'}
              size={12}
              color={colors.mutedForeground}
            />
          </Pressable>
        ) : null}

        {showReasoning && message.reasoningText ? (
          <View
            className='rounded-2xl px-4 py-3.5 mb-3'
            style={{
              backgroundColor: `${colors.card}CC`,
              borderWidth: 1,
              borderColor: `${colors.border}80`,
            }}
          >
            <Text
              className='text-sm leading-7'
              style={{ color: colors.mutedForeground }}
              selectable
            >
              {message.reasoningText}
            </Text>
          </View>
        ) : null}

        {message.content ? (
          <Markdown
            markdown={message.content}
            customStyles={markdownStyles}
            onLinkPress={handleLinkPress}
          />
        ) : isStreaming ? (
          <View className='flex-row items-center gap-2 py-1'>
            <View
              className='w-1.5 h-1.5 rounded-full'
              style={{ backgroundColor: `${colors.primary}B3` }}
            />
            <Text className='text-xs' style={{ color: colors.mutedForeground }}>
              Thinking...
            </Text>
          </View>
        ) : null}

        {hasError ? (
          <View
            className='mt-2 rounded-xl px-3 py-2'
            style={{
              backgroundColor: `${colors.destructive}14`,
              borderWidth: 1,
              borderColor: `${colors.destructive}4D`,
            }}
          >
            <Text className='text-xs' style={{ color: colors.destructive }}>
              {message.errorMessage ?? 'Failed to generate response.'}
            </Text>
          </View>
        ) : null}

        {message.attachments && message.attachments.length > 0 ? (
          <View className='mt-3'>
            <ImageAttachmentGrid
              attachments={message.attachments}
              colors={colors}
            />
          </View>
        ) : null}

        {(message.sources?.length ?? 0) > 0 ? (
          <>
            <Pressable
              onPress={() => setShowSources((open) => !open)}
              className='flex-row items-center gap-1.5 mt-3'
            >
              <Ionicons
                name='globe-outline'
                size={14}
                color={`${colors.foreground}BF`}
              />
              <Text
                className='text-xs font-medium'
                style={{ color: `${colors.foreground}E6` }}
              >
                Search grounding
              </Text>
              <Ionicons
                name={showSources ? 'chevron-up' : 'chevron-down'}
                size={12}
                color={colors.mutedForeground}
              />
            </Pressable>

            {showSources ? (
              <View
                className='mt-2 rounded-2xl px-4 py-3.5'
                style={{
                  backgroundColor: `${colors.card}CC`,
                  borderWidth: 1,
                  borderColor: `${colors.border}80`,
                }}
              >
                {message.sources!.map((source) => (
                  <View key={source.id} className='mb-2.5 last:mb-0'>
                    <Text
                      className='text-[10px] uppercase'
                      style={{
                        color: colors.mutedForeground,
                        letterSpacing: 1,
                      }}
                    >
                      {source.hostname ?? 'web'}
                    </Text>
                    <Text
                      className='text-xs font-medium mt-1'
                      style={{ color: colors.foreground }}
                    >
                      {source.title ?? source.url}
                    </Text>
                    {source.snippet ? (
                      <Text
                        className='text-xs mt-1 leading-5'
                        style={{ color: colors.mutedForeground }}
                        numberOfLines={3}
                      >
                        {source.snippet}
                      </Text>
                    ) : null}
                  </View>
                ))}
              </View>
            ) : null}
          </>
        ) : null}

        {!isStreaming &&
        (message.content || message.reasoningText || (message.attachments?.length ?? 0) > 0) ? (
          <View className='mt-2 gap-2'>
            <View className='flex-row items-center gap-1 flex-wrap'>
              <ActionButton
                icon='copy-outline'
                label='Copy'
                onPress={() => {
                  void handleCopy()
                }}
                colors={colors}
              />

              {onRetry ? (
                <ActionButton
                  icon='refresh-outline'
                  label='Retry'
                  onPress={() => onRetry(message)}
                  colors={colors}
                />
              ) : null}
            </View>

            <View className='flex-row items-center gap-2 flex-wrap'>
              <View
                className='rounded-full px-2 py-1'
                style={{ backgroundColor: `${colors.muted}99` }}
              >
                <Text
                  className='text-[11px]'
                  style={{ color: colors.mutedForeground }}
                >
                  {modelLabel}
                </Text>
              </View>

              {message.generationStats?.costUsd != null ? (
                <View
                  className='rounded-full px-2 py-1'
                  style={{ backgroundColor: `${colors.muted}99` }}
                >
                  <Text
                    className='text-[11px]'
                    style={{ color: colors.mutedForeground }}
                  >
                    {formatCostUsd(message.generationStats.costUsd)}
                  </Text>
                </View>
              ) : null}

              {message.generationStats?.tokensPerSecond != null ? (
                <View
                  className='rounded-full px-2 py-1'
                  style={{ backgroundColor: `${colors.muted}99` }}
                >
                  <Text
                    className='text-[11px]'
                    style={{ color: colors.mutedForeground }}
                  >
                    {formatTokensPerSecond(message.generationStats.tokensPerSecond)}
                  </Text>
                </View>
              ) : null}

              {tokenCount != null ? (
                <View
                  className='rounded-full px-2 py-1'
                  style={{ backgroundColor: `${colors.muted}99` }}
                >
                  <Text
                    className='text-[11px]'
                    style={{ color: colors.mutedForeground }}
                  >
                    {formatTokenCount(tokenCount)}
                  </Text>
                </View>
              ) : null}
            </View>
          </View>
        ) : null}
      </View>
    </View>
  )
}

export default memo(MessageBubble)
