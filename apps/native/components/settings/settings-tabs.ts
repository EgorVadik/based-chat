import type { ComponentProps } from 'react'

import { Ionicons } from '@expo/vector-icons'

type SettingsTabIcon = ComponentProps<typeof Ionicons>['name']

export const SETTINGS_TABS = [
  { name: 'index', label: 'Profile', icon: 'person-outline' as SettingsTabIcon },
  { name: 'threads', label: 'History', icon: 'chatbubbles-outline' as SettingsTabIcon },
  { name: 'models', label: 'Models', icon: 'cube-outline' as SettingsTabIcon },
  { name: 'api-keys', label: 'API Keys', icon: 'key-outline' as SettingsTabIcon },
  { name: 'attachments', label: 'Files', icon: 'attach-outline' as SettingsTabIcon },
  { name: 'security', label: 'Security', icon: 'shield-outline' as SettingsTabIcon },
] as const

export type SettingsTabRoute = (typeof SETTINGS_TABS)[number]['name']
