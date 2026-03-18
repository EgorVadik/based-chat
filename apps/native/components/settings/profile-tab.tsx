import { api } from '@based-chat/backend/convex/_generated/api'
import { Ionicons } from '@expo/vector-icons'
import { useMutation, useQuery } from 'convex/react'
import { useToast } from 'heroui-native'
import { useState } from 'react'
import {
  Image,
  Pressable,
  Text,
  TextInput,
  View,
} from 'react-native'

import { useColors } from '@/lib/use-colors'
import { ThemedButton } from './themed-button'

const SUGGESTED_TRAITS = [
  'friendly',
  'witty',
  'concise',
  'curious',
  'empathetic',
  'creative',
  'patient',
]

const NAME_MAX = 50
const ROLE_MAX = 100
const TRAIT_MAX = 100
const TRAITS_MAX_COUNT = 20
const BIO_MAX = 3000

function normalizeTrait(trait: string) {
  return trait.trim().toLowerCase()
}

export default function ProfileTab({
  user,
}: {
  user: {
    name?: string | null
    email?: string | null
    role?: string | null
    traits?: string[] | null
    bio?: string | null
    image?: string | null
  }
}) {
  const colors = useColors()
  const updateProfile = useMutation(
    (api.auth as { updateProfile: any }).updateProfile,
  )
  const usageStats = useQuery(api.messages.getUsageStats, {})
  const { toast } = useToast()

  const [name, setName] = useState(user.name ?? '')
  const [role, setRole] = useState(user.role ?? '')
  const [traits, setTraits] = useState<string[]>(user.traits ?? [])
  const [bio, setBio] = useState(user.bio ?? '')
  const [traitInput, setTraitInput] = useState('')
  const [isSaving, setIsSaving] = useState(false)

  const displayName = user.name?.trim() || user.email?.split('@')[0] || 'User'
  const displayEmail = user.email || 'No email'
  const initials =
    displayName
      .split(' ')
      .filter(Boolean)
      .slice(0, 2)
      .map((part) => part[0]?.toUpperCase())
      .join('') || 'BC'

  const isDirty =
    name !== (user.name ?? '') ||
    role !== (user.role ?? '') ||
    bio !== (user.bio ?? '') ||
    JSON.stringify(traits) !== JSON.stringify(user.traits ?? [])

  const addTrait = (trait: string) => {
    const trimmed = normalizeTrait(trait)
    if (!trimmed) {
      setTraitInput('')
      return
    }

    if (trimmed.length > TRAIT_MAX) {
      toast.show({ variant: 'danger', label: `Traits must be ${TRAIT_MAX} characters or fewer.` })
      return
    }

    if (traits.includes(trimmed)) {
      setTraitInput('')
      return
    }

    if (traits.length >= TRAITS_MAX_COUNT) {
      toast.show({ variant: 'danger', label: `You can save up to ${TRAITS_MAX_COUNT} traits.` })
      return
    }

    setTraits([...traits, trimmed])
    setTraitInput('')
  }

  const removeTrait = (trait: string) => {
    setTraits(traits.filter((t) => t !== trait))
  }

  const handleSave = async () => {
    if (isSaving || !isDirty) return

    if (!name.trim()) {
      toast.show({ variant: 'danger', label: 'Name is required.' })
      return
    }

    setIsSaving(true)

    try {
      await updateProfile({
        name: name.trim(),
        role: role.trim(),
        traits: traits.map(normalizeTrait).filter(Boolean),
        bio: bio.trim(),
      })
      toast.show({ variant: 'success', label: 'Profile saved.' })
    } catch (error) {
      toast.show({
        variant: 'danger',
        label: error instanceof Error ? error.message : 'Failed to save profile.',
      })
    } finally {
      setIsSaving(false)
    }
  }

  return (
    <View className='gap-8'>
      {/* User card with avatar */}
      <View className='items-center gap-4'>
        <View
          className='w-24 h-24 rounded-full items-center justify-center'
          style={{
            borderWidth: 2,
            borderColor: `${colors.primary}40`,
            backgroundColor: colors.background,
          }}
        >
          {user.image ? (
            <Image
              source={{ uri: user.image }}
              className='w-[88px] h-[88px] rounded-full'
            />
          ) : (
            <View
              className='w-[88px] h-[88px] rounded-full items-center justify-center'
              style={{ backgroundColor: `${colors.primary}1A` }}
            >
              <Text
                className='text-2xl font-semibold'
                style={{ color: colors.primary }}
              >
                {initials}
              </Text>
            </View>
          )}
        </View>
        <View className='items-center'>
          <Text
            className='text-sm font-semibold'
            style={{ color: colors.foreground }}
          >
            {displayName}
          </Text>
          <Text
            className='text-[11px] mt-0.5'
            style={{ color: colors.mutedForeground }}
          >
            {displayEmail}
          </Text>
        </View>
      </View>

      {/* Usage stats */}
      <View
        className='rounded-xl p-4 gap-3'
        style={{
          borderWidth: 1,
          borderColor: `${colors.border}80`,
          backgroundColor: `${colors.card}50`,
        }}
      >
        <Text className='text-xs font-medium' style={{ color: colors.foreground }}>
          Usage
        </Text>
        <View
          className='flex-row items-start gap-2 rounded-lg px-3 py-2'
          style={{
            backgroundColor: `${colors.background}80`,
            borderWidth: 1,
            borderColor: `${colors.border}60`,
          }}
        >
          <Ionicons
            name='information-circle-outline'
            size={12}
            color={`${colors.foreground}99`}
            style={{ marginTop: 1 }}
          />
          <Text className='flex-1 text-[11px] leading-relaxed' style={{ color: colors.mutedForeground }}>
            Temporary chats are not included in these totals.
          </Text>
        </View>
        <View className='gap-2'>
          {[
            { label: 'Total Tokens', value: usageStats?.totalTokens.toLocaleString() },
            { label: 'Input Tokens', value: usageStats?.totalInputTokens.toLocaleString() },
            { label: 'Output Tokens', value: usageStats?.totalOutputTokens.toLocaleString() },
            { label: 'Total Cost', value: usageStats ? `$${usageStats.totalCostUsd.toFixed(4)}` : undefined },
            { label: 'Messages', value: usageStats?.messageCount.toLocaleString() },
          ].map((stat) => (
            <View key={stat.label} className='flex-row items-center justify-between'>
              <Text className='text-[11px]' style={{ color: colors.mutedForeground }}>
                {stat.label}
              </Text>
              <Text className='text-[11px] font-mono' style={{ color: colors.foreground }}>
                {stat.value ?? '\u2014'}
              </Text>
            </View>
          ))}
        </View>
      </View>

      {/* Header */}
      <View>
        <Text
          className='text-xl font-semibold'
          style={{ color: colors.foreground, letterSpacing: -0.3 }}
        >
          Customize Based Chat
        </Text>
        <Text
          className='mt-1 text-sm'
          style={{ color: colors.mutedForeground }}
        >
          Personalize how Based Chat interacts with you.
        </Text>
      </View>

      {/* Name */}
      <View className='gap-2'>
        <Text className='text-xs font-medium' style={{ color: colors.foreground }}>
          What should Based Chat call you?
        </Text>
        <View
          className='rounded-xl px-3 py-2.5'
          style={{ backgroundColor: `${colors.muted}50`, borderWidth: 1, borderColor: `${colors.border}80` }}
        >
          <View className='flex-row items-center'>
            <TextInput
              value={name}
              onChangeText={(text) => text.length <= NAME_MAX && setName(text)}
              placeholder='Enter your name'
              placeholderTextColor={`${colors.mutedForeground}80`}
              className='flex-1 text-sm'
              style={{ color: colors.foreground }}
            />
            <Text
              className='text-[10px] font-mono'
              style={{ color: `${colors.mutedForeground}60` }}
            >
              {name.length}/{NAME_MAX}
            </Text>
          </View>
        </View>
      </View>

      {/* Role */}
      <View className='gap-2'>
        <Text className='text-xs font-medium' style={{ color: colors.foreground }}>
          What do you do?
        </Text>
        <View
          className='rounded-xl px-3 py-2.5'
          style={{ backgroundColor: `${colors.muted}50`, borderWidth: 1, borderColor: `${colors.border}80` }}
        >
          <View className='flex-row items-center'>
            <TextInput
              value={role}
              onChangeText={(text) => text.length <= ROLE_MAX && setRole(text)}
              placeholder='Engineer, student, etc.'
              placeholderTextColor={`${colors.mutedForeground}80`}
              className='flex-1 text-sm'
              style={{ color: colors.foreground }}
            />
            <Text
              className='text-[10px] font-mono'
              style={{ color: `${colors.mutedForeground}60` }}
            >
              {role.length}/{ROLE_MAX}
            </Text>
          </View>
        </View>
      </View>

      {/* Traits */}
      <View className='gap-2'>
        <Text className='text-xs font-medium' style={{ color: colors.foreground }}>
          What traits should Based Chat have?
        </Text>
        <View
          className='rounded-xl px-3 py-2.5'
          style={{ backgroundColor: `${colors.muted}50`, borderWidth: 1, borderColor: `${colors.border}80` }}
        >
          <TextInput
            value={traitInput}
            onChangeText={(text) => text.length <= TRAIT_MAX && setTraitInput(text)}
            placeholder='Type a trait and press return...'
            placeholderTextColor={`${colors.mutedForeground}80`}
            className='text-sm'
            style={{ color: colors.foreground }}
            onSubmitEditing={() => {
              if (traitInput.trim()) addTrait(traitInput)
            }}
            returnKeyType='done'
          />
        </View>

        {traits.length > 0 && (
          <View className='flex-row flex-wrap gap-1.5 mt-1'>
            {traits.map((trait) => (
              <Pressable
                key={trait}
                onPress={() => removeTrait(trait)}
                className='flex-row items-center gap-1 rounded-full px-2.5 py-1.5'
                style={{ backgroundColor: `${colors.primary}26` }}
              >
                <Text
                  className='text-[11px] font-medium'
                  style={{ color: colors.primary }}
                >
                  {trait}
                </Text>
                <Ionicons name='close' size={10} color={colors.primary} />
              </Pressable>
            ))}
          </View>
        )}

        <View className='flex-row flex-wrap gap-1.5 mt-1'>
          {SUGGESTED_TRAITS.filter((t) => !traits.includes(t)).map((trait) => (
            <Pressable
              key={trait}
              onPress={() => addTrait(trait)}
              className='flex-row items-center gap-1 rounded-full px-2.5 py-1.5'
              style={{
                borderWidth: 1,
                borderColor: `${colors.border}80`,
                backgroundColor: `${colors.muted}33`,
              }}
            >
              <Text
                className='text-[11px]'
                style={{ color: colors.mutedForeground }}
              >
                {trait}
              </Text>
              <Ionicons name='add' size={10} color={colors.mutedForeground} />
            </Pressable>
          ))}
        </View>
      </View>

      {/* Bio */}
      <View className='gap-2'>
        <Text className='text-xs font-medium' style={{ color: colors.foreground }}>
          Anything else Based Chat should know about you?
        </Text>
        <View
          className='rounded-xl px-3 py-2.5'
          style={{ backgroundColor: `${colors.muted}50`, borderWidth: 1, borderColor: `${colors.border}80` }}
        >
          <TextInput
            value={bio}
            onChangeText={(text) => text.length <= BIO_MAX && setBio(text)}
            placeholder='Interests, values, or preferences to keep in mind'
            placeholderTextColor={`${colors.mutedForeground}80`}
            className='text-sm min-h-[120px]'
            style={{ color: colors.foreground, textAlignVertical: 'top' }}
            multiline
          />
          <Text
            className='text-[10px] font-mono mt-1 self-end'
            style={{ color: `${colors.mutedForeground}60` }}
          >
            {bio.length}/{BIO_MAX}
          </Text>
        </View>
      </View>

      {/* Save button */}
      <View className='items-end'>
        <ThemedButton
          variant='primary'
          size='md'
          disabled={isSaving || !isDirty}
          onPress={() => { void handleSave() }}
        >
          {isSaving ? 'Saving...' : 'Save changes'}
        </ThemedButton>
      </View>
    </View>
  )
}
