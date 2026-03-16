import type {
  ComposerAttachment,
  DraftAttachment,
  MessageAttachment,
} from "./attachments";

export type ModelCapability = "image" | "reasoning" | "pdf" | "image-gen";

export type ModelPricing = {
  input: number;
  output: number;
};

export type Model = {
  id: string;
  name: string;
  provider: string;
  description: string;
  pricing: ModelPricing;
  capabilities: ModelCapability[];
  badge?: string;
  isFavorite?: boolean;
  isLegacy?: boolean;
};

export const PROVIDERS = [
  { id: "Anthropic", name: "Anthropic" },
  { id: "OpenAI", name: "OpenAI" },
  { id: "Google", name: "Google" },
  { id: "Meta", name: "Meta" },
  { id: "DeepSeek", name: "DeepSeek" },
  { id: "xAI", name: "xAI" },
  { id: "Qwen", name: "Qwen" },
  { id: "Moonshot", name: "Moonshot" },
  { id: "Z.ai", name: "Z.ai" },
  { id: "MiniMax", name: "MiniMax" },
  { id: "Stealth", name: "Stealth" },
] as const;

export const MODELS: Model[] = [
  {
    id: "claude-sonnet-4-6",
    name: "Claude Sonnet 4.6",
    provider: "Anthropic",
    description: "Balanced frontier Claude for coding, agents, and professional work",
    pricing: { input: 3, output: 15 },
    capabilities: ["image", "reasoning", "pdf"],
    isFavorite: true,
  },
  {
    id: "claude-opus-4-6",
    name: "Claude Opus 4.6",
    provider: "Anthropic",
    description: "Anthropic's strongest model for long-running coding and knowledge work",
    pricing: { input: 5, output: 25 },
    capabilities: ["image", "reasoning", "pdf"],
  },
  {
    id: "claude-haiku-4-5",
    name: "Claude Haiku 4.5",
    provider: "Anthropic",
    description: "Fast, efficient Claude tier for real-time reasoning and agent tasks",
    pricing: { input: 1, output: 5 },
    capabilities: ["image", "reasoning", "pdf"],
  },
  {
    id: "claude-opus-4-5",
    name: "Claude Opus 4.5",
    provider: "Anthropic",
    description: "The pinnacle of Claude intelligence",
    pricing: { input: 5, output: 25 },
    capabilities: ["image", "reasoning", "pdf"],
    isLegacy: true,
  },
  {
    id: "claude-sonnet-4-5",
    name: "Claude Sonnet 4.5",
    provider: "Anthropic",
    description: "Anthropic's most advanced Sonnet yet",
    pricing: { input: 3, output: 15 },
    capabilities: ["image", "reasoning", "pdf"],
    isLegacy: true,
  },
  {
    id: "claude-4-sonnet",
    name: "Claude 4 Sonnet",
    provider: "Anthropic",
    description: "The sweet spot of capability and efficiency",
    pricing: { input: 3, output: 15 },
    capabilities: ["image", "reasoning", "pdf"],
    isLegacy: true,
  },
  {
    id: "gpt-5-4",
    name: "GPT 5.4",
    provider: "OpenAI",
    description: "OpenAI's latest default frontier model for coding, reasoning, and multimodal chat",
    pricing: { input: 2.5, output: 15 },
    capabilities: ["image", "reasoning", "pdf"],
    badge: "NEW",
    isFavorite: true,
  },
  {
    id: "gpt-5-3-instant",
    name: "GPT 5.3 Instant",
    provider: "OpenAI",
    description: "Fast GPT-5.3 chat tier with image and PDF support",
    pricing: { input: 1.75, output: 14 },
    capabilities: ["image", "pdf"],
  },
  {
    id: "gpt-5-mini",
    name: "GPT 5 mini",
    provider: "OpenAI",
    description: "Cheaper GPT-5 tier for everyday multimodal tasks",
    pricing: { input: 0.25, output: 2 },
    capabilities: ["image", "reasoning", "pdf"],
  },
  {
    id: "gpt-oss-20b",
    name: "GPT OSS 20B",
    provider: "OpenAI",
    description: "Open-weight reasoning model optimized for low-cost local-style usage",
    pricing: { input: 0.03, output: 0.14 },
    capabilities: ["reasoning"],
  },
  {
    id: "gpt-oss-120b",
    name: "GPT OSS 120B",
    provider: "OpenAI",
    description: "Larger open-weight OpenAI reasoning model with stronger quality than 20B",
    pricing: { input: 0.04, output: 0.19 },
    capabilities: ["reasoning"],
  },
  {
    id: "gpt-imagegen-1-5",
    name: "GPT ImageGen 1.5",
    provider: "OpenAI",
    description: "Lower-cost image generation tier",
    pricing: { input: 2.5, output: 2 },
    capabilities: ["image", "image-gen", "pdf"],
  },
  {
    id: "gpt-5-2",
    name: "GPT 5.2",
    provider: "OpenAI",
    description: "Updated GPT-5 line with better reasoning and tool use",
    pricing: { input: 1.75, output: 14 },
    capabilities: ["image", "reasoning", "pdf"],
    isLegacy: true,
  },
  {
    id: "gpt-5-1",
    name: "GPT 5.1",
    provider: "OpenAI",
    description: "Earlier GPT-5 generation with multimodal reasoning and PDF support",
    pricing: { input: 1.25, output: 10 },
    capabilities: ["image", "reasoning", "pdf"],
    isLegacy: true,
  },
  {
    id: "gpt-5",
    name: "GPT 5",
    provider: "OpenAI",
    description: "Core GPT-5 model for multimodal reasoning and general-purpose use",
    pricing: { input: 1.25, output: 10 },
    capabilities: ["image", "reasoning", "pdf"],
    isFavorite: true,
    isLegacy: true,
  },
  {
    id: "gpt-5-nano",
    name: "GPT 5 nano",
    provider: "OpenAI",
    description: "Smallest GPT-5 tier with image, reasoning, and file support",
    pricing: { input: 0.05, output: 0.4 },
    capabilities: ["image", "reasoning", "pdf"],
    isLegacy: true,
  },
  {
    id: "o4-mini",
    name: "o4 mini",
    provider: "OpenAI",
    description: "Reasoning-capable multimodal mini model with file support",
    pricing: { input: 1.1, output: 4.4 },
    capabilities: ["image", "reasoning", "pdf"],
    isLegacy: true,
  },
  {
    id: "o3",
    name: "o3",
    provider: "OpenAI",
    description: "High-end reasoning model with image and PDF support",
    pricing: { input: 2, output: 8 },
    capabilities: ["image", "reasoning", "pdf"],
    isLegacy: true,
  },
  {
    id: "o3-mini",
    name: "o3 mini",
    provider: "OpenAI",
    description: "Compact reasoning-first model",
    pricing: { input: 1.1, output: 4.4 },
    capabilities: ["reasoning"],
    isLegacy: true,
  },
  {
    id: "gpt-4-1",
    name: "GPT 4.1",
    provider: "OpenAI",
    description: "Reliable multimodal GPT-4.1 tier for production assistants",
    pricing: { input: 2, output: 8 },
    capabilities: ["image", "pdf"],
    isLegacy: true,
  },
  {
    id: "gpt-4-1-mini",
    name: "GPT 4.1 Mini",
    provider: "OpenAI",
    description: "Smaller GPT-4.1 variant for lightweight multimodal tasks",
    pricing: { input: 0.4, output: 1.6 },
    capabilities: ["image", "pdf"],
    isLegacy: true,
  },
  {
    id: "gpt-4-1-nano",
    name: "GPT 4.1 Nano",
    provider: "OpenAI",
    description: "Lowest-cost GPT-4.1 tier for simple multimodal workloads",
    pricing: { input: 0.1, output: 0.4 },
    capabilities: ["image", "pdf"],
    isLegacy: true,
  },
  {
    id: "gpt-4o-mini",
    name: "GPT 4o-mini",
    provider: "OpenAI",
    description: "Fast, low-cost multimodal general model",
    pricing: { input: 0.15, output: 0.6 },
    capabilities: ["image", "pdf"],
    isLegacy: true,
  },
  {
    id: "gpt-imagegen",
    name: "GPT ImageGen",
    provider: "OpenAI",
    description: "OpenAI's image generation model with text, image, and file inputs",
    pricing: { input: 10, output: 10 },
    capabilities: ["image", "image-gen", "pdf"],
    isLegacy: true,
  },
  {
    id: "gemini-3-1-pro-preview",
    name: "Gemini 3.1 Pro",
    provider: "Google",
    description: "Google's newest flagship with advanced reasoning",
    pricing: { input: 2, output: 12 },
    capabilities: ["image", "reasoning", "pdf"],
  },
  {
    id: "gemini-3-1-flash-lite",
    name: "Gemini 3.1 Flash Lite",
    provider: "Google",
    description: "Fast, low-latency Gemini 3.1 for everyday workloads",
    pricing: { input: 0.25, output: 1.5 },
    capabilities: ["image", "reasoning", "pdf"],
  },
  {
    id: "gemini-3-flash",
    name: "Gemini 3 Flash",
    provider: "Google",
    description: "Lightning-fast with surprising capability",
    pricing: { input: 0.5, output: 3 },
    capabilities: ["image", "reasoning", "pdf"],
    isFavorite: true,
  },
  {
    id: "nano-banana-pro",
    name: "Nano Banana Pro",
    provider: "Google",
    description: "Higher fidelity image generation built on Gemini 3 Pro",
    pricing: { input: 2, output: 12 },
    capabilities: ["image", "image-gen"],
    isFavorite: true,
  },
  {
    id: "nano-banana",
    name: "Nano Banana",
    provider: "Google",
    description: "Fast image generation, f.k.a. Gemini 2.5 Flash Image",
    pricing: { input: 0.3, output: 2.5 },
    capabilities: ["image", "image-gen"],
  },
  {
    id: "gemini-3-pro",
    name: "Gemini 3 Pro",
    provider: "Google",
    description: "Google's previous flagship with advanced reasoning",
    pricing: { input: 2, output: 12 },
    capabilities: ["image", "reasoning", "pdf"],
    isLegacy: true,
  },
  {
    id: "gemini-2-5-pro",
    name: "Gemini 2.5 Pro",
    provider: "Google",
    description: "Google's flagship for complex reasoning",
    pricing: { input: 1.25, output: 10 },
    capabilities: ["image", "reasoning", "pdf"],
    isLegacy: true,
  },
  {
    id: "gemini-2-5-flash",
    name: "Gemini 2.5 Flash",
    provider: "Google",
    description: "Upgraded speed with enhanced capabilities",
    pricing: { input: 0.3, output: 2.5 },
    capabilities: ["image", "reasoning", "pdf"],
    isLegacy: true,
  },
  {
    id: "gemini-2-5-flash-lite",
    name: "Gemini 2.5 Flash Lite",
    provider: "Google",
    description: "Google's most cost-efficient Flash model",
    pricing: { input: 0.1, output: 0.4 },
    capabilities: ["image", "reasoning", "pdf"],
    isLegacy: true,
  },
  {
    id: "gemini-2-0-flash",
    name: "Gemini 2.0 Flash",
    provider: "Google",
    description: "Google's speedy all-rounder with massive context",
    pricing: { input: 0.1, output: 0.4 },
    capabilities: ["image", "pdf"],
    isLegacy: true,
  },
  {
    id: "gemini-2-0-flash-lite",
    name: "Gemini 2.0 Flash Lite",
    provider: "Google",
    description: "Faster, less precise Gemini model",
    pricing: { input: 0.08, output: 0.3 },
    capabilities: ["image", "pdf"],
    isLegacy: true,
  },
  {
    id: "grok-4-20-beta",
    name: "Grok 4.20 Beta",
    provider: "xAI",
    description: "xAI's beta flagship with optional reasoning",
    pricing: { input: 2, output: 6 },
    capabilities: ["image", "reasoning"],
    badge: "NEW",
  },
  {
    id: "grok-4-1-fast",
    name: "Grok 4.1 Fast",
    provider: "xAI",
    description: "Faster and cheaper version of Grok v4.1",
    pricing: { input: 0.2, output: 0.5 },
    capabilities: ["image", "reasoning"],
  },
  {
    id: "grok-4",
    name: "Grok 4",
    provider: "xAI",
    description: "xAI's latest and greatest model",
    pricing: { input: 3, output: 15 },
    capabilities: ["image", "reasoning"],
    isLegacy: true,
  },
  {
    id: "grok-4-fast",
    name: "Grok 4 Fast",
    provider: "xAI",
    description: "Faster and cheaper version of Grok v4",
    pricing: { input: 0.2, output: 0.5 },
    capabilities: ["image", "reasoning"],
    isLegacy: true,
  },
  {
    id: "grok-3",
    name: "Grok 3",
    provider: "xAI",
    description: "xAI's last-gen model that doesn't think and costs too much",
    pricing: { input: 3, output: 15 },
    capabilities: [],
    isLegacy: true,
  },
  {
    id: "grok-3-mini",
    name: "Grok 3 Mini",
    provider: "xAI",
    description: "xAI's last-gen model that thinks for cheap",
    pricing: { input: 0.3, output: 0.5 },
    capabilities: ["reasoning"],
    isLegacy: true,
  },
  {
    id: "llama-4-scout",
    name: "Llama 4 Scout",
    provider: "Meta",
    description: "Efficient multimodal explorer",
    pricing: { input: 0.08, output: 0.3 },
    capabilities: ["image"],
  },
  {
    id: "llama-4-maverick",
    name: "Llama 4 Maverick",
    provider: "Meta",
    description: "The capable conversationalist",
    pricing: { input: 0.15, output: 0.6 },
    capabilities: ["image"],
  },
  {
    id: "llama-3-3-70b",
    name: "Llama 3.3 70B",
    provider: "Meta",
    description: "The speed demon of open models",
    pricing: { input: 0.1, output: 0.32 },
    capabilities: [],
    isLegacy: true,
  },
  {
    id: "deepseek-v3-2",
    name: "DeepSeek V3.2",
    provider: "DeepSeek",
    description: "Latest DeepSeek release with low-cost reasoning and agentic performance",
    pricing: { input: 0.26, output: 0.38 },
    capabilities: ["reasoning"],
  },
  {
    id: "deepseek-v3-1",
    name: "DeepSeek V3.1",
    provider: "DeepSeek",
    description: "Previous DeepSeek chat model",
    pricing: { input: 0.15, output: 0.75 },
    capabilities: ["reasoning"],
    isLegacy: true,
  },
  {
    id: "deepseek-v3-0324",
    name: "DeepSeek V3 0324",
    provider: "DeepSeek",
    description: "Earlier DeepSeek V3 checkpoint",
    pricing: { input: 0.2, output: 0.77 },
    capabilities: ["reasoning"],
    isLegacy: true,
  },
  {
    id: "deepseek-r1-0528",
    name: "DeepSeek R1 0528",
    provider: "DeepSeek",
    description: "Older R1 reasoning release",
    pricing: { input: 0.45, output: 2.15 },
    capabilities: ["reasoning"],
    isLegacy: true,
  },
  {
    id: "deepseek-r1",
    name: "DeepSeek R1",
    provider: "DeepSeek",
    description: "Original DeepSeek reasoning release",
    pricing: { input: 0.7, output: 2.5 },
    capabilities: ["reasoning"],
    isLegacy: true,
  },
  {
    id: "qwen-3-235b",
    name: "Qwen 3 235B",
    provider: "Qwen",
    description: "Massive open model for general intelligence",
    pricing: { input: 0.46, output: 1.82 },
    capabilities: ["reasoning"],
  },
  {
    id: "qwen-3-coder",
    name: "Qwen 3 Coder",
    provider: "Qwen",
    description: "Alibaba's coding champion",
    pricing: { input: 0.22, output: 1 },
    capabilities: [],
    isLegacy: true,
  },
  {
    id: "qwen-3-32b",
    name: "Qwen 3 32B",
    provider: "Qwen",
    description: "Alibaba's smart all-rounder with dynamic thinking",
    pricing: { input: 0.08, output: 0.24 },
    capabilities: ["reasoning"],
    isLegacy: true,
  },
  {
    id: "qwen-2-5-vl-32b",
    name: "Qwen 2.5 32B",
    provider: "Qwen",
    description: "Versatile open model with image understanding",
    pricing: { input: 0.2, output: 0.6 },
    capabilities: ["image"],
    isLegacy: true,
  },
  {
    id: "kimi-k2-0905",
    name: "Kimi K2 (0905)",
    provider: "Moonshot",
    description: "Enhanced version with longer context",
    pricing: { input: 0.4, output: 2 },
    capabilities: ["reasoning"],
    isFavorite: true,
  },
  {
    id: "kimi-k2-5",
    name: "Kimi K2.5",
    provider: "Moonshot",
    description: "Native multimodal with visual coding",
    pricing: { input: 0.45, output: 2.2 },
    capabilities: ["image", "reasoning"],
  },
  {
    id: "kimi-k2-0711",
    name: "Kimi K2 (0711)",
    provider: "Moonshot",
    description: "China's open-source capability champion",
    pricing: { input: 0.55, output: 2.2 },
    capabilities: [],
    isLegacy: true,
  },
  {
    id: "glm-5",
    name: "GLM 5",
    provider: "Z.ai",
    description: "Flagship model with enhanced programming and stable reasoning",
    pricing: { input: 0.72, output: 2.3 },
    capabilities: ["reasoning"],
  },
  {
    id: "glm-4-6v",
    name: "GLM 4.6V",
    provider: "Z.ai",
    description: "Multimodal model for visual understanding, documents, and charts",
    pricing: { input: 0.3, output: 0.9 },
    capabilities: ["image", "pdf"],
  },
  {
    id: "glm-4-7",
    name: "GLM 4.7",
    provider: "Z.ai",
    description: "Flagship model with enhanced programming and stable reasoning",
    pricing: { input: 0.38, output: 1.98 },
    capabilities: ["reasoning"],
    isLegacy: true,
  },
  {
    id: "glm-4-6",
    name: "GLM 4.6",
    provider: "Z.ai",
    description: "MoE model with superior coding capabilities",
    pricing: { input: 0.39, output: 1.9 },
    capabilities: ["reasoning"],
    isLegacy: true,
  },
  {
    id: "glm-4-5v",
    name: "GLM 4.5V",
    provider: "Z.ai",
    description: "Multimodal MoE model for visual understanding and complex tasks",
    pricing: { input: 0.6, output: 1.8 },
    capabilities: ["image", "reasoning"],
    isLegacy: true,
  },
  {
    id: "glm-4-5-air",
    name: "GLM 4.5 Air",
    provider: "Z.ai",
    description: "Lightweight variant optimized for coding",
    pricing: { input: 0.13, output: 0.85 },
    capabilities: ["reasoning"],
    isLegacy: true,
  },
  {
    id: "glm-4-5",
    name: "GLM 4.5",
    provider: "Z.ai",
    description: "Previous flagship coding and reasoning model",
    pricing: { input: 0.6, output: 2.2 },
    capabilities: ["reasoning"],
    isLegacy: true,
  },
  {
    id: "minimax-m2-5",
    name: "MiniMax M2.5",
    provider: "MiniMax",
    description: "High-efficiency model optimized for coding and productivity",
    pricing: { input: 0.25, output: 1.2 },
    capabilities: ["reasoning"],
  },
  {
    id: "minimax-m2-1",
    name: "MiniMax M2.1",
    provider: "MiniMax",
    description: "Lightweight model optimized for coding and agentic workflows",
    pricing: { input: 0.27, output: 0.95 },
    capabilities: ["reasoning"],
  },
  {
    id: "minimax-m2",
    name: "MiniMax M2",
    provider: "MiniMax",
    description: "The efficiency champion for coding",
    pricing: { input: 0.26, output: 1 },
    capabilities: ["reasoning"],
    isLegacy: true,
  },
  {
    id: "hunter-alpha",
    name: "Hunter Alpha",
    provider: "Stealth",
    description: "Stealth model optimized for coding and agents",
    pricing: { input: 0, output: 0 },
    capabilities: [],
    badge: "NEW",
  },
  {
    id: "healer-alpha",
    name: "Healer Alpha",
    provider: "Stealth",
    description: "Stealth model for balanced reasoning and reliability",
    pricing: { input: 0, output: 0 },
    capabilities: ["image", "reasoning"],
    badge: "NEW",
  },
];

export const DEFAULT_MODEL = MODELS[0]!;

export function formatUsdPerMillionTokens(amount: number) {
  return `$${new Intl.NumberFormat("en-US", {
    maximumFractionDigits: 2,
  }).format(amount)}/M`;
}

export function formatModelPricing(pricing: ModelPricing) {
  return `In ${formatUsdPerMillionTokens(pricing.input)} · Out ${formatUsdPerMillionTokens(pricing.output)}`;
}

type AttachmentLike = ComposerAttachment | DraftAttachment | MessageAttachment;

export function modelSupportsImageUploads(model: Model) {
  return model.capabilities.includes("image");
}

export function modelSupportsFileAttachments(model: Model) {
  return model.capabilities.includes("pdf");
}

export function modelSupportsImageGeneration(model: Model) {
  return model.capabilities.includes("image-gen");
}

export function modelCanAcceptAttachments(model: Model) {
  return modelSupportsImageUploads(model) || modelSupportsFileAttachments(model);
}

export function getModelAttachmentInputAccept(model: Model) {
  const supportsImages = modelSupportsImageUploads(model);
  const supportsFiles = modelSupportsFileAttachments(model);

  if (supportsImages && supportsFiles) {
    return undefined;
  }

  if (supportsImages) {
    return "image/*";
  }

  if (supportsFiles) {
    return ".pdf,.txt,.md,.json,.csv,.xml,.yaml,.yml,.js,.jsx,.ts,.tsx,.py,.html,.css,.sql";
  }

  return undefined;
}

export function modelSupportsAttachment(
  model: Model,
  attachment: Pick<AttachmentLike, "kind">,
) {
  if (attachment.kind === "image") {
    return modelSupportsImageUploads(model);
  }

  return modelSupportsFileAttachments(model);
}

export function modelSupportsAttachments(
  model: Model,
  attachments: Array<Pick<AttachmentLike, "kind">>,
) {
  return attachments.every((attachment) =>
    modelSupportsAttachment(model, attachment),
  );
}

export function getModelById(modelId: string) {
  return MODELS.find((model) => model.id === modelId);
}
