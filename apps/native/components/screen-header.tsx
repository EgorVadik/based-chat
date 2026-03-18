import { Ionicons } from '@expo/vector-icons'
import { DrawerActions } from '@react-navigation/native'
import * as Haptics from 'expo-haptics'
import { useNavigation } from 'expo-router'
import { Platform, Pressable, Text, View } from 'react-native'
import Animated, { FadeIn, FadeOut } from 'react-native-reanimated'
import { useSafeAreaInsets } from 'react-native-safe-area-context'

import { useColors } from '@/lib/use-colors'

type ScreenHeaderProps = {
  title?: string
  subtitle?: string
  icon?: React.ComponentProps<typeof Ionicons>['name']
  centerElement?: React.ReactNode
  rightElement?: React.ReactNode
  showDrawerToggle?: boolean
  showBackButton?: boolean
  borderless?: boolean
}

export function ScreenHeader({
  title,
  subtitle,
  icon,
  centerElement,
  rightElement,
  showDrawerToggle = true,
  showBackButton = false,
  borderless = false,
}: ScreenHeaderProps) {
  const colors = useColors()
  const insets = useSafeAreaInsets()
  const navigation = useNavigation()

  return (
    <View
      style={{
        paddingTop: insets.top,
        backgroundColor: colors.background,
        borderBottomWidth: borderless ? 0 : 1,
        borderBottomColor: `${colors.border}40`,
      }}
    >
      <View
        className='flex-row items-center px-4'
        style={{ height: 52 }}
      >
        {/* Left side — drawer toggle or back button */}
        {showBackButton ? (
          <Pressable
            onPress={() => {
              void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light)
              navigation.goBack()
            }}
            className='w-9 h-9 items-center justify-center rounded-xl mr-2.5'
            style={({ pressed }) => ({
              backgroundColor: pressed ? `${colors.accent}B3` : 'transparent',
            })}
          >
            <Ionicons
              name='chevron-back'
              size={20}
              color={colors.foreground}
            />
          </Pressable>
        ) : showDrawerToggle ? (
          <Pressable
            onPress={() => {
              void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light)
              navigation.dispatch(DrawerActions.toggleDrawer())
            }}
            className='w-9 h-9 items-center justify-center rounded-xl mr-2.5'
            style={({ pressed }) => ({
              backgroundColor: pressed ? `${colors.accent}B3` : 'transparent',
            })}
          >
            <View className='gap-[4.5px]'>
              <View
                className='rounded-full'
                style={{
                  width: 16,
                  height: 1.5,
                  backgroundColor: colors.foreground,
                  opacity: 0.8,
                }}
              />
              <View
                className='rounded-full'
                style={{
                  width: 12,
                  height: 1.5,
                  backgroundColor: colors.foreground,
                  opacity: 0.5,
                }}
              />
            </View>
          </Pressable>
        ) : null}

        {/* Center — title block */}
        <Animated.View
          entering={FadeIn.duration(300)}
          className='flex-1'
        >
          {centerElement ? (
            centerElement
          ) : (
            <View className='flex-row items-center gap-2.5'>
              {icon ? (
                <View
                  className='w-7 h-7 items-center justify-center rounded-lg'
                  style={{ backgroundColor: `${colors.primary}14` }}
                >
                  <Ionicons name={icon} size={15} color={colors.primary} />
                </View>
              ) : null}
              <View className='flex-1'>
                <Text
                  className='text-[15px] font-semibold'
                  numberOfLines={1}
                  style={{
                    color: colors.foreground,
                    letterSpacing: -0.3,
                    fontFamily: Platform.OS === 'ios' ? 'System' : undefined,
                  }}
                >
                  {title}
                </Text>
                {subtitle ? (
                  <Animated.Text
                    entering={FadeIn.duration(200).delay(100)}
                    exiting={FadeOut.duration(150)}
                    className='text-[10px] mt-0.5'
                    numberOfLines={1}
                    style={{
                      color: colors.mutedForeground,
                      letterSpacing: 0.2,
                    }}
                  >
                    {subtitle}
                  </Animated.Text>
                ) : null}
              </View>
            </View>
          )}
        </Animated.View>

        {/* Right side */}
        {rightElement ? (
          <View className='ml-2'>{rightElement}</View>
        ) : null}
      </View>
    </View>
  )
}

export function HeaderIconButton({
  icon,
  onPress,
  color,
  size = 18,
}: {
  icon: React.ComponentProps<typeof Ionicons>['name']
  onPress: () => void
  color?: string
  size?: number
}) {
  const colors = useColors()

  return (
    <Pressable
      onPress={() => {
        void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light)
        onPress()
      }}
      className='w-9 h-9 items-center justify-center rounded-xl'
      style={({ pressed }) => ({
        backgroundColor: pressed ? `${colors.accent}B3` : 'transparent',
      })}
    >
      <Ionicons name={icon} size={size} color={color ?? colors.mutedForeground} />
    </Pressable>
  )
}
