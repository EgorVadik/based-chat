export type ModelCapability = "vision" | "tools" | "reasoning" | "image-gen";

export type ModelPricing = "$" | "$$" | "$$$" | "$$$$";

export type Model = {
  id: string;
  name: string;
  provider: string;
  description: string;
  pricing: ModelPricing;
  capabilities: ModelCapability[];
  badge?: string;
  isFavorite?: boolean;
};

export const PROVIDERS = [
  { id: "Anthropic", name: "Anthropic" },
  { id: "OpenAI", name: "OpenAI" },
  { id: "Google", name: "Google" },
  { id: "Meta", name: "Meta" },
  { id: "DeepSeek", name: "DeepSeek" },
] as const;

export const MODELS: Model[] = [
  {
    id: "claude-opus-4-6",
    name: "Claude Opus 4.6",
    provider: "Anthropic",
    description: "The pinnacle of Claude intelligence",
    pricing: "$$$$",
    capabilities: ["vision", "tools", "reasoning"],
    badge: "NEW",
    isFavorite: true,
  },
  {
    id: "claude-sonnet-4-6",
    name: "Claude Sonnet 4.6",
    provider: "Anthropic",
    description: "Anthropic's latest Sonnet for real-world work",
    pricing: "$$$",
    capabilities: ["vision", "tools", "reasoning"],
    isFavorite: true,
  },
  {
    id: "claude-haiku-4-5",
    name: "Claude Haiku 4.5",
    provider: "Anthropic",
    description: "Fast and affordable for everyday tasks",
    pricing: "$",
    capabilities: ["vision", "tools"],
  },
  {
    id: "gpt-5.4",
    name: "GPT-5.4",
    provider: "OpenAI",
    description: "OpenAI's latest fast model for everyday chat",
    pricing: "$$$",
    capabilities: ["vision", "tools", "reasoning"],
    isFavorite: true,
  },
  {
    id: "gpt-4o",
    name: "GPT-4o",
    provider: "OpenAI",
    description: "Versatile multimodal model",
    pricing: "$$",
    capabilities: ["vision", "tools"],
  },
  {
    id: "gemini-2.5-pro",
    name: "Gemini 2.5 Pro",
    provider: "Google",
    description: "Google's most capable model",
    pricing: "$$$",
    capabilities: ["vision", "tools", "reasoning"],
  },
  {
    id: "gemini-2.5-flash",
    name: "Gemini 2.5 Flash",
    provider: "Google",
    description: "Lightning-fast with surprising capability",
    pricing: "$",
    capabilities: ["vision", "tools", "reasoning"],
  },
  {
    id: "llama-4-maverick",
    name: "Llama 4 Maverick",
    provider: "Meta",
    description: "Meta's open-weight frontier model",
    pricing: "$$",
    capabilities: ["vision", "tools"],
  },
  {
    id: "deepseek-r1",
    name: "DeepSeek R1",
    provider: "DeepSeek",
    description: "Advanced reasoning specialist",
    pricing: "$",
    capabilities: ["reasoning"],
  },
];

export const DEFAULT_MODEL = MODELS[0]!;

export function getModelById(modelId: string) {
  return MODELS.find((model) => model.id === modelId);
}
