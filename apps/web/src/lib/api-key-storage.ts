const OPENROUTER_API_KEY_STORAGE_KEY = 'based-chat:openrouter-api-key'

function normalizeApiKey(apiKey: string | null | undefined) {
  const trimmedApiKey = apiKey?.trim()
  return trimmedApiKey ? trimmedApiKey : null
}

export function getStoredOpenRouterApiKey() {
  if (typeof window === 'undefined') {
    return ''
  }

  return normalizeApiKey(
    window.localStorage.getItem(OPENROUTER_API_KEY_STORAGE_KEY),
  )
    ?? ''
}

export function saveStoredOpenRouterApiKey(apiKey: string) {
  if (typeof window === 'undefined') {
    return ''
  }

  const normalizedApiKey = normalizeApiKey(apiKey)

  if (!normalizedApiKey) {
    window.localStorage.removeItem(OPENROUTER_API_KEY_STORAGE_KEY)
    return ''
  }

  window.localStorage.setItem(
    OPENROUTER_API_KEY_STORAGE_KEY,
    normalizedApiKey,
  )

  return normalizedApiKey
}
