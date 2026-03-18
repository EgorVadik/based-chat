import { createEnv } from "@t3-oss/env-core";
import { z } from "zod";

export const env = createEnv({
  clientPrefix: "EXPO_PUBLIC_",
  client: {
    EXPO_PUBLIC_CONVEX_URL: z.url(),
    EXPO_PUBLIC_CONVEX_SITE_URL: z.url(),
    EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID: z.string(),
  },
  runtimeEnv: process.env,
  emptyStringAsUndefined: true,
});
