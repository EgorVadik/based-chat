import type { Id } from "@based-chat/backend/convex/_generated/dataModel";
import { createFileRoute } from "@tanstack/react-router";

import ChatWorkspace from "@/components/chat/chat-workspace";

export const Route = createFileRoute("/chat/$threadId")({
  component: ChatThreadRoute,
});

function ChatThreadRoute() {
  const { threadId } = Route.useParams();

  return <ChatWorkspace routeThreadId={threadId as Id<"threads">} />;
}
