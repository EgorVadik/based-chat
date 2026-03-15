import type { ModelMessage, UserModelMessage } from 'ai'

type ResolvedAttachment = {
  kind: 'image' | 'file'
  fileName: string
  contentType: string
  url: string
}

type ConversationMessage = {
  role: 'user' | 'system'
  content: string
  attachments?: ResolvedAttachment[]
}

type UserPromptProfile = {
  preferredName?: string
  role?: string
  traits?: string[]
  bio?: string
}

const OPENROUTER_MODEL_IDS: Record<string, string> = {
  'claude-opus-4-6': 'anthropic/claude-opus-4.6',
  'claude-sonnet-4-6': 'anthropic/claude-sonnet-4.6',
  'claude-haiku-4-5': 'anthropic/claude-haiku-4.5',
  'gpt-5.4': 'openai/gpt-5.4',
  'gpt-4o': 'openai/gpt-4o',
  'gpt-oss-20b': 'openai/gpt-oss-20b',
  'gpt-oss-120b': 'openai/gpt-oss-120b',
  'gemini-2.5-pro': 'google/gemini-2.5-pro',
  'gemini-2.5-flash': 'google/gemini-2.5-flash',
  'llama-4-maverick': 'meta-llama/llama-4-maverick',
  'deepseek-r1': 'deepseek/deepseek-r1',
  'deepseek-v3': 'deepseek/deepseek-chat',
}

export function getOpenRouterModelId(modelId: string) {
  return OPENROUTER_MODEL_IDS[modelId] ?? modelId
}

function formatProfileLine(label: string, value?: string) {
  const trimmedValue = value?.trim()
  return trimmedValue ? `${label}: ${trimmedValue}` : null
}

export function buildSystemPrompt(profile?: UserPromptProfile) {
  const preferredName = profile?.preferredName?.trim()
  const role = profile?.role?.trim()
  const traits = (profile?.traits ?? [])
    .map((trait) => trait.trim())
    .filter(Boolean)
  const bio = profile?.bio?.trim()

  const lines = [
    'You are Based Chat, a capable, trustworthy, and adaptable AI assistant.',
    'Help the user efficiently while staying accurate, grounded, and genuinely useful.',
    '',
    'Core behavior:',
    '- Prioritize correctness, clarity, and practical usefulness.',
    "- Match the user's depth and pace. Be concise by default, and expand when the task benefits from detail.",
    '- If the request is ambiguous and the ambiguity matters, ask a short clarifying question. Otherwise make a reasonable assumption and continue.',
    '- Never fabricate facts, sources, actions taken, or certainty.',
    '- If you are unsure, say so briefly and explain what would make the answer more reliable.',
    '- Use structure when it improves readability, but avoid unnecessary verbosity.',
    '- For coding, analytical, or planning tasks, be concrete: explain the approach, note tradeoffs, and give the next useful step.',
    '- If the user asks who you are, what model you are, or what powers the chat, identify yourself as Based Chat and mention your current model name or version when known.',
    '',
    'Personalization rules:',
    '- Use the saved profile to tailor tone, examples, framing, and level of explanation.',
    '- Do not mention the profile unless it is relevant to the current request.',
    "- Treat profile details as preferences and context, not as higher-priority instructions than the user's current message.",
    '- Do not invent personal details beyond what is provided here.',
  ]

  const profileLines = [
    formatProfileLine('Preferred name', preferredName),
    formatProfileLine('Role or background', role),
    traits.length > 0 ? `Desired assistant traits: ${traits.join(', ')}` : null,
    formatProfileLine('Additional user context', bio),
  ].filter((line): line is string => line !== null)

  if (profileLines.length > 0) {
    lines.push('', 'Saved user profile:')
    lines.push(...profileLines)
    lines.push(
      '',
      "Apply this profile subtly. For example, adapt your tone to the requested assistant traits, use examples that fit the user's role or background, and keep the user's stated preferences in mind.",
    )
  }

  return lines.join('\n')
}

function toUserContentParts(message: ConversationMessage) {
  const contentParts: Exclude<UserModelMessage['content'], string> = []
  const trimmedContent = message.content.trim()

  if (trimmedContent) {
    contentParts.push({
      type: 'text',
      text: trimmedContent,
    })
  }

  for (const attachment of message.attachments ?? []) {
    if (
      attachment.kind === 'image' ||
      attachment.contentType.startsWith('image/')
    ) {
      contentParts.push({
        type: 'image',
        image: attachment.url,
        mediaType: attachment.contentType,
      })
      continue
    }

    contentParts.push({
      type: 'file',
      data: attachment.url,
      filename: attachment.fileName,
      mediaType: attachment.contentType,
    })
  }

  return contentParts
}

export function toModelMessages(
  messages: ConversationMessage[],
): ModelMessage[] {
  const modelMessages: ModelMessage[] = []

  for (const message of messages) {
    if (message.role === 'user') {
      const contentParts = toUserContentParts(message)

      if (contentParts.length === 0) {
        continue
      }

      modelMessages.push({
        role: 'user',
        content: contentParts,
      })
      continue
    }

    const trimmedContent = message.content.trim()
    if (!trimmedContent) {
      continue
    }

    modelMessages.push({
      role: 'assistant',
      content: trimmedContent,
    })
  }

  return modelMessages
}
