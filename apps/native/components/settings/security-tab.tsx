import { api } from '@based-chat/backend/convex/_generated/api'
import { Ionicons } from '@expo/vector-icons'
import { useMutation } from 'convex/react'
import { useToast } from 'heroui-native'

import { ThemedButton } from './themed-button'
import { useEffect, useState } from 'react'
import {
  ActivityIndicator,
  Alert,
  Platform,
  Pressable,
  Text,
  TextInput,
  View,
} from 'react-native'

import { authClient } from '@/lib/auth-client'
import { useColors } from '@/lib/use-colors'

type DeviceInfo = {
  type: 'desktop' | 'mobile' | 'tablet' | 'unknown'
  os: string
  browser: string
}

function parseUserAgent(ua: string | null | undefined): DeviceInfo {
  if (!ua) return { type: 'unknown', os: 'Unknown', browser: 'Unknown' }

  let os = 'Unknown'
  if (/Windows/i.test(ua)) os = 'Windows'
  else if (/Macintosh|Mac OS/i.test(ua)) os = 'macOS'
  else if (/Linux/i.test(ua) && !/Android/i.test(ua)) os = 'Linux'
  else if (/Android/i.test(ua)) os = 'Android'
  else if (/iPhone|iPad|iPod/i.test(ua)) os = 'iOS'

  let browser = 'Unknown'
  if (/Edg\//i.test(ua)) browser = 'Edge'
  else if (/Chrome\//i.test(ua)) browser = 'Chrome'
  else if (/Safari\//i.test(ua) && !/Chrome/i.test(ua)) browser = 'Safari'
  else if (/Firefox\//i.test(ua)) browser = 'Firefox'

  let type: DeviceInfo['type'] = 'desktop'
  if (/iPad/i.test(ua) || (/Android/i.test(ua) && !/Mobile/i.test(ua)))
    type = 'tablet'
  else if (/iPhone|iPod|Android.*Mobile/i.test(ua)) type = 'mobile'

  return { type, os, browser }
}

function getDeviceIconName(type: DeviceInfo['type']) {
  switch (type) {
    case 'mobile':
      return 'phone-portrait-outline' as const
    case 'tablet':
      return 'tablet-portrait-outline' as const
    case 'desktop':
      return 'desktop-outline' as const
    default:
      return 'laptop-outline' as const
  }
}

type Session = {
  id: string
  token: string
  createdAt: Date
  updatedAt: Date
  expiresAt: Date
  ipAddress?: string | null
  userAgent?: string | null
}

export default function SecurityTab() {
  const colors = useColors()
  const { toast } = useToast()
  const deleteAccount = useMutation(
    (api.auth as { deleteAccount: any }).deleteAccount,
  )

  const [sessions, setSessions] = useState<Session[]>([])
  const [currentSessionToken, setCurrentSessionToken] = useState<string | null>(
    null,
  )
  const [isLoadingSessions, setIsLoadingSessions] = useState(true)
  const [revokingSessionId, setRevokingSessionId] = useState<string | null>(
    null,
  )

  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false)
  const [deleteConfirmText, setDeleteConfirmText] = useState('')
  const [isDeleting, setIsDeleting] = useState(false)

  useEffect(() => {
    let cancelled = false

    async function fetchSessions() {
      try {
        const result = await authClient.listSessions()
        if (cancelled) return
        if (result.data) setSessions(result.data)

        const sessionResult = await authClient.getSession()
        if (!cancelled && sessionResult.data) {
          setCurrentSessionToken(sessionResult.data.session.token)
        }
      } catch {
        if (!cancelled)
          toast.show({ variant: 'danger', label: 'Failed to load sessions.' })
      } finally {
        if (!cancelled) setIsLoadingSessions(false)
      }
    }

    void fetchSessions()
    return () => {
      cancelled = true
    }
  }, [])

  const handleRevokeSession = async (session: Session) => {
    setRevokingSessionId(session.id)
    try {
      await authClient.revokeSession({ token: session.token })
      setSessions((prev) => prev.filter((s) => s.id !== session.id))
      toast.show({ variant: 'success', label: 'Session revoked.' })
    } catch {
      toast.show({ variant: 'danger', label: 'Failed to revoke session.' })
    } finally {
      setRevokingSessionId(null)
    }
  }

  const handleRevokeOtherSessions = () => {
    Alert.alert(
      'Revoke all other sessions?',
      'This will sign out all other devices.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Revoke All',
          style: 'destructive',
          onPress: async () => {
            try {
              await authClient.revokeOtherSessions()
              setSessions((prev) =>
                prev.filter((s) => s.token === currentSessionToken),
              )
              toast.show({
                variant: 'success',
                label: 'All other sessions revoked.',
              })
            } catch {
              toast.show({
                variant: 'danger',
                label: 'Failed to revoke sessions.',
              })
            }
          },
        },
      ],
    )
  }

  const handleDeleteAccount = async () => {
    if (deleteConfirmText !== 'delete my account' || isDeleting) return

    setIsDeleting(true)
    try {
      await deleteAccount({ confirmation: deleteConfirmText })
      await authClient.deleteUser()
      toast.show({ variant: 'success', label: 'Account deleted.' })
      await authClient.signOut()
    } catch (error) {
      toast.show({
        variant: 'danger',
        label:
          error instanceof Error ? error.message : 'Failed to delete account.',
      })
    } finally {
      setIsDeleting(false)
    }
  }

  return (
    <View className='gap-10'>
      {/* Header */}
      <View>
        <Text
          className='text-xl font-semibold'
          style={{ color: colors.foreground, letterSpacing: -0.3 }}
        >
          Security
        </Text>
        <Text
          className='mt-1 text-sm'
          style={{ color: colors.mutedForeground }}
        >
          Manage your active sessions and account security.
        </Text>
      </View>

      {/* Active Sessions */}
      <View className='gap-4'>
        <View className='flex-row items-start gap-3'>
          <View className='flex-1 pr-2'>
            <Text
              className='text-sm font-medium'
              style={{ color: colors.foreground }}
            >
              Active Devices
            </Text>
            <Text
              className='mt-0.5 text-xs leading-4'
              numberOfLines={2}
              style={{ color: colors.mutedForeground }}
            >
              Devices currently signed into your account.
            </Text>
          </View>
          {sessions.length > 1 && (
            <View className='pt-0.5'>
              <ThemedButton
                variant='outline'
                size='sm'
                onPress={handleRevokeOtherSessions}
              >
                Revoke all others
              </ThemedButton>
            </View>
          )}
        </View>

        <View
          className='rounded-xl overflow-hidden'
          style={{ borderWidth: 1, borderColor: `${colors.border}80` }}
        >
          {isLoadingSessions && (
            <View className='py-10 items-center'>
              <ActivityIndicator size='small' color={colors.primary} />
            </View>
          )}

          {!isLoadingSessions && sessions.length === 0 && (
            <View className='py-10 items-center'>
              <Text
                className='text-xs'
                style={{ color: `${colors.mutedForeground}60` }}
              >
                No active sessions found.
              </Text>
            </View>
          )}

          {!isLoadingSessions &&
            sessions.map((session, index) => {
              const device = parseUserAgent(session.userAgent)
              const iconName = getDeviceIconName(device.type)
              const isCurrent = session.token === currentSessionToken
              const isRevoking = revokingSessionId === session.id

              return (
                <View
                  key={session.id}
                  className='flex-row items-center gap-3.5 px-4 py-3.5'
                  style={{
                    backgroundColor: isCurrent
                      ? `${colors.primary}08`
                      : 'transparent',
                    borderBottomWidth: index < sessions.length - 1 ? 1 : 0,
                    borderBottomColor: `${colors.border}40`,
                  }}
                >
                  {/* Device icon */}
                  <View
                    className='w-9 h-9 rounded-lg items-center justify-center'
                    style={{
                      backgroundColor: isCurrent
                        ? `${colors.primary}1A`
                        : `${colors.muted}60`,
                    }}
                  >
                    <Ionicons
                      name={iconName}
                      size={16}
                      color={
                        isCurrent ? colors.primary : colors.mutedForeground
                      }
                    />
                  </View>

                  {/* Info */}
                  <View className='flex-1 min-w-0'>
                    <View className='flex-row items-center gap-2'>
                      <Text
                        className='text-xs font-medium'
                        numberOfLines={1}
                        style={{ color: colors.foreground }}
                      >
                        {device.browser} on {device.os}
                      </Text>
                      {isCurrent && (
                        <View
                          className='rounded-full px-1.5 py-0.5'
                          style={{ backgroundColor: `${colors.primary}26` }}
                        >
                          <Text
                            className='text-[9px] font-semibold uppercase'
                            style={{
                              color: colors.primary,
                              letterSpacing: 0.5,
                            }}
                          >
                            Current
                          </Text>
                        </View>
                      )}
                    </View>
                    <View className='mt-1 gap-1.5'>
                      {session.ipAddress && (
                        <View className='flex-row items-center gap-1.5'>
                          <Ionicons
                            name='globe-outline'
                            size={10}
                            color={`${colors.mutedForeground}80`}
                          />
                          <Text
                            className='flex-1 text-[10px]'
                            numberOfLines={1}
                            style={{ color: `${colors.mutedForeground}80` }}
                          >
                            {session.ipAddress}
                          </Text>
                        </View>
                      )}

                      <View className='flex-row items-center gap-1.5'>
                        <Ionicons
                          name='time-outline'
                          size={10}
                          color={`${colors.mutedForeground}80`}
                        />
                        <Text
                          className='flex-1 text-[10px]'
                          numberOfLines={2}
                          style={{ color: `${colors.mutedForeground}80` }}
                        >
                          Last active{' '}
                          {new Date(session.updatedAt).toLocaleDateString(
                            'en-US',
                            {
                              month: 'short',
                              day: 'numeric',
                              year: 'numeric',
                            },
                          )}
                        </Text>
                      </View>
                    </View>
                  </View>

                  {/* Revoke button */}
                  {!isCurrent && (
                    <Pressable
                      onPress={() => {
                        void handleRevokeSession(session)
                      }}
                      disabled={isRevoking}
                      className='mt-0.5 h-8 w-8 items-center justify-center rounded-full'
                      accessibilityRole='button'
                      accessibilityLabel={`Revoke session for ${device.browser} on ${device.os}`}
                      style={({ pressed }) => ({
                        opacity: isRevoking ? 0.5 : 1,
                        borderWidth: 1,
                        borderColor: `${colors.destructive}${pressed ? '80' : '4D'}`,
                        backgroundColor: pressed
                          ? `${colors.destructive}1A`
                          : `${colors.destructive}0D`,
                      })}
                    >
                      {isRevoking ? (
                        <ActivityIndicator
                          size={14}
                          color={colors.destructive}
                        />
                      ) : (
                        <Ionicons
                          name='close'
                          size={16}
                          color={colors.destructive}
                        />
                      )}
                    </Pressable>
                  )}
                </View>
              )
            })}
        </View>
      </View>

      {/* Danger Zone */}
      <View className='gap-4'>
        <View
          className='rounded-xl'
          style={{
            backgroundColor: `${colors.destructive}08`,
            borderWidth: 1,
            borderColor: `${colors.destructive}33`,
          }}
        >
          <View className='px-5 py-4'>
            <View className='flex-row items-center gap-2'>
              <Ionicons
                name='warning-outline'
                size={16}
                color={colors.destructive}
              />
              <Text
                className='text-sm font-medium'
                style={{ color: colors.destructive }}
              >
                Danger Zone
              </Text>
            </View>
            <Text
              className='mt-1.5 text-xs'
              style={{ color: colors.mutedForeground }}
            >
              Permanently delete your account and all associated data. This
              includes all threads, messages, attachments, model preferences,
              and profile information. This action cannot be undone.
            </Text>

            {!showDeleteConfirm ? (
              <View className='mt-4'>
                <ThemedButton
                  variant='danger'
                  size='sm'
                  onPress={() => setShowDeleteConfirm(true)}
                >
                  Delete account
                </ThemedButton>
              </View>
            ) : (
              <View
                className='mt-4 gap-3 rounded-lg p-4'
                style={{
                  backgroundColor: colors.background,
                  borderWidth: 1,
                  borderColor: `${colors.destructive}33`,
                }}
              >
                <Text
                  className='text-xs'
                  style={{ color: colors.mutedForeground }}
                >
                  To confirm, type{' '}
                  <Text
                    className='font-mono font-medium'
                    style={{ color: colors.destructive }}
                  >
                    delete my account
                  </Text>{' '}
                  below:
                </Text>
                <View
                  className='rounded-lg px-3 py-2.5'
                  style={{
                    backgroundColor: `${colors.muted}33`,
                    borderWidth: 1,
                    borderColor: `${colors.destructive}4D`,
                  }}
                >
                  <TextInput
                    value={deleteConfirmText}
                    onChangeText={setDeleteConfirmText}
                    placeholder='delete my account'
                    placeholderTextColor={`${colors.mutedForeground}60`}
                    className='text-xs font-mono'
                    style={{ color: colors.foreground }}
                    autoCapitalize='none'
                    autoCorrect={false}
                    autoFocus
                  />
                </View>
                <View className='flex-row items-center gap-2'>
                  <ThemedButton
                    variant='danger'
                    size='sm'
                    disabled={
                      deleteConfirmText !== 'delete my account' || isDeleting
                    }
                    onPress={() => {
                      void handleDeleteAccount()
                    }}
                  >
                    {isDeleting ? 'Deleting...' : 'Permanently delete account'}
                  </ThemedButton>
                  <ThemedButton
                    variant='ghost'
                    size='sm'
                    disabled={isDeleting}
                    onPress={() => {
                      setShowDeleteConfirm(false)
                      setDeleteConfirmText('')
                    }}
                  >
                    Cancel
                  </ThemedButton>
                </View>
              </View>
            )}
          </View>
        </View>
      </View>
    </View>
  )
}
