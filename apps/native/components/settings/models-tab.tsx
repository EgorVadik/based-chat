import { api } from '@based-chat/backend/convex/_generated/api'
import { Ionicons } from '@expo/vector-icons'
import { useMutation, useQuery } from 'convex/react'
import { useToast } from 'heroui-native'
import { useCallback, useEffect, useMemo, useState } from 'react'
import {
  FlatList,
  Image,
  Pressable,
  Text,
  TextInput,
  View,
} from 'react-native'

import { useAppTheme } from '@/contexts/app-theme-context'
import {
  formatModelPricing,
  getProviderIconUrl,
  type Model,
  useModelCatalog,
} from '@/lib/models'
import { useColors } from '@/lib/use-colors'

type FilterMode = 'all' | 'favorites' | 'non-favorites'

function ProviderIcon({
  provider,
  colors,
  theme,
}: {
  provider: string
  colors: ReturnType<typeof useColors>
  theme: 'light' | 'dark'
}) {
  const iconUrl = getProviderIconUrl(provider, theme)

  if (!iconUrl) {
    return (
      <View
        className='w-9 h-9 rounded-lg items-center justify-center'
        style={{ backgroundColor: `${colors.muted}60` }}
      >
        <Text
          className='text-[10px] font-bold font-mono uppercase'
          style={{ color: colors.mutedForeground }}
        >
          {provider.slice(0, 2)}
        </Text>
      </View>
    )
  }

  return (
    <View
      className='w-9 h-9 rounded-lg items-center justify-center'
      style={{ backgroundColor: `${colors.muted}60` }}
    >
      <Image
        source={{ uri: iconUrl }}
        style={{ width: 20, height: 20 }}
        resizeMode='contain'
      />
    </View>
  )
}

function ModelRow({
  model,
  isFavorite,
  isPending,
  isLast,
  onToggleFavorite,
  colors,
  theme,
}: {
  model: Model
  isFavorite: boolean
  isPending: boolean
  isLast: boolean
  onToggleFavorite: (modelId: string) => void
  colors: ReturnType<typeof useColors>
  theme: 'light' | 'dark'
}) {
  return (
    <View
      className='flex-row items-center gap-3 py-3 px-1'
      style={{
        borderBottomWidth: isLast ? 0 : 1,
        borderBottomColor: `${colors.border}50`,
      }}
    >
      <ProviderIcon provider={model.provider} colors={colors} theme={theme} />

      <View className='flex-1 min-w-0'>
        <View className='flex-row items-center gap-2'>
          <Text
            className='text-sm font-medium'
            numberOfLines={1}
            style={{ color: colors.foreground }}
          >
            {model.name}
          </Text>
          {model.badge ? (
            <View
              className='rounded-full px-1.5 py-0.5'
              style={{ backgroundColor: `${colors.primary}26` }}
            >
              <Text
                className='text-[9px] font-semibold uppercase'
                style={{ color: colors.primary, letterSpacing: 0.5 }}
              >
                {model.badge}
              </Text>
            </View>
          ) : null}
          {model.isLegacy ? (
            <View
              className='rounded-full px-1.5 py-0.5'
              style={{ backgroundColor: `${colors.muted}80` }}
            >
              <Text
                className='text-[9px] font-medium uppercase'
                style={{ color: colors.mutedForeground, letterSpacing: 0.5 }}
              >
                Legacy
              </Text>
            </View>
          ) : null}
        </View>
        <View className='flex-row items-center gap-1.5 mt-0.5'>
          <Text
            className='text-xs'
            numberOfLines={1}
            style={{ color: colors.mutedForeground, flex: 1 }}
          >
            {model.description}
          </Text>
          <Text
            className='text-[10px] font-mono'
            style={{ color: `${colors.mutedForeground}80` }}
          >
            {formatModelPricing(model.pricing)}
          </Text>
        </View>
      </View>

      <Pressable
        onPress={() => onToggleFavorite(model.id)}
        disabled={isPending}
        className='p-1'
        style={{ opacity: isPending ? 0.5 : 1 }}
      >
        <Ionicons
          name={isFavorite ? 'star' : 'star-outline'}
          size={18}
          color={isFavorite ? colors.primary : `${colors.mutedForeground}40`}
        />
      </Pressable>
    </View>
  )
}

export default function ModelsTab() {
  const { models: catalogModels } = useModelCatalog()
  const colors = useColors()
  const { isDark } = useAppTheme()
  const currentTheme: 'light' | 'dark' = isDark ? 'dark' : 'light'
  const { toast } = useToast()
  const favoriteModelIds = useQuery(api.favoriteModels.list, {})
  const toggleFavorite = useMutation(api.favoriteModels.toggle)

  const [optimisticFavoriteIds, setOptimisticFavoriteIds] = useState<
    string[] | null
  >(null)
  const [pendingFavoriteIds, setPendingFavoriteIds] = useState<string[]>([])
  const [search, setSearch] = useState('')
  const [filter, setFilter] = useState<FilterMode>('all')
  const [showLegacy, setShowLegacy] = useState(false)

  useEffect(() => {
    if (favoriteModelIds !== undefined) {
      setOptimisticFavoriteIds(favoriteModelIds)
    }
  }, [favoriteModelIds])

  const activeFavoriteIds = optimisticFavoriteIds ?? favoriteModelIds ?? []
  const favoriteIdSet = useMemo(
    () => new Set(activeFavoriteIds),
    [activeFavoriteIds],
  )

  const handleToggleFavorite = useCallback(
    async (modelId: string) => {
      if (pendingFavoriteIds.includes(modelId)) return

      const current = optimisticFavoriteIds ?? favoriteModelIds ?? []
      const next = current.includes(modelId)
        ? current.filter((id) => id !== modelId)
        : [...current, modelId]

      setOptimisticFavoriteIds(next)
      setPendingFavoriteIds((prev) => [...prev, modelId])

      try {
        await toggleFavorite({ modelId })
      } catch {
        setOptimisticFavoriteIds(current)
        toast.show({
          variant: 'danger',
          label: 'Could not update favorites right now.',
        })
      } finally {
        setPendingFavoriteIds((prev) => prev.filter((id) => id !== modelId))
      }
    },
    [
      optimisticFavoriteIds,
      favoriteModelIds,
      pendingFavoriteIds,
      toggleFavorite,
      toast,
    ],
  )

  const filteredModels = useMemo(() => {
    let models = showLegacy
      ? catalogModels
      : catalogModels.filter((entry) => !entry.isLegacy)
    if (filter === 'favorites')
      models = models.filter((m) => favoriteIdSet.has(m.id))
    else if (filter === 'non-favorites')
      models = models.filter((m) => !favoriteIdSet.has(m.id))

    if (search.trim()) {
      const query = search.toLowerCase()
      models = models.filter(
        (m) =>
          m.name.toLowerCase().includes(query) ||
          m.provider.toLowerCase().includes(query) ||
          m.description.toLowerCase().includes(query),
      )
    }

    return models
  }, [catalogModels, favoriteIdSet, filter, search, showLegacy])

  const renderItem = useCallback(
    ({ item, index }: { item: Model; index: number }) => (
      <ModelRow
        model={item}
        isFavorite={favoriteIdSet.has(item.id)}
        isPending={pendingFavoriteIds.includes(item.id)}
        isLast={index === filteredModels.length - 1}
        onToggleFavorite={handleToggleFavorite}
        colors={colors}
        theme={currentTheme}
      />
    ),
    [
      favoriteIdSet,
      pendingFavoriteIds,
      filteredModels.length,
      handleToggleFavorite,
      colors,
      currentTheme,
    ],
  )

  const keyExtractor = useCallback((item: Model) => item.id, [])

  const listHeader = useMemo(
    () => (
      <View className='gap-6 mb-2'>
        <View>
          <Text
            className='text-xl font-semibold'
            style={{ color: colors.foreground, letterSpacing: -0.3 }}
          >
            Models
          </Text>
          <Text
            className='mt-1 text-sm'
            style={{ color: colors.mutedForeground }}
          >
            Choose which models appear in your selector.
          </Text>
        </View>

        <View
          className='flex-row items-center gap-2 rounded-xl px-3 py-2.5'
          style={{
            backgroundColor: `${colors.muted}50`,
            borderWidth: 1,
            borderColor: `${colors.border}80`,
          }}
        >
          <Ionicons
            name='search-outline'
            size={14}
            color={`${colors.mutedForeground}80`}
          />
          <TextInput
            value={search}
            onChangeText={setSearch}
            placeholder='Search models...'
            placeholderTextColor={`${colors.mutedForeground}80`}
            className='flex-1 text-sm'
            style={{ color: colors.foreground }}
          />
        </View>

        <View className='flex-row items-center gap-2'>
          {(['all', 'favorites', 'non-favorites'] as FilterMode[]).map(
            (mode) => (
              <Pressable
                key={mode}
                onPress={() => setFilter(mode)}
                className='rounded-full px-3 py-1.5'
                style={{
                  backgroundColor:
                    filter === mode
                      ? `${colors.primary}1A`
                      : `${colors.muted}50`,
                  borderWidth: 1,
                  borderColor:
                    filter === mode
                      ? `${colors.primary}40`
                      : `${colors.border}60`,
                }}
              >
                <Text
                  className='text-[11px] font-medium capitalize'
                  style={{
                    color:
                      filter === mode
                        ? colors.primary
                        : colors.mutedForeground,
                  }}
                >
                  {mode === 'non-favorites' ? 'Others' : mode}
                </Text>
              </Pressable>
            ),
          )}

          <View className='flex-1' />

          <Pressable
            onPress={() => setShowLegacy((v) => !v)}
            className='rounded-full px-3 py-1.5'
            style={{
              backgroundColor: showLegacy
                ? `${colors.mutedForeground}1A`
                : `${colors.muted}50`,
              borderWidth: 1,
              borderColor: showLegacy
                ? `${colors.mutedForeground}40`
                : `${colors.border}60`,
            }}
          >
            <Text
              className='text-[11px] font-medium'
              style={{ color: colors.mutedForeground }}
            >
              {showLegacy ? 'Hide legacy' : 'Show legacy'}
            </Text>
          </Pressable>
        </View>
      </View>
    ),
    [colors, search, filter, showLegacy],
  )

  const listEmpty = useMemo(
    () => (
      <View className='py-12 items-center'>
        <Text
          className='text-xs'
          style={{ color: `${colors.mutedForeground}60` }}
        >
          No models found.
        </Text>
      </View>
    ),
    [colors],
  )

  return (
    <FlatList
      data={filteredModels}
      renderItem={renderItem}
      keyExtractor={keyExtractor}
      ListHeaderComponent={listHeader}
      ListEmptyComponent={listEmpty}
      contentContainerStyle={{
        paddingHorizontal: 20,
        paddingTop: 24,
        paddingBottom: 40,
      }}
      keyboardShouldPersistTaps='handled'
      style={{ backgroundColor: colors.background }}
    />
  )
}
