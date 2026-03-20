import {
  getModelCatalogSnapshot,
  subscribeToModelCatalog,
} from '@based-chat/lib/models'
import { useSyncExternalStore } from 'react'

// Re-export all model types, data, and helpers from the shared package
export {
  type ModelCatalog,
  type ModelCatalogSnapshot,
  type Model,
  type ModelCapability,
  type ModelPricing,
  type Provider,
  PROVIDERS,
  MODELS,
  DEFAULT_MODEL,
  LOBE_ICON_CDN_BASE,
  PROVIDER_ICON_IDS,
  getProviderIconUrl,
  formatUsdPerMillionTokens,
  formatModelPricing,
  modelSupportsImageUploads,
  modelSupportsFileAttachments,
  modelSupportsImageGeneration,
  modelCanAcceptAttachments,
  getModelAttachmentInputAccept,
  modelSupportsAttachment,
  modelSupportsAttachments,
  getModelById,
  applyModelCatalog,
  getModelCatalogSnapshot,
  getStaticModelCatalog,
  resetModelCatalog,
  subscribeToModelCatalog,
} from '@based-chat/lib/models'

export function useModelCatalog() {
  return useSyncExternalStore(
    subscribeToModelCatalog,
    getModelCatalogSnapshot,
    getModelCatalogSnapshot,
  )
}
