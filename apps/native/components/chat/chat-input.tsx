import { Ionicons } from '@expo/vector-icons'
import * as DocumentPicker from 'expo-document-picker'
import * as Haptics from 'expo-haptics'
import { BottomSheet } from 'heroui-native'
import { useCallback, useState } from 'react'
import {
  ActivityIndicator,
  Dimensions,
  Image,
  Keyboard,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  StatusBar,
  Text,
  TextInput,
  View,
} from 'react-native'
import Animated, { FadeIn, FadeOut, LinearTransition } from 'react-native-reanimated'

import { appStorage } from '@/lib/mmkv'
import { useColors } from '@/lib/use-colors'

const WEB_SEARCH_ENABLED_KEY = 'based-chat:web-search-enabled'
const WEB_SEARCH_MAX_RESULTS_KEY = 'based-chat:web-search-max-results'
const MIN_MAX_RESULTS = 1
const MAX_MAX_RESULTS = 5
const RESULT_OPTIONS = [1, 2, 3, 4, 5] as const

function getStoredSearchEnabled() {
  return appStorage.getBoolean(WEB_SEARCH_ENABLED_KEY) ?? false
}

function getStoredMaxResults() {
  const val = appStorage.getNumber(WEB_SEARCH_MAX_RESULTS_KEY)
  if (val == null || val < MIN_MAX_RESULTS || val > MAX_MAX_RESULTS) return MIN_MAX_RESULTS
  return Math.trunc(val)
}

function isImageMimeType(mimeType: string | undefined) {
  return mimeType?.startsWith('image/') ?? false
}

export type ChatInputOptions = {
  webSearchEnabled?: boolean
  webSearchMaxResults?: number
}

export type PickedDocument = DocumentPicker.DocumentPickerAsset

export default function ChatInput({
  value,
  onValueChange,
  onSend,
  onAbort,
  attachments,
  onAttachmentsChange,
  modelSelector,
  isStreaming = false,
  isSending = false,
  disabled = false,
  canAttach = true,
  uploadProgress = null,
}: {
  value: string
  onValueChange: (value: string) => void
  onSend?: (message: string, options?: ChatInputOptions) => void
  onAbort?: () => void
  attachments?: PickedDocument[]
  onAttachmentsChange?: (attachments: PickedDocument[]) => void
  modelSelector?: React.ReactNode
  isStreaming?: boolean
  isSending?: boolean
  disabled?: boolean
  canAttach?: boolean
  uploadProgress?: number | null
}) {
  const colors = useColors()
  const [inputHeight, setInputHeight] = useState(44)
  const [isSearchEnabled, setIsSearchEnabled] = useState(getStoredSearchEnabled)
  const [maxResults, setMaxResults] = useState(getStoredMaxResults)
  const [isResultsSheetOpen, setIsResultsSheetOpen] = useState(false)
  const [previewUri, setPreviewUri] = useState<string | null>(null)

  const docs = attachments ?? []
  const canSend = value.trim().length > 0 || docs.length > 0

  const toggleSearch = useCallback(() => {
    void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light)
    setIsSearchEnabled((prev) => {
      const next = !prev
      appStorage.set(WEB_SEARCH_ENABLED_KEY, next)
      return next
    })
  }, [])

  const selectMaxResults = useCallback((val: number) => {
    void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light)
    setMaxResults(val)
    appStorage.set(WEB_SEARCH_MAX_RESULTS_KEY, val)
    setIsResultsSheetOpen(false)
  }, [])

  const handleAttachPress = useCallback(async () => {
    void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light)
    const result = await DocumentPicker.getDocumentAsync({
      multiple: true,
      copyToCacheDirectory: true,
    })

    if (!result.canceled && result.assets.length > 0) {
      onAttachmentsChange?.([...docs, ...result.assets])
    }
  }, [docs, onAttachmentsChange])

  const removeAttachment = useCallback(
    (uri: string) => {
      void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light)
      onAttachmentsChange?.(docs.filter((d) => d.uri !== uri))
    },
    [docs, onAttachmentsChange],
  )

  const handleSend = () => {
    if (isSending) {
      return
    }

    if (isStreaming) {
      void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light)
      onAbort?.()
      return
    }

    if (!canSend || disabled) {
      void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light)
      return
    }

    void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium)
    onSend?.(value.trim(), {
      webSearchEnabled: isSearchEnabled,
      webSearchMaxResults: maxResults,
    })
  }

  const sendButtonColor =
    isStreaming
      ? colors.destructive
      : isSending
        ? colors.primary
      : canSend && !disabled
        ? colors.primary
        : colors.muted

  const sendButtonIconColor =
    isStreaming
      ? '#fff'
      : isSending
        ? colors.primaryForeground
      : canSend && !disabled
        ? colors.primaryForeground
        : colors.mutedForeground

  return (
    <View
      className='px-3 pb-1'
      style={{ backgroundColor: colors.background }}
    >
      <View
        className='rounded-2xl overflow-hidden'
        style={{
          backgroundColor: `${colors.card}E6`,
          borderWidth: 1,
          borderColor: `${colors.border}99`,
        }}
      >
        {/* Attachment preview strip */}
        {docs.length > 0 ? (
          <Animated.View
            entering={FadeIn.duration(200)}
            className='px-3 pt-3'
          >
            <ScrollView
              horizontal
              showsHorizontalScrollIndicator={false}
              contentContainerStyle={{ gap: 8 }}
            >
              {docs.map((doc) => {
                const isImage = isImageMimeType(doc.mimeType)

                return (
                  <Animated.View
                    key={doc.uri}
                    entering={FadeIn.duration(200)}
                    exiting={FadeOut.duration(150)}
                    style={{
                      borderRadius: 12,
                      overflow: 'hidden',
                      backgroundColor: colors.muted,
                      borderWidth: 1,
                      borderColor: `${colors.border}66`,
                    }}
                  >
                    {isImage ? (
                      <Pressable onPress={() => setPreviewUri(doc.uri)}>
                        <Image
                          source={{ uri: doc.uri }}
                          style={{ width: 72, height: 72 }}
                          resizeMode='cover'
                        />
                      </Pressable>
                    ) : (
                      <View
                        className='items-center justify-center px-3'
                        style={{ width: 72, height: 72 }}
                      >
                        <Ionicons
                          name='document-outline'
                          size={22}
                          color={colors.mutedForeground}
                        />
                        <Text
                          className='text-[9px] mt-1 text-center'
                          numberOfLines={2}
                          style={{ color: colors.mutedForeground }}
                        >
                          {doc.name}
                        </Text>
                      </View>
                    )}

                    {/* Remove button */}
                    <Pressable
                      onPress={() => removeAttachment(doc.uri)}
                      className='absolute top-1 right-1 w-5 h-5 rounded-full items-center justify-center'
                      style={{
                        backgroundColor: 'rgba(0,0,0,0.55)',
                      }}
                    >
                      <Ionicons name='close' size={12} color='#fff' />
                    </Pressable>
                  </Animated.View>
                )
              })}
            </ScrollView>
            {uploadProgress != null ? (
              <View className='mt-3 gap-1.5'>
                <View className='flex-row items-center justify-between'>
                  <Text
                    className='text-[11px] font-medium'
                    style={{ color: colors.mutedForeground }}
                  >
                    Uploading attachments
                  </Text>
                  <Text
                    className='text-[11px] font-medium'
                    style={{ color: colors.foreground }}
                  >
                    {uploadProgress}%
                  </Text>
                </View>
                <View
                  className='h-1.5 overflow-hidden rounded-full'
                  style={{ backgroundColor: `${colors.border}80` }}
                >
                  <View
                    className='h-full rounded-full'
                    style={{
                      width: `${uploadProgress}%`,
                      backgroundColor: colors.primary,
                    }}
                  />
                </View>
              </View>
            ) : null}
          </Animated.View>
        ) : null}

        <TextInput
          value={value}
          onChangeText={onValueChange}
          placeholder='Send a message...'
          placeholderTextColor={`${colors.mutedForeground}80`}
          multiline
          editable={!disabled && !isStreaming}
          onContentSizeChange={(event) => {
            const height = Math.min(
              Math.max(event.nativeEvent.contentSize.height, 44),
              140,
            )
            setInputHeight(height)
          }}
          onSubmitEditing={handleSend}
          blurOnSubmit={false}
          className='px-4 pt-3 text-sm'
          style={{
            height: inputHeight,
            color: colors.foreground,
            fontFamily: Platform.OS === 'ios' ? undefined : 'sans-serif',
            lineHeight: 22,
          }}
        />

        {/* Toolbar row */}
        <Animated.View
          layout={LinearTransition.duration(200)}
          className='flex-row items-center justify-between px-2.5 py-2'
        >
          {/* Left actions */}
          <Animated.View
            layout={LinearTransition.duration(200)}
            className='flex-row items-center gap-0.5'
          >
            {modelSelector ?? null}
            {/* Attach button */}
            <Pressable
              onPress={() => void handleAttachPress()}
              disabled={disabled || isStreaming || !canAttach}
              className='w-9 h-9 items-center justify-center rounded-xl'
              style={({ pressed }) => ({
                backgroundColor: pressed ? `${colors.accent}B3` : 'transparent',
                opacity: !canAttach || disabled || isStreaming ? 0.35 : 1,
              })}
            >
              <Ionicons
                name='attach'
                size={19}
                color={colors.mutedForeground}
                style={{ transform: [{ rotate: '-45deg' }] }}
              />
            </Pressable>

            {/* Search toggle */}
            <Pressable
              onPress={toggleSearch}
              disabled={disabled || isStreaming}
              className='h-9 flex-row items-center gap-1 rounded-xl px-2.5'
              style={({ pressed }) => ({
                backgroundColor: isSearchEnabled
                  ? pressed
                    ? `${colors.primary}28`
                    : `${colors.primary}18`
                  : pressed
                    ? `${colors.accent}B3`
                    : 'transparent',
                opacity: disabled || isStreaming ? 0.35 : 1,
              })}
            >
              <Ionicons
                name='globe-outline'
                size={16}
                color={isSearchEnabled ? colors.primary : colors.mutedForeground}
              />
              <Text
                className='text-xs'
                style={{
                  color: isSearchEnabled ? colors.primary : colors.mutedForeground,
                  fontWeight: isSearchEnabled ? '600' : '500',
                }}
              >
                Search
              </Text>
            </Pressable>

            {/* Max results selector trigger */}
            {isSearchEnabled ? (
              <Animated.View entering={FadeIn.duration(200)} exiting={FadeOut.duration(150)}>
                <Pressable
                  onPress={() => {
                    void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light)
                    Keyboard.dismiss()
                    setIsResultsSheetOpen(true)
                  }}
                  disabled={disabled || isStreaming}
                  className='h-9 flex-row items-center gap-1 rounded-xl px-2.5'
                  style={({ pressed }) => ({
                    backgroundColor: pressed ? `${colors.accent}B3` : 'transparent',
                  })}
                >
                  <Text
                    className='text-xs'
                    style={{ color: colors.mutedForeground, fontWeight: '500' }}
                  >
                    {maxResults} {maxResults === 1 ? 'result' : 'results'}
                  </Text>
                  <Ionicons
                    name='chevron-down'
                    size={12}
                    color={`${colors.mutedForeground}99`}
                  />
                </Pressable>
              </Animated.View>
            ) : null}
          </Animated.View>

          {/* Send button */}
          <Pressable
            onPress={handleSend}
            disabled={disabled || (!canSend && !isStreaming)}
            className='w-8 h-8 rounded-full items-center justify-center'
            style={({ pressed }) => ({
              backgroundColor: pressed
                ? `${sendButtonColor}CC`
                : sendButtonColor,
              opacity: disabled || (!canSend && !isStreaming) ? 0.5 : 1,
            })}
          >
            {isStreaming ? (
              <Ionicons name='square' size={12} color={sendButtonIconColor} />
            ) : isSending ? (
              <ActivityIndicator size='small' color={sendButtonIconColor} />
            ) : (
              <Ionicons
                name='arrow-up'
                size={18}
                color={sendButtonIconColor}
              />
            )}
          </Pressable>
        </Animated.View>
      </View>

      {/* Fullscreen image preview */}
      <Modal
        visible={previewUri !== null}
        transparent
        animationType='fade'
        statusBarTranslucent
        onRequestClose={() => setPreviewUri(null)}
      >
        <View className='flex-1 items-center justify-center' style={{ backgroundColor: 'rgba(0,0,0,0.92)' }}>
          <StatusBar barStyle='light-content' />
          <Pressable
            onPress={() => setPreviewUri(null)}
            className='absolute top-0 right-0 z-10 w-11 h-11 items-center justify-center rounded-full'
            style={{ marginTop: 54, marginRight: 16, backgroundColor: 'rgba(255,255,255,0.15)' }}
          >
            <Ionicons name='close' size={22} color='#fff' />
          </Pressable>
          {previewUri ? (
            <Image
              source={{ uri: previewUri }}
              style={{
                width: Dimensions.get('window').width - 32,
                height: Dimensions.get('window').height * 0.7,
              }}
              resizeMode='contain'
            />
          ) : null}
        </View>
      </Modal>

      {/* Max results BottomSheet */}
      <BottomSheet
        isOpen={isResultsSheetOpen}
        onOpenChange={setIsResultsSheetOpen}
      >
        <BottomSheet.Portal>
          {isResultsSheetOpen ? (
            <>
              <BottomSheet.Overlay isCloseOnPress className='bg-transparent' />
              <Pressable
                className='absolute inset-0'
                onPress={() => setIsResultsSheetOpen(false)}
                style={{ backgroundColor: 'rgba(0, 0, 0, 0.24)' }}
              />
            </>
          ) : null}
          <BottomSheet.Content
            snapPoints={['32%']}
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
            <View className='gap-1'>
              <Text
                className='px-1 pb-2 text-[10px] uppercase font-medium'
                style={{
                  color: colors.mutedForeground,
                  letterSpacing: 1.2,
                }}
              >
                Max search results
              </Text>
              {RESULT_OPTIONS.map((option) => (
                <Pressable
                  key={option}
                  onPress={() => selectMaxResults(option)}
                  className='flex-row items-center justify-between rounded-2xl px-4 py-3'
                  style={({ pressed }) => ({
                    backgroundColor: pressed
                      ? colors.accent
                      : option === maxResults
                        ? `${colors.primary}14`
                        : `${colors.accent}B3`,
                  })}
                >
                  <Text
                    className='text-sm font-medium'
                    style={{
                      color:
                        option === maxResults
                          ? colors.primary
                          : colors.foreground,
                    }}
                  >
                    {option} {option === 1 ? 'result' : 'results'}
                  </Text>
                  {option === maxResults ? (
                    <Ionicons
                      name='checkmark-circle'
                      size={18}
                      color={colors.primary}
                    />
                  ) : null}
                </Pressable>
              ))}
            </View>
          </BottomSheet.Content>
        </BottomSheet.Portal>
      </BottomSheet>
    </View>
  )
}
