import { api } from "@based-chat/backend/convex/_generated/api";
import { createFileRoute, Navigate, useRouter } from "@tanstack/react-router";
import { useConvexAuth, useQuery } from "convex/react";
import { useEffect } from "react";

import Loader from "@/components/loader";
import SettingsPage from "@/components/settings/settings-page";
import {
  isSettingsTabId,
  type SettingsTabId,
} from "@/lib/settings-tabs";

export const Route = createFileRoute("/settings")({
  validateSearch: (search: Record<string, unknown>) => ({
    tab: isSettingsTabId(search.tab) ? search.tab : undefined,
  }),
  component: SettingsRouteComponent,
});

function SettingsRouteComponent() {
  const router = useRouter();
  const { isAuthenticated, isLoading } = useConvexAuth();
  const { tab } = Route.useSearch();
  const user = useQuery(
    api.auth.getCurrentUser,
    isAuthenticated ? {} : "skip",
  ) as
    | {
        name?: string | null;
        email?: string | null;
        role?: string | null;
        traits?: string[] | null;
        bio?: string | null;
      }
    | null
    | undefined;

  useEffect(() => {
    if (isLoading || !isAuthenticated || tab) {
      return;
    }

    router.navigate({
      to: "/settings",
      search: { tab: "profile" },
      replace: true,
    });
  }, [isAuthenticated, isLoading, router, tab]);

  if (isLoading || (isAuthenticated && user === undefined)) {
    return <Loader variant="shell" />;
  }

  if (!isAuthenticated || !user) {
    return <Navigate to="/sign-in" />;
  }

  return (
    <SettingsPage
      user={user}
      activeTab={tab ?? "profile"}
      onTabChange={(nextTab: SettingsTabId) =>
        router.navigate({
          to: "/settings",
          search: { tab: nextTab },
        })
      }
    />
  );
}
