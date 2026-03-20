import { api } from '@based-chat/backend/convex/_generated/api'
import {
  BottomSheetBackdrop,
  BottomSheetFlatList,
  BottomSheetModal,
  BottomSheetTextInput,
  type BottomSheetBackdropProps,
} from '@gorhom/bottom-sheet'
import { Ionicons } from '@expo/vector-icons'
import { useMutation, useQuery } from 'convex/react'
import * as Haptics from 'expo-haptics'
import { useToast } from 'heroui-native'
import { useCallback, useDeferredValue, useEffect, useMemo, useRef, useState } from 'react'
import { Image, Keyboard, Platform, Pressable, Text, View, type FlatList as NativeFlatList } from 'react-native'
import { FlatList as GestureHandlerFlatList } from 'react-native-gesture-handler'

import { useAppTheme } from '@/contexts/app-theme-context'
import { appStorage } from '@/lib/mmkv'
import {
  formatModelPricing,
  getProviderIconUrl,
  type Model,
  type ModelCapability,
  type Provider,
  useModelCatalog,
} from '@/lib/models'
import { useColors } from '@/lib/use-colors'

type ModelFilter = 'favorites' | string

const FILTER_STORAGE_KEY = 'based-chat:model-selector-filter'

const CAPABILITY_META: Record<ModelCapability, { icon: keyof typeof Ionicons.glyphMap; label: string }> = {
  image: { icon: 'eye-outline', label: 'Vision' },
  reasoning: { icon: 'bulb-outline', label: 'Reasoning' },
  pdf: { icon: 'document-text-outline', label: 'PDF' },
  'image-gen': { icon: 'image-outline', label: 'Image gen' },
}

function getStoredFilter(providers: Provider[]): ModelFilter {
  const val = appStorage.getString(FILTER_STORAGE_KEY)

  if (!val) return 'favorites'

  if (val === 'favorites') {
    return val as ModelFilter
  }

  // Allow the persisted provider filter to survive initial app startup before
  // the provider catalog has finished loading. A later validation effect will
  // reset it if it turns out to be invalid.
  if (providers.length === 0 || providers.some((provider) => provider.id === val)) {
    return val as ModelFilter
  }

  return 'favorites'
}

function getProviderDisplayName(providerId: string, providers: Provider[]) {
  return providers.find((provider) => provider.id === providerId)?.name ?? providerId
}

function ProviderLogo({ provider, size = 18 }: { provider: string; size?: number }) {
  const { isDark } = useAppTheme()
  const url = getProviderIconUrl(provider, isDark ? 'dark' : 'light')

  if (!url) return <View style={{ width: size, height: size }} />

  return (
    <Image
      source={{ uri: url }}
      style={{ width: size, height: size }}
      resizeMode='contain'
    />
  )
}

function CapabilityChip({
  capability,
  colors,
}: {
  capability: ModelCapability
  colors: ReturnType<typeof useColors>
}) {
  const meta = CAPABILITY_META[capability]

  return (
    <View
      className='flex-row items-center gap-1 rounded-md px-1.5 py-0.5'
      style={{ backgroundColor: colors.muted }}
    >
      <Ionicons name={meta.icon} size={10} color={colors.mutedForeground} />
      <Text
        className='text-[10px]'
        style={{ color: colors.mutedForeground, fontWeight: '500' }}
      >
        {meta.label}
      </Text>
    </View>
  )
}

function useBottomSheetBackdrop() {
  return useCallback(
    (props: BottomSheetBackdropProps) => (
      <BottomSheetBackdrop
        {...props}
        appearsOnIndex={0}
        disappearsOnIndex={-1}
        pressBehavior='close'
        opacity={0.32}
      />
    ),
    [],
  )
}

function ModelDetailSheet({
  model,
  isOpen,
  onClose,
  providers,
  colors,
}: {
  model: Model | null
  isOpen: boolean
  onClose: () => void
  providers: Provider[]
  colors: ReturnType<typeof useColors>
}) {
  const sheetRef = useRef<BottomSheetModal>(null)
  const snapPoints = useMemo(() => ['45%'], [])
  const renderBackdrop = useBottomSheetBackdrop()

  useEffect(() => {
    if (!sheetRef.current) return

    if (isOpen && model) {
      sheetRef.current.present()
    } else {
      sheetRef.current.dismiss()
    }
  }, [isOpen, model])

  if (!model) return null

  return (
    <BottomSheetModal
      ref={sheetRef}
      snapPoints={snapPoints}
      enableDynamicSizing={false}
      enablePanDownToClose
      onDismiss={onClose}
      backdropComponent={renderBackdrop}
      backgroundStyle={{
        backgroundColor: colors.card,
        borderTopLeftRadius: 28,
        borderTopRightRadius: 28,
        borderWidth: 1,
        borderColor: colors.border,
      }}
      handleIndicatorStyle={{ backgroundColor: colors.muted }}
    >
      <View className='px-5 pt-3 pb-safe-offset-6 gap-4'>
        <View className='flex-row items-center gap-3'>
          <View
            className='w-10 h-10 rounded-xl items-center justify-center'
            style={{ backgroundColor: `${colors.primary}14` }}
          >
            <ProviderLogo provider={model.provider} size={22} />
          </View>
          <View className='flex-1'>
            <View className='flex-row items-center gap-2'>
              <Text
                className='text-base font-semibold'
                style={{ color: colors.foreground }}
              >
                {model.name}
              </Text>
              {model.badge ? (
                <View
                  className='rounded px-1.5 py-0.5'
                  style={{ backgroundColor: `${colors.primary}1A` }}
                >
                  <Text
                    className='text-[9px] font-bold uppercase'
                    style={{ color: colors.primary, letterSpacing: 0.8 }}
                  >
                    {model.badge}
                  </Text>
                </View>
              ) : null}
            </View>
            <Text
              className='text-xs mt-0.5'
              style={{ color: colors.mutedForeground }}
            >
              {getProviderDisplayName(model.provider, providers)}
            </Text>
          </View>
        </View>

        <Text
          className='text-sm leading-relaxed'
          style={{ color: colors.mutedForeground }}
        >
          {model.description}
        </Text>

        <View className='h-px' style={{ backgroundColor: `${colors.border}80` }} />

        <View>
          <Text
            className='text-[10px] uppercase font-medium mb-1.5'
            style={{ color: colors.mutedForeground, letterSpacing: 1 }}
          >
            Pricing
          </Text>
          <Text
            className='text-xs'
            style={{
              color: colors.foreground,
              fontFamily: Platform.OS === 'ios' ? 'Menlo' : 'monospace',
            }}
          >
            {formatModelPricing(model.pricing)}
          </Text>
        </View>

        {model.capabilities.length > 0 ? (
          <View>
            <Text
              className='text-[10px] uppercase font-medium mb-2'
              style={{ color: colors.mutedForeground, letterSpacing: 1 }}
            >
              Capabilities
            </Text>
            <View className='flex-row flex-wrap gap-1.5'>
              {model.capabilities.map((capability) => (
                <CapabilityChip key={capability} capability={capability} colors={colors} />
              ))}
            </View>
          </View>
        ) : null}
      </View>
    </BottomSheetModal>
  )
}

function ProviderFilterBar({
  providers,
  selectedFilter,
  onSelect,
  colors,
  isOpen,
}: {
  providers: Provider[]
  selectedFilter: ModelFilter
  onSelect: (filter: ModelFilter) => void
  colors: ReturnType<typeof useColors>
  isOpen: boolean
}) {
  const listRef = useRef<NativeFlatList<ModelFilter>>(null)
  const restoreTimersRef = useRef<Array<ReturnType<typeof setTimeout>>>([])
  const wasOpenRef = useRef(false)
  const filterItems = useMemo<ModelFilter[]>(
    () => ['favorites', ...providers.map((provider) => provider.id)],
    [providers],
  )
  const selectedIndex = useMemo(
    () => Math.max(filterItems.indexOf(selectedFilter), 0),
    [filterItems, selectedFilter],
  )

  const clearRestoreTimers = useCallback(() => {
    restoreTimersRef.current.forEach((timer) => clearTimeout(timer))
    restoreTimersRef.current = []
  }, [])

  const scrollSelectedIntoView = useCallback((animated: boolean) => {
    if (!listRef.current) return

    listRef.current.scrollToIndex({
      index: selectedIndex,
      animated,
      viewPosition: 0.5,
    })
    clearRestoreTimers()
  }, [clearRestoreTimers, selectedIndex])

  const handleScrollToIndexFailed = useCallback(
    ({ averageItemLength, index }: { averageItemLength: number; index: number }) => {
      listRef.current?.scrollToOffset({
        offset: Math.max(averageItemLength * index - 32, 0),
        animated: false,
      })

      const timer = setTimeout(() => {
        scrollSelectedIntoView(true)
      }, 50)

      restoreTimersRef.current.push(timer)
    },
    [scrollSelectedIntoView],
  )

  useEffect(() => {
    if (isOpen && !wasOpenRef.current) {
      clearRestoreTimers()

      const timer = setTimeout(() => {
        scrollSelectedIntoView(true)
      }, 80)

      restoreTimersRef.current.push(timer)

      wasOpenRef.current = true
    }

    if (!isOpen) {
      wasOpenRef.current = false
      clearRestoreTimers()
    }

    return clearRestoreTimers
  }, [clearRestoreTimers, isOpen, scrollSelectedIntoView])

  return (
    <GestureHandlerFlatList
      ref={listRef}
      data={filterItems}
      horizontal
      showsHorizontalScrollIndicator={false}
      nestedScrollEnabled
      directionalLockEnabled
      keyboardShouldPersistTaps='handled'
      initialNumToRender={filterItems.length}
      maxToRenderPerBatch={filterItems.length}
      windowSize={filterItems.length + 1}
      removeClippedSubviews={false}
      onScrollToIndexFailed={handleScrollToIndexFailed}
      keyExtractor={(item) => item}
      contentContainerStyle={{ paddingHorizontal: 16, gap: 6, paddingVertical: 2 }}
      renderItem={({ item }) => {
        const isFavorites = item === 'favorites'
        const isSelected = selectedFilter === item
        const provider = providers.find((entry) => entry.id === item)

        return (
          <Pressable
            onPress={() => {
              void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light)
              onSelect(item)
            }}
            className='h-9 flex-row items-center gap-1.5 rounded-xl px-3'
            style={{
              backgroundColor: isSelected ? `${colors.primary}18` : colors.muted,
              borderWidth: isSelected ? 1 : 0,
              borderColor: `${colors.primary}30`,
            }}
          >
            {isFavorites ? (
              <Ionicons
                name={isSelected ? 'star' : 'star-outline'}
                size={14}
                color={isSelected ? '#f59e0b' : colors.mutedForeground}
              />
            ) : (
              <ProviderLogo provider={provider?.id ?? item} size={14} />
            )}
            <Text
              className='text-xs font-medium'
              style={{
                color: isSelected ? colors.foreground : colors.mutedForeground,
              }}
            >
              {isFavorites ? 'Favorites' : provider?.name ?? item}
            </Text>
          </Pressable>
        )
      }}
    />
  )
}

function ModelRow({
  model,
  providers,
  isFavorite,
  isSelected,
  onSelect,
  onToggleFavorite,
  onShowInfo,
  isFavoritePending,
  colors,
}: {
  model: Model
  providers: Provider[]
  isFavorite: boolean
  isSelected: boolean
  onSelect: (model: Model) => void
  onToggleFavorite: (modelId: string, isFavorite: boolean) => void
  onShowInfo: (model: Model) => void
  isFavoritePending: boolean
  colors: ReturnType<typeof useColors>
}) {
  const providerLabel = getProviderDisplayName(model.provider, providers)
  const visibleCapabilities = model.capabilities.slice(0, 3)
  const remainingCapabilities = model.capabilities.length - visibleCapabilities.length

  return (
    <Pressable
      onPress={() => onSelect(model)}
      className='mx-3 mb-2 rounded-2xl px-3 py-3'
      style={({ pressed }) => ({
        backgroundColor: isSelected ? `${colors.primary}12` : pressed ? colors.accent : `${colors.card}99`,
        borderWidth: 1,
        borderColor: isSelected ? `${colors.primary}4D` : `${colors.border}66`,
      })}
    >
      <View className='flex-row items-start gap-3'>
        <View
          className='w-11 h-11 rounded-xl items-center justify-center'
          style={{ backgroundColor: isSelected ? `${colors.primary}1A` : colors.muted }}
        >
          <ProviderLogo provider={model.provider} size={20} />
        </View>

        <View className='flex-1 min-w-0'>
          <View className='flex-row items-start gap-2'>
            <View className='flex-1 min-w-0'>
              <View className='flex-row items-center gap-1.5'>
                <Text
                  className='text-sm font-semibold'
                  numberOfLines={1}
                  style={{
                    color: isSelected ? colors.primary : colors.foreground,
                    letterSpacing: -0.2,
                    flexShrink: 1,
                  }}
                >
                  {model.name}
                </Text>
                {model.badge ? (
                  <View
                    className='rounded-full px-1.5 py-0.5'
                    style={{ backgroundColor: `${colors.primary}1A` }}
                  >
                    <Text
                      className='text-[8px] font-bold uppercase'
                      style={{ color: colors.primary, letterSpacing: 0.6 }}
                    >
                      {model.badge}
                    </Text>
                  </View>
                ) : null}
                {model.isLegacy ? (
                  <View
                    className='rounded-full px-1.5 py-0.5'
                    style={{ backgroundColor: `${colors.mutedForeground}1A` }}
                  >
                    <Text
                      className='text-[8px] font-medium uppercase'
                      style={{ color: colors.mutedForeground, letterSpacing: 0.4 }}
                    >
                      Legacy
                    </Text>
                  </View>
                ) : null}
              </View>
              <Text
                className='text-[11px] mt-1'
                numberOfLines={2}
                style={{ color: colors.mutedForeground, lineHeight: 16 }}
              >
                {model.description}
              </Text>
            </View>

            <View className='items-end gap-1.5'>
              {isSelected ? (
                <View
                  className='w-7 h-7 rounded-full items-center justify-center'
                  style={{ backgroundColor: `${colors.primary}18` }}
                >
                  <Ionicons name='checkmark' size={14} color={colors.primary} />
                </View>
              ) : null}

              <View className='flex-row items-center gap-1'>
                <Pressable
                  onPress={() => {
                    void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light)
                    onShowInfo(model)
                  }}
                  className='w-8 h-8 items-center justify-center rounded-xl'
                  style={({ pressed }) => ({
                    backgroundColor: pressed ? `${colors.accent}CC` : `${colors.muted}99`,
                  })}
                >
                  <Ionicons
                    name='information-circle-outline'
                    size={17}
                    color={`${colors.mutedForeground}CC`}
                  />
                </Pressable>

                <Pressable
                  onPress={() => {
                    void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light)
                    onToggleFavorite(model.id, isFavorite)
                  }}
                  disabled={isFavoritePending}
                  className='w-8 h-8 items-center justify-center rounded-xl'
                  style={({ pressed }) => ({
                    backgroundColor: pressed ? `${colors.accent}CC` : `${colors.muted}99`,
                    opacity: isFavoritePending ? 0.5 : 1,
                  })}
                >
                  <Ionicons
                    name={isFavorite ? 'star' : 'star-outline'}
                    size={15}
                    color={isFavorite ? '#f59e0b' : `${colors.mutedForeground}80`}
                  />
                </Pressable>
              </View>
            </View>
          </View>

          <View className='flex-row items-center gap-1.5 mt-2'>
            <Text
              className='text-[10px] font-medium uppercase'
              style={{ color: colors.mutedForeground, letterSpacing: 0.7 }}
              numberOfLines={1}
            >
              {providerLabel}
            </Text>
            <View
              className='w-1 h-1 rounded-full'
              style={{ backgroundColor: `${colors.mutedForeground}66` }}
            />
            <Text
              className='text-[10px]'
              numberOfLines={1}
              style={{
                color: colors.mutedForeground,
                fontFamily: Platform.OS === 'ios' ? 'Menlo' : 'monospace',
                flexShrink: 1,
              }}
            >
              {formatModelPricing(model.pricing)}
            </Text>
          </View>

          {visibleCapabilities.length > 0 ? (
            <View className='flex-row flex-wrap gap-1.5 mt-2'>
              {visibleCapabilities.map((capability) => (
                <CapabilityChip key={`${model.id}-${capability}`} capability={capability} colors={colors} />
              ))}
              {remainingCapabilities > 0 ? (
                <View
                  className='rounded-md px-1.5 py-0.5'
                  style={{ backgroundColor: colors.muted }}
                >
                  <Text
                    className='text-[10px] font-medium'
                    style={{ color: colors.mutedForeground }}
                  >
                    +{remainingCapabilities}
                  </Text>
                </View>
              ) : null}
            </View>
          ) : null}
        </View>
      </View>
    </Pressable>
  )
}

type ListItem =
  | { type: 'model'; model: Model; isFavorite: boolean; key: string }
  | { type: 'legacy-toggle'; count: number; key: string }

function SelectorListHeader({
  model,
  providers,
  providerLabel,
  favoriteIdSet,
  search,
  onSearchChange,
  onClearSearch,
  hasSearch,
  selectedFilter,
  filteredCount,
  onSelectFilter,
  sectionLabel,
  colors,
  isOpen,
}: {
  model: Model
  providers: Provider[]
  providerLabel: string
  favoriteIdSet: Set<string>
  search: string
  onSearchChange: (value: string) => void
  onClearSearch: () => void
  hasSearch: boolean
  selectedFilter: ModelFilter
  filteredCount: number
  onSelectFilter: (filter: ModelFilter) => void
  sectionLabel: string
  colors: ReturnType<typeof useColors>
  isOpen: boolean
}) {
  return (
    <>
      <View className='px-4 pb-3 gap-3'>
        <View className='flex-row items-center justify-between'>
          <View>
            <Text
              className='text-[10px] font-medium uppercase'
              style={{ color: colors.mutedForeground, letterSpacing: 1.2 }}
            >
              Choose model
            </Text>
            <Text
              className='text-lg font-semibold mt-1'
              style={{ color: colors.foreground }}
            >
              Fastest path to the right model
            </Text>
          </View>
          <View
            className='rounded-full px-2.5 py-1'
            style={{ backgroundColor: `${colors.primary}14` }}
          >
            <Text
              className='text-[10px] font-semibold'
              style={{ color: colors.primary }}
            >
              {favoriteIdSet.has(model.id) ? 'Favorited' : 'Current'}
            </Text>
          </View>
        </View>

        <View
          className='flex-row items-center gap-3 rounded-2xl px-3 py-3'
          style={{
            backgroundColor: `${colors.muted}B3`,
            borderWidth: 1,
            borderColor: `${colors.border}80`,
          }}
        >
          <View
            className='w-11 h-11 rounded-xl items-center justify-center'
            style={{ backgroundColor: `${colors.primary}14` }}
          >
            <ProviderLogo provider={model.provider} size={20} />
          </View>
          <View className='flex-1 min-w-0'>
            <Text
              className='text-sm font-semibold'
              style={{ color: colors.foreground }}
              numberOfLines={1}
            >
              {model.name}
            </Text>
            <Text
              className='text-[11px] mt-0.5'
              style={{ color: colors.mutedForeground }}
              numberOfLines={1}
            >
              {providerLabel}
            </Text>
            <Text
              className='text-[10px] mt-1'
              style={{
                color: colors.mutedForeground,
                fontFamily: Platform.OS === 'ios' ? 'Menlo' : 'monospace',
              }}
              numberOfLines={1}
            >
              {formatModelPricing(model.pricing)}
            </Text>
          </View>
        </View>

        <View
          className='flex-row items-center gap-2 rounded-xl px-3 h-10'
          style={{
            backgroundColor: colors.muted,
            borderWidth: 1,
            borderColor: `${colors.border}66`,
          }}
        >
          <Ionicons name='search' size={16} color={`${colors.mutedForeground}66`} />
          <BottomSheetTextInput
            value={search}
            onChangeText={onSearchChange}
            placeholder='Search models...'
            placeholderTextColor={`${colors.mutedForeground}55`}
            style={{
              flex: 1,
              fontSize: 14,
              color: colors.foreground,
              fontFamily: Platform.OS === 'ios' ? undefined : 'sans-serif',
              paddingVertical: 0,
            }}
            returnKeyType='search'
            autoCorrect={false}
            autoCapitalize='none'
          />
          {search.length > 0 ? (
            <Pressable
              onPress={onClearSearch}
              className='w-6 h-6 items-center justify-center rounded-full'
              style={{ backgroundColor: `${colors.mutedForeground}20` }}
            >
              <Ionicons name='close' size={12} color={colors.mutedForeground} />
            </Pressable>
          ) : null}
        </View>
      </View>

      {!hasSearch ? (
        <View className='pb-3 gap-2'>
          <View className='px-4 flex-row items-center justify-between'>
            <Text
              className='text-[10px] font-medium uppercase'
              style={{ color: colors.mutedForeground, letterSpacing: 1 }}
            >
              Browse by provider
            </Text>
            <Text
              className='text-[10px]'
              style={{ color: `${colors.mutedForeground}CC` }}
            >
              {filteredCount} shown
            </Text>
          </View>
          <ProviderFilterBar
            providers={providers}
            selectedFilter={selectedFilter}
            onSelect={onSelectFilter}
            colors={colors}
            isOpen={isOpen}
          />
        </View>
      ) : null}

      <View className='h-px' style={{ backgroundColor: `${colors.border}60` }} />

      <View className='flex-row items-center justify-between px-4 py-3'>
        <Text
          className='text-[10px] font-medium uppercase'
          style={{ color: colors.mutedForeground, letterSpacing: 1 }}
        >
          {sectionLabel}
        </Text>
        <Text
          className='text-[10px]'
          style={{ color: `${colors.mutedForeground}CC` }}
        >
          {filteredCount} total
        </Text>
      </View>
    </>
  )
}

export default function ModelSelector({
  model,
  onModelChange,
  placement = 'input',
}: {
  model: Model
  onModelChange: (model: Model) => void
  placement?: 'input' | 'header'
}) {
  const { models, providers } = useModelCatalog()
  const colors = useColors()
  const { toast } = useToast()
  const providerLabel = getProviderDisplayName(model.provider, providers)
  const isHeaderPlacement = placement === 'header'
  const selectorSheetRef = useRef<BottomSheetModal>(null)

  const [isOpen, setIsOpen] = useState(false)
  const [selectorSheetIndex, setSelectorSheetIndex] = useState(-1)
  const [search, setSearch] = useState('')
  const [selectedFilter, setSelectedFilter] = useState<ModelFilter>(() =>
    getStoredFilter(providers),
  )
  const [showLegacy, setShowLegacy] = useState(false)
  const [infoModel, setInfoModel] = useState<Model | null>(null)
  const [isInfoOpen, setIsInfoOpen] = useState(false)
  const [optimisticFavoriteIds, setOptimisticFavoriteIds] = useState<string[] | null>(null)
  const [pendingFavoriteIds, setPendingFavoriteIds] = useState<string[]>([])

  const deferredSearch = useDeferredValue(search)
  const snapPoints = useMemo(() => ['78%'], [])
  const renderBackdrop = useBottomSheetBackdrop()

  const favoriteModelIds = useQuery(api.favoriteModels.list, {})
  const toggleFavorite = useMutation(api.favoriteModels.toggle)

  useEffect(() => {
    if (favoriteModelIds !== undefined) {
      setOptimisticFavoriteIds(favoriteModelIds)
    }
  }, [favoriteModelIds])

  useEffect(() => {
    if (
      providers.length > 0 &&
      selectedFilter !== 'favorites' &&
      !providers.some((provider) => provider.id === selectedFilter)
    ) {
      setSelectedFilter('favorites')
      appStorage.set(FILTER_STORAGE_KEY, 'favorites')
    }
  }, [providers, selectedFilter])

  useEffect(() => {
    if (isOpen) {
      selectorSheetRef.current?.present()
      setSearch('')
      setShowLegacy(false)
    } else {
      selectorSheetRef.current?.dismiss()
    }
  }, [isOpen])

  const activeFavoriteIds = optimisticFavoriteIds ?? favoriteModelIds ?? []
  const favoriteIdSet = useMemo(() => new Set(activeFavoriteIds), [activeFavoriteIds])

  const rankedModels = useMemo(() => {
    return models.map((entry, index) => ({
      index,
      model: entry,
      isFavorite: favoriteIdSet.has(entry.id),
    })).sort((a, b) => {
      if (a.isFavorite !== b.isFavorite) return a.isFavorite ? -1 : 1
      return a.index - b.index
    })
  }, [favoriteIdSet, models])

  const hasSearch = deferredSearch.trim().length > 0

  const filteredModels = useMemo(() => {
    let models = rankedModels

    if (!hasSearch) {
      if (selectedFilter === 'favorites') {
        models = models.filter((entry) => entry.isFavorite)
      } else {
        models = models.filter((entry) => entry.model.provider === selectedFilter)
      }
    }

    if (hasSearch) {
      const query = deferredSearch.toLowerCase()
      models = models.filter(
        ({ model: entryModel }) =>
          entryModel.name.toLowerCase().includes(query) ||
          entryModel.provider.toLowerCase().includes(query) ||
          entryModel.description.toLowerCase().includes(query),
      )
    }

    return models
  }, [deferredSearch, hasSearch, rankedModels, selectedFilter])

  const isProviderView = selectedFilter !== 'favorites' && !hasSearch

  const primaryModels = useMemo(() => {
    if (!isProviderView) return filteredModels
    return filteredModels.filter(({ model: entryModel }) => !entryModel.isLegacy)
  }, [filteredModels, isProviderView])

  const legacyModels = useMemo(() => {
    if (!isProviderView) return []
    return filteredModels.filter(({ model: entryModel }) => entryModel.isLegacy)
  }, [filteredModels, isProviderView])

  const shouldShowLegacy = isProviderView && legacyModels.length > 0

  const listData = useMemo<ListItem[]>(() => {
    const items: ListItem[] = primaryModels.map(({ model: entryModel, isFavorite }) => ({
      type: 'model',
      model: entryModel,
      isFavorite,
      key: entryModel.id,
    }))

    if (shouldShowLegacy) {
      items.push({
        type: 'legacy-toggle',
        count: legacyModels.length,
        key: 'legacy-toggle',
      })

      if (showLegacy) {
        items.push(
          ...legacyModels.map(({ model: entryModel, isFavorite }) => ({
            type: 'model' as const,
            model: entryModel,
            isFavorite,
            key: entryModel.id,
          })),
        )
      }
    }

    return items
  }, [legacyModels, primaryModels, shouldShowLegacy, showLegacy])

  const handleSelectFilter = useCallback((filter: ModelFilter) => {
    setSelectedFilter(filter)
    setShowLegacy(false)
    appStorage.set(FILTER_STORAGE_KEY, filter)
  }, [])

  const handleSelect = useCallback(
    (selected: Model) => {
      void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium)
      onModelChange(selected)
      setIsOpen(false)
    },
    [onModelChange],
  )

  const handleToggleFavorite = useCallback(
    async (modelId: string, isFavorite: boolean) => {
      if (pendingFavoriteIds.includes(modelId)) return

      const currentIds = optimisticFavoriteIds ?? favoriteModelIds ?? []
      const nextIds = isFavorite
        ? currentIds.filter((id) => id !== modelId)
        : [...currentIds, modelId]

      setOptimisticFavoriteIds(nextIds)
      setPendingFavoriteIds((current) => [...current, modelId])

      try {
        await toggleFavorite({ modelId })
      } catch {
        setOptimisticFavoriteIds(currentIds)
        toast.show({ variant: 'danger', label: 'Could not update favorites.' })
      } finally {
        setPendingFavoriteIds((current) => current.filter((id) => id !== modelId))
      }
    },
    [favoriteModelIds, optimisticFavoriteIds, pendingFavoriteIds, toggleFavorite, toast],
  )

  const handleShowInfo = useCallback((nextModel: Model) => {
    setInfoModel(nextModel)
    setIsInfoOpen(true)
  }, [])

  const emptyMessage =
    selectedFilter === 'favorites' && activeFavoriteIds.length === 0
      ? 'No favorites yet.\nStar a model to pin it here.'
      : 'No models found.'

  const sectionLabel =
    hasSearch
      ? 'Matching models'
      : selectedFilter === 'favorites'
        ? 'Favorites'
        : getProviderDisplayName(selectedFilter, providers)

  const headerComponent = useMemo(
    () => (
      <SelectorListHeader
        model={model}
        providers={providers}
        providerLabel={providerLabel}
        favoriteIdSet={favoriteIdSet}
        search={search}
        onSearchChange={setSearch}
        onClearSearch={() => setSearch('')}
        hasSearch={hasSearch}
        selectedFilter={selectedFilter}
        filteredCount={filteredModels.length}
        onSelectFilter={handleSelectFilter}
        sectionLabel={sectionLabel}
        colors={colors}
        isOpen={selectorSheetIndex >= 0}
      />
    ),
    [
      colors,
      favoriteIdSet,
      filteredModels.length,
      handleSelectFilter,
      hasSearch,
      model,
      providerLabel,
      providers,
      search,
      sectionLabel,
      selectorSheetIndex,
      selectedFilter,
    ],
  )

  const renderItem = useCallback(
    ({ item }: { item: ListItem }) => {
      if (item.type === 'legacy-toggle') {
        return (
          <Pressable
            onPress={() => {
              void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light)
              setShowLegacy((current) => !current)
            }}
            className='flex-row items-center justify-between mx-4 my-2 px-3 py-2.5 rounded-xl'
            style={{
              backgroundColor: colors.muted,
              borderWidth: 1,
              borderColor: `${colors.border}66`,
            }}
          >
            <Text className='text-xs' style={{ color: colors.mutedForeground }}>
              {item.count} legacy model{item.count === 1 ? '' : 's'}
            </Text>
            <Ionicons
              name={showLegacy ? 'chevron-up' : 'chevron-down'}
              size={14}
              color={colors.mutedForeground}
            />
          </Pressable>
        )
      }

      return (
        <ModelRow
          model={item.model}
          providers={providers}
          isFavorite={item.isFavorite}
          isSelected={item.model.id === model.id}
          onSelect={handleSelect}
          onToggleFavorite={(id, isFavorite) => void handleToggleFavorite(id, isFavorite)}
          onShowInfo={handleShowInfo}
          isFavoritePending={pendingFavoriteIds.includes(item.model.id)}
          colors={colors}
        />
      )
    },
    [
      colors,
      handleSelect,
      handleShowInfo,
      handleToggleFavorite,
      model.id,
      pendingFavoriteIds,
      providers,
      showLegacy,
    ],
  )

  const keyExtractor = useCallback((item: ListItem) => item.key, [])

  return (
    <>
      <Pressable
        onPress={() => {
          void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light)
          Keyboard.dismiss()
          setIsOpen(true)
        }}
        className='flex-row items-center gap-2 rounded-2xl px-2.5 py-2'
        style={({ pressed }) => ({
          backgroundColor: pressed
            ? `${colors.accent}E6`
            : isHeaderPlacement
              ? 'transparent'
              : `${colors.muted}B3`,
          borderWidth: isHeaderPlacement ? 0 : 1,
          borderColor: isHeaderPlacement ? 'transparent' : `${colors.border}80`,
          flexShrink: 1,
          minWidth: 0,
        })}
      >
        <View className='flex-1 min-w-0'>
          <Text
            className='text-[9px] font-medium uppercase'
            style={{ color: colors.mutedForeground, letterSpacing: 0.8 }}
            numberOfLines={1}
          >
            {providerLabel}
          </Text>
          <Text
            className={isHeaderPlacement ? 'text-sm font-semibold' : 'text-xs font-semibold'}
            style={{ color: colors.foreground }}
            numberOfLines={1}
          >
            {model.name}
          </Text>
        </View>
        <Ionicons name='chevron-down' size={12} color={`${colors.mutedForeground}A6`} />
      </Pressable>

      <BottomSheetModal
        ref={selectorSheetRef}
        snapPoints={snapPoints}
        enableDynamicSizing={false}
        enablePanDownToClose
        onChange={(index) => setSelectorSheetIndex(index)}
        onDismiss={() => {
          setSelectorSheetIndex(-1)
          setIsOpen(false)
        }}
        backdropComponent={renderBackdrop}
        backgroundStyle={{
          backgroundColor: colors.card,
          borderTopLeftRadius: 28,
          borderTopRightRadius: 28,
          borderWidth: 1,
          borderColor: colors.border,
        }}
        handleIndicatorStyle={{ backgroundColor: colors.muted }}
      >
        <BottomSheetFlatList
          data={listData}
          renderItem={renderItem}
          keyExtractor={keyExtractor}
          ListHeaderComponent={headerComponent}
          ListEmptyComponent={
            <View className='items-center justify-center px-8 py-16'>
              <Ionicons
                name={selectedFilter === 'favorites' ? 'star-outline' : 'search-outline'}
                size={32}
                color={`${colors.mutedForeground}40`}
              />
              <Text
                className='text-sm text-center mt-3 leading-relaxed'
                style={{ color: `${colors.mutedForeground}80` }}
              >
                {emptyMessage}
              </Text>
            </View>
          }
          contentContainerStyle={{
            paddingBottom: 12,
            flexGrow: listData.length === 0 ? 1 : undefined,
          }}
          keyboardShouldPersistTaps='handled'
          keyboardDismissMode='on-drag'
          showsVerticalScrollIndicator={false}
        />
      </BottomSheetModal>

      <ModelDetailSheet
        model={infoModel}
        isOpen={isInfoOpen}
        onClose={() => setIsInfoOpen(false)}
        providers={providers}
        colors={colors}
      />
    </>
  )
}
