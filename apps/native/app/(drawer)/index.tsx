import { api } from '@based-chat/backend/convex/_generated/api'
import { Ionicons } from '@expo/vector-icons'
import { useAction, useMutation } from 'convex/react'
import * as Haptics from 'expo-haptics'
import { router } from 'expo-router'
import { useToast } from 'heroui-native'
import { useCallback, useEffect, useRef, useState } from 'react'
import {
  Pressable,
  ScrollView,
  Text,
  View,
} from 'react-native'
import { KeyboardAvoidingView } from 'react-native-keyboard-controller'
import { useSafeAreaInsets } from 'react-native-safe-area-context'

import ChatInput, { type PickedDocument } from '@/components/chat/chat-input'
import {
  getStoredOpenRouterApiKey,
} from '@/lib/api-keys'
import {
  uploadPickedDocuments,
} from '@/lib/chat-runtime'
import { modelCanAcceptAttachments } from '@/lib/models'
import { useSelectedModel } from '@/lib/selected-model'
import { useColors } from '@/lib/use-colors'

const SUGGESTION_PROMPTS = [
  'Explain quantum computing',
  'Write a Python web scraper',
  'Design a database schema',
  'Debug my React component',
]

const TOAST_DURATION_MS = 5000

export default function NewChat() {
  const colors = useColors()
  const insets = useSafeAreaInsets()
  const { toast } = useToast()
  const { model } = useSelectedModel()
  const [inputValue, setInputValue] = useState('')
  const [attachments, setAttachments] = useState<PickedDocument[]>([])
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [uploadProgress, setUploadProgress] = useState<number | null>(null)
  const [sendError, setSendError] = useState<string | null>(null)
  const attachmentProgressRef = useRef<Record<string, number>>({})
  const createThreadWithFirstMessage = useMutation(
    api.messages.createThreadWithFirstMessage,
  )
  const createAssistantReply = useMutation(api.messages.createAssistantReply)
  const generateAttachmentUploadUrl = useMutation(
    api.messages.generateAttachmentUploadUrl,
  )
  const generateThreadTitle = useAction(
    (api.messages as unknown as { generateThreadTitle: any }).generateThreadTitle,
  )

  useEffect(() => {
    if (sendError && (inputValue.trim().length > 0 || attachments.length > 0)) {
      setSendError(null)
    }
  }, [attachments.length, inputValue, sendError])

  const handleSend = useCallback(
    async (
      message: string,
      options?: {
        webSearchEnabled?: boolean
        webSearchMaxResults?: number
      },
    ) => {
      if (isSubmitting) {
        return
      }

      const apiKey = await getStoredOpenRouterApiKey()
      if (!apiKey) {
        const message = 'Add your OpenRouter API key in Settings > API Keys.'
        setSendError(message)
        void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error)
        toast.show({
          variant: 'danger',
          label: message,
          duration: TOAST_DURATION_MS,
        })
        return
      }

      if (attachments.length > 0 && !modelCanAcceptAttachments(model)) {
        const message = 'This model does not support attachments.'
        setSendError(message)
        void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error)
        toast.show({
          variant: 'danger',
          label: message,
          duration: TOAST_DURATION_MS,
        })
        return
      }

      setSendError(null)
      setIsSubmitting(true)
      attachmentProgressRef.current = Object.fromEntries(
        attachments.map((attachment) => [attachment.uri, 0]),
      )
      setUploadProgress(attachments.length > 0 ? 0 : null)

      try {
        const uploadedAttachments = await uploadPickedDocuments(
          attachments,
          generateAttachmentUploadUrl,
          {
            onUploadProgress: (attachmentUri, progress) => {
              attachmentProgressRef.current[attachmentUri] = progress
              const values = Object.values(attachmentProgressRef.current)

              if (values.length === 0) {
                setUploadProgress(null)
                return
              }

              const averageProgress =
                values.reduce((sum, value) => sum + value, 0) / values.length
              setUploadProgress(Math.round(averageProgress))
            },
          },
        )

        const firstMessageResult = await createThreadWithFirstMessage({
          content: message,
          attachments: uploadedAttachments.map((attachment) => ({
            kind: attachment.kind,
            storageId: attachment.storageId,
            fileName: attachment.fileName,
            contentType: attachment.contentType,
            size: attachment.size,
          })),
          modelId: model.id,
        })

        setInputValue('')
        setAttachments([])

        router.navigate({
          pathname: '/(drawer)/chat/[threadId]',
          params: { threadId: firstMessageResult.thread._id },
        })

        const [assistantReplyResult] = await Promise.allSettled([
          createAssistantReply({
            threadId: firstMessageResult.thread._id,
            userMessageId: firstMessageResult.message._id,
            userMessageUpdatedAt:
              firstMessageResult.message.updatedAt ??
              firstMessageResult.message.createdAt,
            modelId: model.id,
            webSearchEnabled: options?.webSearchEnabled,
            webSearchMaxResults: options?.webSearchMaxResults,
          }),
          generateThreadTitle({
            threadId: firstMessageResult.thread._id,
            messageId: firstMessageResult.message._id,
            apiKey,
          }),
        ])

        if (assistantReplyResult.status === 'rejected') {
          throw assistantReplyResult.reason
        }

        if (!assistantReplyResult.value) {
          throw new Error('Could not start assistant reply.')
        }
      } catch (error) {
        const message =
          error instanceof Error ? error.message : 'Failed to send message.'
        setSendError(message)
        void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error)
        toast.show({
          variant: 'danger',
          label: message,
          duration: TOAST_DURATION_MS,
        })
      } finally {
        setIsSubmitting(false)
        setUploadProgress(null)
        attachmentProgressRef.current = {}
      }
    },
    [
      attachments,
      createAssistantReply,
      createThreadWithFirstMessage,
      generateAttachmentUploadUrl,
      generateThreadTitle,
      isSubmitting,
      model,
      toast,
    ],
  )

  return (
    <KeyboardAvoidingView
      className='flex-1'
      behavior='padding'
      keyboardVerticalOffset={90}
      style={{ backgroundColor: colors.background }}
    >
      <ScrollView
        className='flex-1'
        contentContainerStyle={{
          flexGrow: 1,
          justifyContent: 'center',
          alignItems: 'center',
          paddingHorizontal: 24,
          paddingVertical: 24,
        }}
        keyboardShouldPersistTaps='handled'
        keyboardDismissMode='interactive'
      >
        <View
          className='w-12 h-12 rounded-xl items-center justify-center mb-4'
          style={{ backgroundColor: `${colors.primary}1A` }}
        >
          <Ionicons name='sparkles' size={24} color={colors.primary} />
        </View>
        <Text
          className='text-lg font-semibold tracking-tight'
          style={{ color: colors.foreground }}
        >
          Start a conversation
        </Text>
        <Text
          className='text-sm mt-1.5 text-center leading-relaxed'
          style={{ color: colors.mutedForeground }}
        >
          Ask anything. Write code. Analyze data. Get creative.
        </Text>

        <View className='flex-row flex-wrap gap-2 mt-5 justify-center'>
          {SUGGESTION_PROMPTS.map((prompt) => (
            <Pressable
              key={prompt}
              onPress={() => setInputValue(prompt)}
              className='rounded-xl px-3 py-2.5'
              style={({ pressed }) => ({
                backgroundColor: pressed
                  ? `${colors.card}FF`
                  : `${colors.card}80`,
                borderWidth: 1,
                borderColor: `${colors.border}80`,
              })}
            >
              <Text
                className='text-xs'
                style={{ color: colors.mutedForeground }}
              >
                {prompt}
              </Text>
            </Pressable>
          ))}
        </View>
      </ScrollView>

      <View style={{ paddingBottom: Math.max(insets.bottom, 12) + 8 }}>
        {sendError ? (
          <View
            className='mx-3 mb-2 flex-row items-center gap-2 rounded-xl px-3 py-2.5'
            style={{
              backgroundColor: `${colors.destructive}14`,
              borderWidth: 1,
              borderColor: `${colors.destructive}33`,
            }}
          >
            <Ionicons
              name='alert-circle-outline'
              size={14}
              color={colors.destructive}
            />
            <Text
              className='flex-1 text-[11px] font-medium'
              style={{ color: colors.destructive }}
            >
              {sendError}
            </Text>
          </View>
        ) : null}
        <ChatInput
          value={inputValue}
          onValueChange={setInputValue}
          attachments={attachments}
          onAttachmentsChange={setAttachments}
          onSend={(message, options) => {
            void handleSend(message, options)
          }}
          isSending={isSubmitting}
          uploadProgress={uploadProgress}
          disabled={isSubmitting}
          canAttach={modelCanAcceptAttachments(model)}
        />
      </View>
    </KeyboardAvoidingView>
  )
}
