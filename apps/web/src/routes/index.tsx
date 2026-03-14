import { SidebarInset, SidebarProvider } from "@based-chat/ui/components/sidebar";
import { createFileRoute } from "@tanstack/react-router";
import { useCallback, useState } from "react";
import AppSidebar from "@/components/chat/app-sidebar";
import ChatArea from "@/components/chat/chat-area";
import { CONVERSATIONS, MODELS } from "@/lib/fake-data";

export const Route = createFileRoute("/")({
  component: HomeComponent,
});

function HomeComponent() {
  const [activeId, setActiveId] = useState<string | null>("conv-1");

  const activeConversation =
    CONVERSATIONS.find((c) => c.id === activeId) ?? null;

  const currentModel = activeConversation?.model ?? MODELS[0]!;

  const handleNewChat = useCallback(() => {
    setActiveId(null);
  }, []);

  return (
    <SidebarProvider>
      <AppSidebar
        conversations={CONVERSATIONS}
        activeConversationId={activeId}
        onSelectConversation={setActiveId}
        onNewChat={handleNewChat}
      />
      <SidebarInset>
        <ChatArea conversation={activeConversation} model={currentModel} />
      </SidebarInset>
    </SidebarProvider>
  );
}
