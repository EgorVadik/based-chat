import { router } from 'expo-router'
import { View } from 'react-native'

import ModelSelector from '@/components/chat/model-selector'
import {
  HeaderIconButton,
  ScreenHeader,
} from '@/components/screen-header'
import { useSelectedModel } from '@/lib/selected-model'

export function ChatHeader() {
  const { model, setModel } = useSelectedModel()

  return (
    <ScreenHeader
      centerElement={
        <ModelSelector
          model={model}
          onModelChange={setModel}
          placement='header'
        />
      }
      rightElement={
        <View className='flex-row items-center'>
          <HeaderIconButton
            icon='settings-outline'
            onPress={() => router.navigate('/(drawer)/settings')}
          />
        </View>
      }
    />
  )
}
