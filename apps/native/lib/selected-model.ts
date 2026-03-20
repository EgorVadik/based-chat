import { useCallback, useMemo } from 'react'
import { useMMKVString } from 'react-native-mmkv'

import { appStorage } from '@/lib/mmkv'
import { getModelById, useModelCatalog, type Model } from '@/lib/models'

const SELECTED_MODEL_ID_KEY = 'based-chat:selected-model-id'

export function useSelectedModel() {
  const { defaultModel, version } = useModelCatalog()
  const [storedModelId, setStoredModelId] = useMMKVString(
    SELECTED_MODEL_ID_KEY,
    appStorage,
  )

  const model = useMemo(
    () => getModelById(storedModelId ?? '') ?? defaultModel,
    [defaultModel, storedModelId, version],
  )

  const setModel = useCallback(
    (nextModel: Model) => {
      setStoredModelId(nextModel.id)
    },
    [setStoredModelId],
  )

  return { model, setModel }
}
