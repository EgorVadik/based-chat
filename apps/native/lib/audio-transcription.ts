import { File as ExpoFile } from 'expo-file-system'
import { fetch as expoFetch } from 'expo/fetch'
import { Platform } from 'react-native'

import { getStoredOpenRouterApiKey } from '@/lib/api-keys'
import { authClient } from '@/lib/auth-client'

function arrayBufferToBase64(buffer: ArrayBuffer): string {
  const bytes = new Uint8Array(buffer)
  let binary = ''
  const chunk = 0x8000
  for (let i = 0; i < bytes.length; i += chunk) {
    const sub = bytes.subarray(i, i + chunk)
    binary += String.fromCharCode.apply(
      null,
      sub as unknown as number[],
    )
  }
  // eslint-disable-next-line no-undef
  return btoa(binary)
}

function mimeTypeFromFileName(fileName: string): string {
  const lower = fileName.toLowerCase()
  if (lower.endsWith('.3gp') || lower.endsWith('.3gpp')) {
    return 'audio/3gpp'
  }
  if (lower.endsWith('.m4a') || lower.endsWith('.mp4') || lower.endsWith('.aac')) {
    return 'audio/m4a'
  }
  if (lower.endsWith('.wav')) return 'audio/wav'
  if (lower.endsWith('.webm')) return 'audio/webm'
  if (lower.endsWith('.mp3') || lower.endsWith('.mpeg')) return 'audio/mpeg'
  if (lower.endsWith('.3gp') || lower.endsWith('.3gpp')) return 'audio/3gpp'
  return 'audio/m4a'
}

function fileNameFromUri(uri: string): string {
  const clean = uri.split('?')[0] ?? uri
  const last = clean.split('/').pop()
  return last && last.length > 0 ? last : `recording-${Date.now()}.m4a`
}

/**
 * Read local file as base64 (native-safe for file:// and content://).
 */
export async function readFileAsBase64(uri: string): Promise<string> {
  let buffer: ArrayBuffer
  if (Platform.OS === 'web') {
    const res = await fetch(uri)
    if (!res.ok) {
      throw new Error('Could not read audio file for transcription.')
    }
    buffer = await res.arrayBuffer()
  } else if (uri.startsWith('file://') || uri.startsWith('content://')) {
    const localFile = new ExpoFile(uri)
    buffer = await localFile.arrayBuffer()
  } else {
    const res = await fetch(uri)
    if (!res.ok) {
      throw new Error('Could not read audio file for transcription.')
    }
    buffer = await res.arrayBuffer()
  }
  return arrayBufferToBase64(buffer)
}

/**
 * Transcribe a local audio file via Convex HTTP → OpenRouter (wav/mp3: gpt-audio; m4a etc.: Gemini).
 */
export async function transcribeLocalAudioFile(uri: string): Promise<string> {
  const fileName = fileNameFromUri(uri)
  const mimeType = mimeTypeFromFileName(fileName)

  const tokenResult = await authClient.convex.token({
    fetchOptions: { throw: false },
  })
  const accessToken = tokenResult.data?.token
  if (!accessToken) {
    throw new Error('Could not authenticate the transcription request.')
  }

  const apiKey = await getStoredOpenRouterApiKey()
  if (!apiKey?.trim()) {
    throw new Error(
      'Add an OpenRouter API key in Settings to use voice input.',
    )
  }

  const audio = await readFileAsBase64(uri)
  if (!audio || audio.length < 16) {
    throw new Error('Recording was empty. Try again.')
  }

  const response = await expoFetch(
    new URL(
      '/audio/transcribe',
      process.env.EXPO_PUBLIC_CONVEX_SITE_URL!,
    ).toString(),
    {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${accessToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        audio,
        mimeType,
        fileName,
        apiKey: apiKey.trim(),
      }),
    },
  )

  if (!response.ok) {
    const errText = (await response.text()).trim()
    throw new Error(
      errText || `Transcription failed with status ${response.status}.`,
    )
  }

  const data = (await response.json()) as { text?: string }
  const text = typeof data.text === 'string' ? data.text.trim() : ''
  if (!text) {
    throw new Error('No text returned. Try speaking again.')
  }
  return text
}
