import { api } from '@based-chat/backend/convex/_generated/api'
import { useQuery } from 'convex/react'
import { ActivityIndicator, Text, View } from 'react-native'

import ProfileTab from '@/components/settings/profile-tab'
import { SettingsTabScreen } from '@/components/settings/settings-tab-screen'
import { useColors } from '@/lib/use-colors'

export default function SettingsProfileScreen() {
  const colors = useColors()
  const user = useQuery(api.auth.getCurrentUser)

  return (
    <SettingsTabScreen keyboardAware keyboardBottomOffset={16} extraKeyboardSpace={24}>
      {user === undefined ? (
        <View className='py-16 items-center'>
          <ActivityIndicator size='small' color={colors.primary} />
        </View>
      ) : user ? (
        <ProfileTab user={user} />
      ) : (
        <View className='py-16 items-center'>
          <Text className='text-sm' style={{ color: colors.mutedForeground }}>
            Unable to load your profile right now.
          </Text>
        </View>
      )}
    </SettingsTabScreen>
  )
}
