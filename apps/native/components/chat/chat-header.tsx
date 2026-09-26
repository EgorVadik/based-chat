import { router } from 'expo-router'
import { View } from 'react-native'

import ModelSelector from '@/components/chat/model-selector'
import {
  HeaderIconButton,
  ScreenHeader,
} from '@/components/screen-header'
import { type ComposerScope, useComposerAttachments } from '@/lib/attachments'
import { useSelectedModel } from '@/lib/selected-model'

export function ChatHeader({ composerScope }: { composerScope?: ComposerScope }) {
  const { model, setModel } = useSelectedModel()
  const pendingAttachments = useComposerAttachments(composerScope)

  return (
    <ScreenHeader
      centerElement={
        <ModelSelector
          model={model}
          onModelChange={setModel}
          placement='header'
          pendingAttachments={pendingAttachments}
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
