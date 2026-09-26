import { ConvexError } from 'convex/values'

export function getErrorMessage(error: unknown, fallback: string) {
  if (error instanceof ConvexError && typeof error.data === 'string') {
    return error.data
  }

  return error instanceof Error && error.message ? error.message : fallback
}
