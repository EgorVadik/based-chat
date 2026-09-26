import { THEME_STORAGE_KEY } from '@/contexts/app-theme-context'
import { clearStoredOpenRouterApiKey } from '@/lib/api-keys'
import { authClient } from '@/lib/auth-client'
import { appStorage } from '@/lib/mmkv'
import { setTemporaryChatStreaming } from '@/lib/temporary-chat'

/** Device-level preferences that are safe to keep across accounts. */
const PRESERVED_STORAGE_KEYS = new Set([THEME_STORAGE_KEY])

async function wipeLocalUserData() {
  // The OpenRouter key and temporary chat are stored per device, not per
  // account, so the next account on this device must not inherit them.
  await clearStoredOpenRouterApiKey()

  for (const key of appStorage.getAllKeys()) {
    if (!PRESERVED_STORAGE_KEYS.has(key)) {
      appStorage.delete(key)
    }
  }

  setTemporaryChatStreaming(false)
}

/**
 * Signs out and clears local per-user data. With `force`, local data is wiped
 * even if the sign-out request fails (e.g. the account was just deleted).
 */
export async function signOutAndWipe({ force = false } = {}) {
  let errorMessage: string | null = null

  try {
    const { error } = await authClient.signOut()
    if (error) {
      errorMessage = error.message || 'Failed to sign out.'
    }
  } catch (error) {
    errorMessage =
      error instanceof Error ? error.message : 'Failed to sign out.'
  }

  if (errorMessage && !force) {
    return { error: errorMessage }
  }

  await wipeLocalUserData()
  return { error: null }
}
