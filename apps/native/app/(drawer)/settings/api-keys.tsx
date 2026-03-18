import ApiKeysTab from '@/components/settings/api-keys-tab'
import { SettingsTabScreen } from '@/components/settings/settings-tab-screen'

export default function SettingsApiKeysScreen() {
  return (
    <SettingsTabScreen
      keyboardAware
      keyboardBottomOffset={16}
      extraKeyboardSpace={24}
    >
      <ApiKeysTab />
    </SettingsTabScreen>
  )
}
