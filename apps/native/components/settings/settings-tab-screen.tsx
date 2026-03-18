import type { PropsWithChildren } from 'react'
import type { StyleProp, ViewStyle } from 'react-native'
import { ScrollView, View } from 'react-native'
import {
  KeyboardAwareScrollView,
  KeyboardAvoidingView,
} from 'react-native-keyboard-controller'

import { useColors } from '@/lib/use-colors'

export function SettingsTabScreen({
  children,
  contentContainerStyle,
  keyboardAware = false,
  keyboardBottomOffset = 0,
  extraKeyboardSpace = 0,
}: PropsWithChildren<{
  contentContainerStyle?: StyleProp<ViewStyle>
  keyboardAware?: boolean
  keyboardBottomOffset?: number
  extraKeyboardSpace?: number
}>) {
  const colors = useColors()
  const sharedContentContainerStyle = [
    {
      paddingHorizontal: 20,
      paddingTop: 24,
      paddingBottom: 40,
    },
    contentContainerStyle,
  ]

  return (
    <View className='flex-1' style={{ backgroundColor: colors.background }}>
      {keyboardAware ? (
        <KeyboardAvoidingView
          className='flex-1'
          behavior='padding'
          keyboardVerticalOffset={keyboardBottomOffset}
        >
          <KeyboardAwareScrollView
            bottomOffset={keyboardBottomOffset}
            extraKeyboardSpace={extraKeyboardSpace}
            keyboardDismissMode='interactive'
            keyboardShouldPersistTaps='handled'
            contentContainerStyle={sharedContentContainerStyle}
          >
            {children}
          </KeyboardAwareScrollView>
        </KeyboardAvoidingView>
      ) : (
        <ScrollView
          contentContainerStyle={sharedContentContainerStyle}
          keyboardShouldPersistTaps='handled'
        >
          {children}
        </ScrollView>
      )}
    </View>
  )
}
