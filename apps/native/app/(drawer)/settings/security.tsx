import SecurityTab from '@/components/settings/security-tab'
import { SettingsTabScreen } from '@/components/settings/settings-tab-screen'

export default function SettingsSecurityScreen() {
  return (
    <SettingsTabScreen keyboardAware keyboardBottomOffset={16} extraKeyboardSpace={24}>
      <SecurityTab />
    </SettingsTabScreen>
  )
}
