export const OPENROUTER_API_KEY_STORAGE_KEY = 'based-chat:openrouter-api-key'

export function normalizeOpenRouterApiKey(apiKey: string | null | undefined) {
  const trimmedApiKey = apiKey?.trim()
  return trimmedApiKey ? trimmedApiKey : null
}

export function getStoredOpenRouterApiKey() {
  if (typeof window === 'undefined') {
    return ''
  }

  return normalizeOpenRouterApiKey(
    window.localStorage.getItem(OPENROUTER_API_KEY_STORAGE_KEY),
  )
    ?? ''
}
