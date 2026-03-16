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
  'claude-opus-4-5': 'anthropic/claude-opus-4.5',
  'claude-sonnet-4-5': 'anthropic/claude-sonnet-4.5',
  'claude-4-sonnet': 'anthropic/claude-sonnet-4',
  'gpt-5.4': 'openai/gpt-5.4',
  'gpt-5-4': 'openai/gpt-5.4',
  'gpt-5-4-pro': 'openai/gpt-5.4-pro',
  'gpt-oss-20b': 'openai/gpt-oss-20b',
  'gpt-oss-120b': 'openai/gpt-oss-120b',
  'gpt-4o-mini': 'openai/gpt-4o-mini',
  'gpt-4-1': 'openai/gpt-4.1',
  'gpt-4-1-mini': 'openai/gpt-4.1-mini',
  'gpt-4-1-nano': 'openai/gpt-4.1-nano',
  'gpt-5': 'openai/gpt-5',
  'gpt-5-mini': 'openai/gpt-5-mini',
  'gpt-5-nano': 'openai/gpt-5-nano',
  'gpt-5-1': 'openai/gpt-5.1',
  'gpt-5-2': 'openai/gpt-5.2',
  'gpt-5-3-instant': 'openai/gpt-5.3-chat',
  'o3-mini': 'openai/o3-mini',
  'o4-mini': 'openai/o4-mini',
  'o3': 'openai/o3',
  'gpt-imagegen': 'openai/gpt-5-image',
  'gpt-imagegen-1-5': 'openai/gpt-5-image-mini',
  'gpt-4o': 'openai/gpt-4o',
  'gemini-2.5-pro': 'google/gemini-2.5-pro',
  'gemini-2.5-flash': 'google/gemini-2.5-flash',
  'gemini-2-5-pro': 'google/gemini-2.5-pro',
  'gemini-2-5-flash': 'google/gemini-2.5-flash',
  'gemini-2-5-flash-lite': 'google/gemini-2.5-flash-lite',
  'gemini-2-0-flash': 'google/gemini-2.0-flash-001',
  'gemini-2-0-flash-lite': 'google/gemini-2.0-flash-lite-001',
  'gemini-3-flash': 'google/gemini-3-flash-preview',
  'gemini-3-pro': 'google/gemini-3-pro-preview',
  'nano-banana-pro': 'google/gemini-3-pro-image-preview',
  'nano-banana': 'google/gemini-2.5-flash-image',
  'gemini-3-1-pro-preview': 'google/gemini-3.1-pro-preview',
  'gemini-3-1-flash-lite': 'google/gemini-3.1-flash-lite-preview',
  'gemini-3-1-flash-lite-preview': 'google/gemini-3.1-flash-lite-preview',
  'llama-4-scout': 'meta-llama/llama-4-scout',
  'llama-4-maverick': 'meta-llama/llama-4-maverick',
  'llama-3-3-70b': 'meta-llama/llama-3.3-70b-instruct',
  'deepseek-r1': 'deepseek/deepseek-r1',
  'deepseek-v3': 'deepseek/deepseek-chat',
  'deepseek-v3-2': 'deepseek/deepseek-v3.2',
  'deepseek-r1-0528': 'deepseek/deepseek-r1-0528',
  'deepseek-v3-1': 'deepseek/deepseek-chat-v3.1',
  'deepseek-v3-0324': 'deepseek/deepseek-chat-v3-0324',
  'grok-4-20-beta': 'x-ai/grok-4.20-beta',
  'grok-4-1-fast': 'x-ai/grok-4.1-fast',
  'grok-4-fast': 'x-ai/grok-4-fast',
  'grok-4': 'x-ai/grok-4',
  'grok-3': 'x-ai/grok-3',
  'grok-3-mini': 'x-ai/grok-3-mini',
  'grok-4-20-multi-agent-beta': 'x-ai/grok-4.20-multi-agent-beta',
  'qwen-3-235b': 'qwen/qwen3-235b-a22b',
  'qwen-3-coder': 'qwen/qwen3-coder',
  'qwen-3-32b': 'qwen/qwen3-32b',
  'qwen-2-5-vl-32b': 'qwen/qwen2.5-vl-32b-instruct',
  'qwen-3-5-397b-a17b': 'qwen/qwen3.5-397b-a17b',
  'qwen-3-5-flash': 'qwen/qwen3.5-flash-02-23',
  'kimi-k2-0905': 'moonshotai/kimi-k2-0905',
  'kimi-k2-5': 'moonshotai/kimi-k2.5',
  'kimi-k2-0711': 'moonshotai/kimi-k2',
  'glm-5': 'z-ai/glm-5',
  'glm-4-6v': 'z-ai/glm-4.6v',
  'glm-4-7': 'z-ai/glm-4.7',
  'glm-4-6': 'z-ai/glm-4.6',
  'glm-4-5v': 'z-ai/glm-4.5v',
  'glm-4-5-air': 'z-ai/glm-4.5-air',
  'glm-4-5': 'z-ai/glm-4.5',
  'glm-5-turbo': 'z-ai/glm-5-turbo',
  'minimax-m2-5': 'minimax/minimax-m2.5',
  'minimax-m2-1': 'minimax/minimax-m2.1',
  'minimax-m2': 'minimax/minimax-m2',
  'healer-alpha': 'openrouter/healer-alpha',
  'hunter-alpha': 'openrouter/hunter-alpha',
}

const OPENROUTER_WEB_SEARCH_PROVIDER_OPTIONS = {
  openrouter: {
    plugins: [{ id: 'web' as const }],
  },
} as const

export function getOpenRouterModelId(modelId: string) {
  return OPENROUTER_MODEL_IDS[modelId] ?? modelId
}

export function getOpenRouterChatProviderOptions({
  webSearchEnabled = false,
  webSearchMaxResults = 1,
}: {
  webSearchEnabled?: boolean
  webSearchMaxResults?: number
} = {}) {
  return webSearchEnabled
    ? {
        openrouter: {
          plugins: [
            {
              ...OPENROUTER_WEB_SEARCH_PROVIDER_OPTIONS.openrouter.plugins[0],
              max_results: webSearchMaxResults,
            },
          ],
        },
      }
    : undefined
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
    '- When web search is enabled and the user asks for current, recent, or fast-changing information, use it before answering instead of relying on memory.',
    '- When web search informs the answer, cite the source or URL inline when practical.',
    '- Use structure when it improves readability, but avoid unnecessary verbosity.',
    '- For coding, analytical, or planning tasks, be concrete: explain the approach, note tradeoffs, and give the next useful step.',
    '- If the user asks who you are, what model you are, or what powers the chat, identify yourself as Based Chat and mention your current model name or version when known.',
    '',
    'Personalization rules:',
    '- Use the saved profile to tailor tone, examples, framing, and level of explanation.',
    "- Do not overuse the user's preferred name. Use it sparingly and only when it feels natural or helpful.",
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
