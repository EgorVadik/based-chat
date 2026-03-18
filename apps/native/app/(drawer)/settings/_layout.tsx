import { Ionicons } from '@expo/vector-icons'
import { Text, View } from 'react-native'

import {
  SETTINGS_TABS,
  type SettingsTabRoute,
} from '@/components/settings/settings-tabs'
import { MaterialTopTab } from '@/lib/material-top-tab'
import { useColors } from '@/lib/use-colors'

export const unstable_settings = {
  initialRouteName: 'index',
}

export default function SettingsTabsLayout() {
  const colors = useColors()

  return (
    <MaterialTopTab
      screenOptions={({ route }) => {
        const tab = SETTINGS_TABS.find(
          (item) => item.name === (route.name as SettingsTabRoute),
        )

        return {
          lazy: true,
          swipeEnabled: true,
          sceneStyle: { backgroundColor: colors.background },
          tabBarScrollEnabled: true,
          tabBarActiveTintColor: colors.primary,
          tabBarInactiveTintColor: colors.mutedForeground,
          tabBarStyle: {
            backgroundColor: colors.background,
            borderBottomWidth: 1,
            borderBottomColor: `${colors.border}80`,
            elevation: 0,
            shadowOpacity: 0,
          },
          tabBarIndicatorStyle: {
            backgroundColor: colors.primary,
            height: 2,
          },
          tabBarItemStyle: {
            width: 'auto',
          },
          tabBarContentContainerStyle: {
            paddingHorizontal: 16,
          },
          tabBarPressColor: 'transparent',
          tabBarLabel: ({ color }) => (
            <View className='flex-row items-center gap-1.5'>
              {tab?.icon ? (
                <Ionicons name={tab.icon} size={14} color={color} />
              ) : null}
              <Text className='text-xs font-medium' style={{ color }}>
                {tab?.label ?? route.name}
              </Text>
            </View>
          ),
        }
      }}
    >
      {SETTINGS_TABS.map((tab) => (
        <MaterialTopTab.Screen
          key={tab.name}
          name={tab.name}
          options={{ title: tab.label }}
        />
      ))}
    </MaterialTopTab>
  )
}
