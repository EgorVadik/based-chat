import { SidebarInset, SidebarProvider } from "@based-chat/ui/components/sidebar";
import { Navigate, createFileRoute } from "@tanstack/react-router";
import { useConvexAuth, useQuery } from "convex/react";
import { useCallback, useState } from "react";
import AppSidebar from "@/components/chat/app-sidebar";
import ChatArea from "@/components/chat/chat-area";
import Loader from "@/components/loader";
import { api } from "@based-chat/backend/convex/_generated/api";
import { CONVERSATIONS, MODELS, type Model } from "@/lib/fake-data";

export const Route = createFileRoute("/")({
  component: HomeComponent,
});

function HomeComponent() {
  const { isAuthenticated, isLoading } = useConvexAuth();
  const user = useQuery(api.auth.getCurrentUser, isAuthenticated ? {} : "skip");
  const [activeId, setActiveId] = useState<string | null>("conv-1");
  const [selectedModel, setSelectedModel] = useState<Model>(MODELS[0]!);

  const activeConversation =
    CONVERSATIONS.find((c) => c.id === activeId) ?? null;

  const currentModel = activeConversation?.model ?? selectedModel;

  const handleNewChat = useCallback(() => {
    setActiveId(null);
  }, []);

  const handleModelChange = useCallback((model: Model) => {
    setSelectedModel(model);
  }, []);

  if (isLoading || (isAuthenticated && user === undefined)) {
    return (
      <div className="flex min-h-svh items-center justify-center">
        <Loader />
      </div>
    );
  }

  if (!isAuthenticated || !user) {
    return <Navigate to="/sign-in" />;
  }

  return (
    <SidebarProvider>
      <AppSidebar
        conversations={CONVERSATIONS}
        activeConversationId={activeId}
        onSelectConversation={setActiveId}
        onNewChat={handleNewChat}
        user={user}
      />
      <SidebarInset>
        <ChatArea
          conversation={activeConversation}
          model={currentModel}
          onModelChange={handleModelChange}
        />
      </SidebarInset>
    </SidebarProvider>
  );
}
