export const SETTINGS_TABS = [
  { id: "profile", label: "Profile" },
  { id: "threads", label: "History & Sync" },
  { id: "models", label: "Models" },
  { id: "api-keys", label: "API Keys" },
  { id: "attachments", label: "Attachments" },
  { id: "security", label: "Security" },
] as const;

export type SettingsTabId = (typeof SETTINGS_TABS)[number]["id"];

export function isSettingsTabId(value: unknown): value is SettingsTabId {
  return SETTINGS_TABS.some((tab) => tab.id === value);
}
