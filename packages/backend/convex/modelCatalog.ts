import { getStaticModelCatalog, type ModelCatalog } from '@based-chat/lib/models'
import { z } from 'zod'

import { action } from './_generated/server'
import { readSerializedRedisConfig } from './redisConfig'

const MODELS_KEY = 'models'
const PROVIDERS_KEY = 'providers'
const PROVIDER_ICON_IDS_KEY = 'providerIconIds'

const modelCapabilitySchema = z.union([
  z.literal('image'),
  z.literal('reasoning'),
  z.literal('pdf'),
  z.literal('image-gen'),
])

const modelPricingSchema = z.object({
  input: z.number(),
  output: z.number(),
})

const modelSchema = z.object({
  id: z.string(),
  name: z.string(),
  provider: z.string(),
  description: z.string(),
  pricing: modelPricingSchema,
  capabilities: z.array(modelCapabilitySchema),
  badge: z.string().optional(),
  isFavorite: z.boolean().optional(),
  isLegacy: z.boolean().optional(),
})

const providerSchema = z.object({
  id: z.string(),
  name: z.string(),
})

const providersSchema = z.array(providerSchema)
const modelsSchema = z.array(modelSchema)
const providerIconIdsSchema = z.record(z.string(), z.string())

export const get = action({
  args: {},
  handler: async (): Promise<ModelCatalog> => {
    const fallbackCatalog = getStaticModelCatalog()

    const [models, providers, providerIconIds] = await Promise.all([
      readSerializedRedisConfig({
        key: MODELS_KEY,
        schema: modelsSchema,
        fallback: fallbackCatalog.models,
      }),
      readSerializedRedisConfig({
        key: PROVIDERS_KEY,
        schema: providersSchema,
        fallback: fallbackCatalog.providers,
      }),
      readSerializedRedisConfig({
        key: PROVIDER_ICON_IDS_KEY,
        schema: providerIconIdsSchema,
        fallback: fallbackCatalog.providerIconIds,
      }),
    ])

    return {
      models,
      providers,
      providerIconIds,
    }
  },
})
