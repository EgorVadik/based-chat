import { createEnv } from '@t3-oss/env-core'
import { z } from 'zod'

export const env = createEnv({
  clientPrefix: 'EXPO_PUBLIC_',
  client: {
    EXPO_PUBLIC_CONVEX_URL: z.url().optional(),
    EXPO_PUBLIC_CONVEX_SITE_URL: z.url().optional(),
    EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID: z.string().optional(),
  },
  runtimeEnv: process.env,
  // emptyStringAsUndefined: true,
})
