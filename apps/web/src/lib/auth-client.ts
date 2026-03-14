import { env } from "@based-chat/env/web";
import { convexClient, crossDomainClient } from "@convex-dev/better-auth/client/plugins";
import { createAuthClient } from "better-auth/react";

export const authClient = createAuthClient({
  baseURL: env.VITE_CONVEX_SITE_URL,
  plugins: [crossDomainClient(), convexClient()],
});
