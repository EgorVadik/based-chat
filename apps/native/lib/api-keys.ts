import * as SecureStore from 'expo-secure-store'

import { appStorage } from '@/lib/mmkv'

export const OPENROUTER_API_KEY_STORAGE_KEY = 'based-chat:openrouter-api-key'
const OPENROUTER_API_KEY_FALLBACK_STORAGE_KEY =
  'based-chat:openrouter-api-key:fallback'

export type ApiKeyStorageMode = 'secure' | 'local' | 'none'

function normalizeApiKey(key: string | null | undefined) {
  const trimmed = key?.trim()
  return trimmed || null
}

export async function getStoredOpenRouterApiKey() {
  try {
    const secureValue = normalizeApiKey(
      await SecureStore.getItemAsync(OPENROUTER_API_KEY_STORAGE_KEY),
    )
    if (secureValue) {
      return secureValue
    }
  } catch {
    // Fall through to local storage fallback.
  }

  return normalizeApiKey(
    appStorage.getString(OPENROUTER_API_KEY_FALLBACK_STORAGE_KEY),
  )
}

export async function getOpenRouterApiKeyStorageMode(): Promise<ApiKeyStorageMode> {
  try {
    const secureValue = normalizeApiKey(
      await SecureStore.getItemAsync(OPENROUTER_API_KEY_STORAGE_KEY),
    )
    if (secureValue) {
      return 'secure'
    }
  } catch {
    // Fall through to local storage fallback.
  }

  return normalizeApiKey(
    appStorage.getString(OPENROUTER_API_KEY_FALLBACK_STORAGE_KEY),
  )
    ? 'local'
    : 'none'
}

export async function saveOpenRouterApiKey(
  key: string | null | undefined,
): Promise<ApiKeyStorageMode> {
  const normalized = normalizeApiKey(key)

  if (!normalized) {
    await clearStoredOpenRouterApiKey()
    return 'none'
  }

  try {
    await SecureStore.setItemAsync(OPENROUTER_API_KEY_STORAGE_KEY, normalized)
    appStorage.delete(OPENROUTER_API_KEY_FALLBACK_STORAGE_KEY)
    return 'secure'
  } catch {
    appStorage.set(OPENROUTER_API_KEY_FALLBACK_STORAGE_KEY, normalized)
    return 'local'
  }
}

export async function clearStoredOpenRouterApiKey() {
  try {
    await SecureStore.deleteItemAsync(OPENROUTER_API_KEY_STORAGE_KEY)
  } catch {
    // Ignore secure storage cleanup failures.
  }

  appStorage.delete(OPENROUTER_API_KEY_FALLBACK_STORAGE_KEY)
}

export { normalizeApiKey }
