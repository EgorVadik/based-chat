import { toast } from 'sonner'

import { clearStoredOpenRouterApiKey } from '@/lib/api-key-storage'
import { authClient } from '@/lib/auth-client'
import { resetChatWorkspaceSnapshot } from '@/lib/chat-workspace-snapshot'
import { clearTemporaryChatStorage } from '@/lib/temporary-chat'

// Drops everything this browser holds for the signed-in account so the next
// account on the same browser can't see or bill against it.
export function clearLocalAccountState() {
  clearStoredOpenRouterApiKey()
  resetChatWorkspaceSnapshot()
  clearTemporaryChatStorage()
}

export async function signOut({ notify = true }: { notify?: boolean } = {}) {
  let didSignOut = false

  await authClient.signOut({
    fetchOptions: {
      onSuccess: () => {
        didSignOut = true
        clearLocalAccountState()
        if (notify) {
          toast.success('Signed out.')
        }
      },
      onError: (error) => {
        if (notify) {
          toast.error(error.error.message || error.error.statusText)
        }
      },
    },
  })

  return didSignOut
}
