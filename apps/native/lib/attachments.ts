import { File as ExpoFile, Paths } from 'expo-file-system'
import { useEffect, useSyncExternalStore } from 'react'
import { Platform } from 'react-native'

/** Per-attachment upload cap. Larger files are rejected before upload. */
export const MAX_ATTACHMENT_BYTES = 20 * 1024 * 1024
export const MAX_ATTACHMENT_SIZE_LABEL = '20 MB'

/**
 * Document types offered when the model reads files but not images. Mirrors
 * the web `getModelAttachmentInputAccept` list.
 */
export const FILE_ATTACHMENT_MIME_TYPES = [
  'application/pdf',
  'text/*',
  'application/json',
  'application/xml',
  'application/x-yaml',
  'application/javascript',
  'application/sql',
]

export type AttachmentKind = 'image' | 'file'
export type AttachmentKindRef = { kind: AttachmentKind }

export function getAttachmentKind(mimeType: string | undefined): AttachmentKind {
  return mimeType?.startsWith('image/') ? 'image' : 'file'
}

export function toAttachmentKindRefs(
  attachments: Array<{ mimeType?: string }>,
): AttachmentKindRef[] {
  return attachments.map((attachment) => ({
    kind: getAttachmentKind(attachment.mimeType),
  }))
}

export function getLocalFileSize(attachment: { uri: string; size?: number }) {
  if (attachment.size != null) {
    return attachment.size
  }
  if (Platform.OS === 'web') {
    return null
  }

  try {
    return new ExpoFile(attachment.uri).size
  } catch {
    return null
  }
}

export function isAttachmentTooLarge(attachment: { uri: string; size?: number }) {
  const size = getLocalFileSize(attachment)
  return size != null && size > MAX_ATTACHMENT_BYTES
}

/**
 * Removes picker copies (document picker / image picker / camera) that live in
 * the app cache. Files outside the cache directory are never touched.
 */
export function deleteLocalAttachmentCopies(attachments: Array<{ uri: string }>) {
  if (Platform.OS === 'web' || attachments.length === 0) {
    return
  }

  const cacheUri = Paths.cache.uri

  for (const attachment of attachments) {
    if (!attachment.uri.startsWith(cacheUri)) {
      continue
    }

    try {
      const file = new ExpoFile(attachment.uri)
      if (file.exists) {
        file.delete()
      }
    } catch {
      // Best effort: the OS may already have purged the cache entry.
    }
  }
}

// Composer attachments per chat screen, so the header model selector (rendered
// outside the screen tree) can disable models that cannot read them.
export type ComposerScope = 'new-chat' | 'thread' | 'temporary-chat'

const EMPTY_ATTACHMENT_KINDS: AttachmentKindRef[] = []
const composerAttachmentKinds = new Map<ComposerScope, AttachmentKindRef[]>()
const composerAttachmentListeners = new Set<() => void>()

function emitComposerAttachmentsChange() {
  for (const listener of composerAttachmentListeners) {
    listener()
  }
}

function subscribeToComposerAttachments(listener: () => void) {
  composerAttachmentListeners.add(listener)
  return () => {
    composerAttachmentListeners.delete(listener)
  }
}

export function usePublishComposerAttachments(
  scope: ComposerScope,
  attachments: Array<{ mimeType?: string }>,
) {
  useEffect(() => {
    composerAttachmentKinds.set(
      scope,
      attachments.length > 0
        ? toAttachmentKindRefs(attachments)
        : EMPTY_ATTACHMENT_KINDS,
    )
    emitComposerAttachmentsChange()
  }, [attachments, scope])

  useEffect(() => {
    return () => {
      composerAttachmentKinds.delete(scope)
      emitComposerAttachmentsChange()
    }
  }, [scope])
}

export function useComposerAttachments(scope?: ComposerScope) {
  return useSyncExternalStore(
    subscribeToComposerAttachments,
    () =>
      (scope ? composerAttachmentKinds.get(scope) : undefined) ??
      EMPTY_ATTACHMENT_KINDS,
  )
}
