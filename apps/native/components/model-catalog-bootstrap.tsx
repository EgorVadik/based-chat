import { api } from '@based-chat/backend/convex/_generated/api'
import { useAction } from 'convex/react'
import { type PropsWithChildren, useEffect, useRef } from 'react'

import { applyModelCatalog } from '@/lib/models'

const modelCatalogApi = api.modelCatalog as unknown as {
  get: any
}

export default function ModelCatalogBootstrap({
  children,
}: PropsWithChildren) {
  const loadModelCatalog = useAction(modelCatalogApi.get)
  const hasLoadedRef = useRef(false)

  useEffect(() => {
    if (hasLoadedRef.current) {
      return
    }

    hasLoadedRef.current = true

    let cancelled = false

    void (async () => {
      try {
        const catalog = await loadModelCatalog({})

        if (!cancelled) {
          applyModelCatalog(catalog)
        }
      } catch (error) {
        console.error('Failed to load the model catalog.', error)
      }
    })()

    return () => {
      cancelled = true
    }
  }, [loadModelCatalog])

  return <>{children}</>
}
