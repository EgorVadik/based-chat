import { httpAction } from './_generated/server'
import { authComponent } from './auth'
import { applyCorsHeaders } from './corsHttp'

const OPENROUTER_API = 'https://openrouter.ai/api/v1/chat/completions'
/** OpenAI gpt-audio (via OR) only accepts `wav` | `mp3` for `input_audio.format`. */
const OPENROUTER_MODEL_GPT_AUDIO = 'openai/gpt-audio-mini'
/**
 * Android records AAC in M4A/MP4; gpt-audio does not support that. Use a multimodal
 * model that accepts `m4a` in `input_audio` (per OpenRouter audio docs).
 */
const OPENROUTER_MODEL_MULTIMODAL = 'google/gemini-2.0-flash-001'
const MAX_AUDIO_BYTES = 8 * 1024 * 1024

const TRANSCRIBE_USER_PROMPT =
  'Transcribe the following audio. Return only the exact spoken words, with no preamble, labels, or commentary.'

type OpenRouterChatResponse = {
  choices?: { message?: { content?: string | unknown } }[]
  error?: { message?: string; code?: number }
}

type OpenRouterInputAudioFormat =
  | 'wav'
  | 'mp3'
  | 'm4a'
  | 'aac'
  | 'ogg'
  | 'flac'
  | 'aiff'
  | 'pcm16'
  | 'pcm24'

function resolveOpenRouterApiKey(requestApiKey?: string) {
  const normalized = requestApiKey?.trim()
  return normalized && normalized.length > 0 ? normalized : null
}

function decodeBase64ToBytes(b64: string): Uint8Array {
  if (globalThis.Buffer) {
    return new Uint8Array(globalThis.Buffer.from(b64, 'base64'))
  }
  const bin = atob(b64)
  const out = new Uint8Array(bin.length)
  for (let i = 0; i < bin.length; i++) {
    out[i] = bin.charCodeAt(i)
  }
  return out
}

function isRiffWavBytes(bytes: Uint8Array): boolean {
  if (bytes.length < 12) {
    return false
  }
  return (
    bytes[0] === 0x52 &&
    bytes[1] === 0x49 &&
    bytes[2] === 0x46 &&
    bytes[3] === 0x46 &&
    bytes[8] === 0x57 &&
    bytes[9] === 0x41 &&
    bytes[10] === 0x56 &&
    bytes[11] === 0x45
  )
}

function isMp3Bytes(bytes: Uint8Array): boolean {
  if (bytes.length >= 3 && bytes[0] === 0x49 && bytes[1] === 0x44 && bytes[2] === 0x33) {
    return true
  }
  if (bytes.length >= 2 && bytes[0] === 0xff && (bytes[1] & 0xe0) === 0xe0) {
    return true
  }
  return false
}

function isIsobmffFtypBytes(bytes: Uint8Array): boolean {
  if (bytes.length < 12) {
    return false
  }
  // moof/mp4: size at 0, 'ftyp' at 4
  return (
    bytes[4] === 0x66 && bytes[5] === 0x74 && bytes[6] === 0x79 && bytes[7] === 0x70
  )
}

function isOggBytes(bytes: Uint8Array): boolean {
  if (bytes.length < 4) {
    return false
  }
  return (
    bytes[0] === 0x4f && bytes[1] === 0x67 && bytes[2] === 0x67 && bytes[3] === 0x53
  )
}

/**
 * gpt-audio: only `wav` | `mp3`. M4A/AAC/ogg/etc. must go through a multimodal model
 * (e.g. Gemini) with a matching `input_audio.format`.
 */
function pickModelAndInputAudioFormat(
  bytes: Uint8Array,
  mimeType: string,
  fileName: string | undefined,
): { model: string; format: OpenRouterInputAudioFormat } {
  if (isRiffWavBytes(bytes)) {
    return { model: OPENROUTER_MODEL_GPT_AUDIO, format: 'wav' }
  }
  // Android default recording: ftyp (MP4) + AAC; must not use gpt-audio.
  if (isIsobmffFtypBytes(bytes)) {
    const m = (mimeType || '').toLowerCase()
    if (
      (fileName ?? '').toLowerCase().endsWith('.aac') ||
      (m.includes('aac') && !m.includes('mp4') && !m.includes('m4a') && !m.includes('x-m4a'))
    ) {
      return { model: OPENROUTER_MODEL_MULTIMODAL, format: 'aac' }
    }
    return { model: OPENROUTER_MODEL_MULTIMODAL, format: 'm4a' }
  }
  if (isMp3Bytes(bytes)) {
    return { model: OPENROUTER_MODEL_GPT_AUDIO, format: 'mp3' }
  }
  if (isOggBytes(bytes)) {
    return { model: OPENROUTER_MODEL_MULTIMODAL, format: 'ogg' }
  }

  const m = (mimeType || '').toLowerCase()
  const n = (fileName ?? '').toLowerCase()
  if (m.includes('wav') || n.endsWith('.wav')) {
    return { model: OPENROUTER_MODEL_GPT_AUDIO, format: 'wav' }
  }
  if (m.includes('mp3') || m.includes('mpeg') || n.endsWith('.mp3')) {
    return { model: OPENROUTER_MODEL_GPT_AUDIO, format: 'mp3' }
  }
  if (m.includes('m4a') || m.includes('mp4') || m.includes('aac') || m.includes('x-m4a')) {
    return { model: OPENROUTER_MODEL_MULTIMODAL, format: m.includes('aac') && !m.includes('mp4') ? 'aac' : 'm4a' }
  }
  if (m.includes('ogg') || m.includes('opus')) {
    return { model: OPENROUTER_MODEL_MULTIMODAL, format: 'ogg' }
  }
  if (m.includes('flac')) {
    return { model: OPENROUTER_MODEL_MULTIMODAL, format: 'flac' }
  }
  if (m.includes('webm')) {
    return { model: OPENROUTER_MODEL_MULTIMODAL, format: 'ogg' }
  }

  if (n.endsWith('.m4a') || n.endsWith('.mp4') || n.endsWith('.aac')) {
    return { model: OPENROUTER_MODEL_MULTIMODAL, format: n.endsWith('.aac') ? 'aac' : 'm4a' }
  }

  return { model: OPENROUTER_MODEL_MULTIMODAL, format: 'm4a' }
}

function extractAssistantText(data: OpenRouterChatResponse): string {
  const raw = data.choices?.[0]?.message?.content
  if (typeof raw === 'string' && raw.trim().length > 0) {
    return raw.trim()
  }
  if (Array.isArray(raw)) {
    const parts = raw
      .map((p) => {
        if (typeof p === 'string') return p
        if (p && typeof p === 'object' && 'text' in p) {
          const t = (p as { text?: string }).text
          return typeof t === 'string' ? t : ''
        }
        return ''
      })
      .filter(Boolean)
    const joined = parts.join(' ').trim()
    if (joined.length > 0) {
      return joined
    }
  }
  return ''
}

export const transcribeAudio = httpAction(async (ctx, request) => {
  if (request.method !== 'POST') {
    return applyCorsHeaders(
      new Response('Method not allowed', { status: 405 }),
      request,
    )
  }

  const user = await authComponent.safeGetAuthUser(ctx)
  if (!user) {
    return applyCorsHeaders(
      new Response('Not authenticated', { status: 401 }),
      request,
    )
  }

  let payload: {
    audio?: string
    mimeType?: string
    fileName?: string
    apiKey?: string
  }

  try {
    payload = (await request.json()) as typeof payload
  } catch {
    return applyCorsHeaders(
      new Response('Invalid JSON body', { status: 400 }),
      request,
    )
  }

  const b64 = (
    typeof payload.audio === 'string' ? payload.audio.replace(/\s/g, '') : ''
  ).trim()
  if (!b64) {
    return applyCorsHeaders(
      new Response('Missing audio (base64)', { status: 400 }),
      request,
    )
  }

  let bytes: Uint8Array
  try {
    bytes = decodeBase64ToBytes(b64)
  } catch {
    return applyCorsHeaders(
      new Response('Invalid base64 audio', { status: 400 }),
      request,
    )
  }

  if (bytes.length === 0) {
    return applyCorsHeaders(
      new Response('Empty audio', { status: 400 }),
      request,
    )
  }

  if (bytes.length > MAX_AUDIO_BYTES) {
    return applyCorsHeaders(
      new Response('Audio is too large', { status: 413 }),
      request,
    )
  }

  const requestApiKey = resolveOpenRouterApiKey(
    typeof payload.apiKey === 'string' ? payload.apiKey : undefined,
  )
  if (!requestApiKey) {
    return applyCorsHeaders(
      new Response(
        'An OpenRouter API key is required. Add it in Settings > API Keys and try again.',
        { status: 400 },
      ),
      request,
    )
  }

  const mimeType =
    typeof payload.mimeType === 'string' && payload.mimeType.trim()
      ? payload.mimeType.trim()
      : ''
  const fileName =
    typeof payload.fileName === 'string' && payload.fileName.trim()
      ? payload.fileName.trim()
      : undefined
  const { model, format } = pickModelAndInputAudioFormat(bytes, mimeType, fileName)

  const openRouterBody = {
    model,
    stream: false,
    max_tokens: 4096,
    messages: [
      {
        role: 'user' as const,
        content: [
          { type: 'text', text: TRANSCRIBE_USER_PROMPT },
          {
            type: 'input_audio',
            input_audio: {
              data: b64,
              format,
            },
          },
        ],
      },
    ],
  }

  const siteUrl = process.env.SITE_URL
  const openRouterRes = await fetch(OPENROUTER_API, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${requestApiKey}`,
      ...(siteUrl
        ? {
            'HTTP-Referer': siteUrl,
            'X-Title': 'Based Chat',
          }
        : {}),
    },
    body: JSON.stringify(openRouterBody),
  })

  const responseText = await openRouterRes.text()
  if (!openRouterRes.ok) {
    console.error('[transcribe] openrouter error', {
      userId: user._id,
      status: openRouterRes.status,
      body: responseText.slice(0, 500),
    })
    const msg =
      responseText && responseText.length < 500
        ? responseText
        : `Transcription failed with ${openRouterRes.status}.`
    return applyCorsHeaders(new Response(msg, { status: 502 }), request)
  }

  let parsed: OpenRouterChatResponse
  try {
    parsed = JSON.parse(responseText) as OpenRouterChatResponse
  } catch {
    return applyCorsHeaders(
      new Response('Invalid response from speech service', { status: 502 }),
      request,
    )
  }

  if (parsed.error?.message) {
    return applyCorsHeaders(
      new Response(parsed.error.message, { status: 400 }),
      request,
    )
  }

  const text = extractAssistantText(parsed)
  if (!text) {
    return applyCorsHeaders(
      new Response('No transcript returned. Try again.', { status: 502 }),
      request,
    )
  }

  return applyCorsHeaders(
    new Response(JSON.stringify({ text }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    }),
    request,
  )
})

export const transcribeAudioOptions = httpAction(async (_ctx, request) => {
  return applyCorsHeaders(
    new Response(null, {
      status: 204,
    }),
    request,
  )
})
