import { Ionicons } from '@expo/vector-icons'
import * as Haptics from 'expo-haptics'
import { useToast } from 'heroui-native'
import { useEffect, useState } from 'react'
import {
  Linking,
  Pressable,
  Text,
  TextInput,
  View,
} from 'react-native'

import {
  clearStoredOpenRouterApiKey,
  getOpenRouterApiKeyStorageMode,
  getStoredOpenRouterApiKey,
  normalizeApiKey,
  saveOpenRouterApiKey,
  type ApiKeyStorageMode,
} from '@/lib/api-keys'
import { useColors } from '@/lib/use-colors'
import { ThemedButton } from './themed-button'

const TOAST_DURATION_MS = 5000

export default function ApiKeysTab() {
  const colors = useColors()
  const { toast } = useToast()

  const [savedApiKey, setSavedApiKey] = useState('')
  const [apiKey, setApiKey] = useState('')
  const [showKey, setShowKey] = useState(false)
  const [isLoaded, setIsLoaded] = useState(false)
  const [statusMessage, setStatusMessage] = useState<string | null>(null)
  const [statusTone, setStatusTone] = useState<'success' | 'danger' | null>(
    null,
  )
  const [storageMode, setStorageMode] = useState<ApiKeyStorageMode>('none')

  useEffect(() => {
    async function loadKey() {
      try {
        const stored = await getStoredOpenRouterApiKey()
        const normalized = normalizeApiKey(stored) ?? ''
        setSavedApiKey(normalized)
        setApiKey(normalized)
        setStorageMode(await getOpenRouterApiKeyStorageMode())
      } catch {
        // Ignore storage errors
      } finally {
        setIsLoaded(true)
      }
    }
    void loadKey()
  }, [])

  const hasSavedApiKey = savedApiKey.length > 0
  const hasUnsavedChanges = apiKey.trim() !== savedApiKey

  useEffect(() => {
    if (hasUnsavedChanges && statusTone === 'success') {
      setStatusMessage(null)
      setStatusTone(null)
    }
  }, [hasUnsavedChanges, statusTone])

  const showToastSafely = (variant: 'success' | 'danger', label: string) => {
    try {
      toast.show({ variant, label, duration: TOAST_DURATION_MS })
    } catch {
      // Inline status is the primary feedback here.
    }
  }

  const handleSave = async () => {
    const normalized = normalizeApiKey(apiKey) ?? ''
    void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium)
    try {
      const nextStorageMode = await saveOpenRouterApiKey(normalized)
      setSavedApiKey(normalized)
      setApiKey(normalized)
      setStorageMode(nextStorageMode)
      setStatusTone('success')
      setStatusMessage(
        normalized
          ? nextStorageMode === 'secure'
            ? 'Saved securely on this device.'
            : 'Saved locally on this device.'
          : 'Key removed.'
      )
    } catch {
      setStatusTone('danger')
      setStatusMessage('Failed to save API key.')
      void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error)
      showToastSafely('danger', 'Failed to save API key.')
      return
    }

    void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success)
    showToastSafely(
      'success',
      normalized ? 'API key saved.' : 'API key removed.',
    )
  }

  const handleClear = async () => {
    void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light)
    try {
      await clearStoredOpenRouterApiKey()
      setSavedApiKey('')
      setApiKey('')
      setStorageMode('none')
      setStatusTone('success')
      setStatusMessage('Key removed from this device.')
    } catch {
      setStatusTone('danger')
      setStatusMessage('Failed to remove API key.')
      void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error)
      showToastSafely('danger', 'Failed to remove API key.')
      return
    }

    void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success)
    showToastSafely('success', 'API key removed.')
  }

  if (!isLoaded) return null

  return (
    <View className='gap-8'>
      <View>
        <Text
          className='text-xl font-semibold'
          style={{ color: colors.foreground, letterSpacing: -0.3 }}
        >
          API Keys
        </Text>
        <Text className='mt-1 text-sm' style={{ color: colors.mutedForeground }}>
          Manage your API keys for model providers.
        </Text>
      </View>

      <View
        className='rounded-xl p-4 gap-4'
        style={{ backgroundColor: `${colors.card}80`, borderWidth: 1, borderColor: `${colors.border}80` }}
      >
        <View className='flex-row items-start justify-between'>
          <View className='flex-1'>
            <View className='flex-row items-center gap-2'>
              <Text className='text-sm font-medium' style={{ color: colors.foreground }}>
                OpenRouter
              </Text>
              <View
                className='w-1.5 h-1.5 rounded-full'
                style={{
                  backgroundColor: apiKey.trim()
                    ? '#4ade80B3'
                    : `${colors.mutedForeground}4D`,
                }}
              />
            </View>
            <Text className='mt-1 text-[10px]' style={{ color: colors.mutedForeground }}>
              Connect your OpenRouter API key to access all available models.
            </Text>
            {hasSavedApiKey && !hasUnsavedChanges ? (
              <View
                className='mt-2 self-start rounded-full px-2 py-1'
                style={{ backgroundColor: `${colors.primary}1A` }}
              >
                <Text
                  className='text-[10px] font-medium'
                  style={{ color: colors.primary }}
                >
                  {storageMode === 'local'
                    ? 'Saved locally on this device'
                    : 'Saved on this device'}
                </Text>
              </View>
            ) : null}
          </View>
          <Pressable
            onPress={() => { void Linking.openURL('https://openrouter.ai/keys') }}
            className='flex-row items-center gap-1'
          >
            <Text className='text-[10px]' style={{ color: colors.primary }}>
              Get a key
            </Text>
            <Ionicons name='open-outline' size={10} color={colors.primary} />
          </Pressable>
        </View>

        <View className='gap-2'>
          <Text className='text-xs font-medium' style={{ color: colors.mutedForeground }}>
            API Key
          </Text>
          <View
            className='flex-row items-center rounded-lg px-3 py-2.5'
            style={{
              backgroundColor: `${colors.muted}50`,
              borderWidth: 1,
              borderColor: `${colors.border}80`,
            }}
          >
            <TextInput
              value={apiKey}
              onChangeText={setApiKey}
              placeholder='sk-or-v1-...'
              placeholderTextColor={`${colors.mutedForeground}60`}
              secureTextEntry={!showKey}
              className='flex-1 text-[11px] font-mono'
              style={{ color: colors.foreground }}
              autoCapitalize='none'
              autoCorrect={false}
            />
            <Pressable onPress={() => setShowKey(!showKey)} className='ml-2'>
              <Ionicons
                name={showKey ? 'eye-off-outline' : 'eye-outline'}
                size={16}
                color={`${colors.mutedForeground}80`}
              />
            </Pressable>
          </View>
        </View>

        <View className='flex-row items-center justify-between gap-3'>
          <Text
            className='flex-1 text-[10px]'
            style={{ color: `${colors.mutedForeground}80` }}
          >
            {storageMode === 'local'
              ? 'Your key is stored locally on this device and sent with chat requests.'
              : 'Your key is stored securely on this device and sent with chat requests.'}
          </Text>
          <View className='flex-row items-center gap-2'>
            {hasSavedApiKey && (
              <ThemedButton variant='ghost' size='sm' onPress={() => { void handleClear() }}>
                Clear
              </ThemedButton>
            )}
            <ThemedButton
              variant='primary'
              size='sm'
              disabled={!hasUnsavedChanges}
              onPress={() => { void handleSave() }}
            >
              Save key
            </ThemedButton>
          </View>
        </View>

        {statusMessage ? (
          <View
            className='flex-row items-center gap-2 rounded-lg px-3 py-2'
            style={{
              backgroundColor:
                statusTone === 'danger'
                  ? `${colors.destructive}14`
                  : `${colors.primary}14`,
              borderWidth: 1,
              borderColor:
                statusTone === 'danger'
                  ? `${colors.destructive}33`
                  : `${colors.primary}33`,
            }}
          >
            <Ionicons
              name={
                statusTone === 'danger'
                  ? 'alert-circle-outline'
                  : 'checkmark-circle-outline'
              }
              size={14}
              color={
                statusTone === 'danger' ? colors.destructive : colors.primary
              }
            />
            <Text
              className='text-[11px] font-medium'
              style={{
                color:
                  statusTone === 'danger'
                    ? colors.destructive
                    : colors.primary,
              }}
            >
              {statusMessage}
            </Text>
          </View>
        ) : null}
      </View>

      <View
        className='rounded-xl px-5 py-8 items-center'
        style={{
          borderWidth: 1,
          borderStyle: 'dashed',
          borderColor: `${colors.border}4D`,
        }}
      >
        <Text className='text-xs' style={{ color: `${colors.mutedForeground}60` }}>
          More providers coming soon.
        </Text>
      </View>
    </View>
  )
}
