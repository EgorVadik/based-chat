import { createFileRoute } from '@tanstack/react-router'

import ChatWorkspace from '@/components/chat/chat-workspace'

export const Route = createFileRoute('/temporary-chat')({
  component: TemporaryChatRoute,
})

function TemporaryChatRoute() {
  return <ChatWorkspace temporary />
}
