import type { ChatMessage } from '@/lib/chat'
import type { ThreadSummary } from '@/lib/threads'

export type ChatWorkspaceUser = {
  name?: string | null
  email?: string | null
  image?: string | null
} | null

// Warm cache shared across ChatWorkspace remounts (each route mounts its own
// workspace) so switching routes doesn't flash a loading shell.
export const chatWorkspaceSnapshot: {
  user: ChatWorkspaceUser | undefined
  threads: ThreadSummary[]
  messageCache: Record<string, ChatMessage[] | undefined>
} = {
  user: undefined,
  threads: [],
  messageCache: {},
}

let chatWorkspaceSnapshotEpoch = 0

// Workspaces mounted before a reset must not write their (previous account's)
// state back into the snapshot.
export function getChatWorkspaceSnapshotEpoch() {
  return chatWorkspaceSnapshotEpoch
}

export function resetChatWorkspaceSnapshot() {
  chatWorkspaceSnapshotEpoch += 1
  chatWorkspaceSnapshot.user = undefined
  chatWorkspaceSnapshot.threads = []
  chatWorkspaceSnapshot.messageCache = {}
}
