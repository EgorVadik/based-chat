import type { Id } from "@based-chat/backend/convex/_generated/dataModel";

const BLOCKED_FILE_EXTENSIONS = new Set([
  "zip",
  "rar",
  "7z",
  "tar",
  "gz",
  "tgz",
  "bz2",
  "xz",
]);

const BLOCKED_CONTENT_TYPE_PREFIXES = [
  "application/zip",
  "application/x-rar",
  "application/vnd.rar",
  "application/x-7z",
  "application/x-tar",
  "application/gzip",
  "application/x-gzip",
  "application/x-bzip2",
  "application/x-xz",
];

export const MAX_ATTACHMENTS = 10;

export type MessageAttachmentKind = "image" | "file";

export type MessageAttachment = {
  kind: MessageAttachmentKind;
  storageId: Id<"_storage">;
  fileName: string;
  contentType: string;
  size: number;
  url: string | null;
};

export type DraftAttachment = {
  id: string;
  source: "draft";
  kind: MessageAttachmentKind;
  file: File;
  fileName: string;
  contentType: string;
  size: number;
  previewUrl: string | null;
};

export type StoredComposerAttachment = {
  id: string;
  source: "stored";
  kind: MessageAttachmentKind;
  storageId: Id<"_storage">;
  fileName: string;
  contentType: string;
  size: number;
  url: string | null;
  previewUrl: string | null;
};

export type ComposerAttachment = DraftAttachment | StoredComposerAttachment;

export type AttachmentUploadHandlers = {
  onUploadProgress?: (attachmentId: string, progress: number) => void;
};

export type PrepareAttachmentResult = {
  attachments: DraftAttachment[];
  blockedCount: number;
  duplicateCount: number;
  overLimitCount: number;
};

function getAttachmentKind(contentType: string) {
  return contentType.startsWith("image/") ? "image" : "file";
}

export function isImageAttachment(
  attachment: Pick<ComposerAttachment | MessageAttachment, "kind">,
) {
  return attachment.kind === "image";
}

export function isPdfAttachment(
  attachment: Pick<ComposerAttachment | MessageAttachment, "contentType">,
) {
  return attachment.contentType === "application/pdf";
}

export function canRenderTextAttachment(
  attachment: Pick<ComposerAttachment | MessageAttachment, "contentType" | "fileName">,
) {
  const contentType = attachment.contentType.toLowerCase();
  const extension = attachment.fileName.split(".").pop()?.toLowerCase();

  return (
    contentType.startsWith("text/") ||
    contentType.includes("json") ||
    contentType.includes("javascript") ||
    contentType.includes("typescript") ||
    contentType.includes("xml") ||
    contentType.includes("yaml") ||
    contentType.includes("markdown") ||
    contentType.includes("sql") ||
    [
      "js",
      "jsx",
      "ts",
      "tsx",
      "json",
      "md",
      "txt",
      "css",
      "html",
      "xml",
      "yml",
      "yaml",
      "py",
      "rb",
      "go",
      "rs",
      "java",
      "c",
      "cpp",
      "h",
      "hpp",
      "sh",
      "sql",
      "env",
    ].includes(extension ?? "")
  );
}

export function getAttachmentPreviewUrl(
  attachment: ComposerAttachment | MessageAttachment,
) {
  if (!isImageAttachment(attachment)) {
    return null;
  }

  if ("previewUrl" in attachment) {
    return attachment.previewUrl;
  }

  return attachment.url;
}

export function isAllowedAttachmentFile(file: File) {
  const extension = file.name.split(".").pop()?.toLowerCase();
  const contentType = file.type.toLowerCase();

  if (extension && BLOCKED_FILE_EXTENSIONS.has(extension)) {
    return false;
  }

  return !BLOCKED_CONTENT_TYPE_PREFIXES.some((prefix) =>
    contentType.startsWith(prefix),
  );
}

export function createDraftAttachment(file: File): DraftAttachment {
  const contentType = file.type || "application/octet-stream";
  const kind = getAttachmentKind(contentType);

  return {
    id: crypto.randomUUID(),
    source: "draft",
    kind,
    file,
    fileName: file.name,
    contentType,
    size: file.size,
    previewUrl: kind === "image" ? URL.createObjectURL(file) : null,
  };
}

function getAttachmentDedupKey(input: {
  fileName: string;
  contentType: string;
  size: number;
}) {
  return `${input.fileName.toLowerCase()}::${input.contentType.toLowerCase()}::${input.size}`;
}

export function prepareDraftAttachments(
  currentAttachments: ComposerAttachment[],
  files: File[],
): PrepareAttachmentResult {
  const existingKeys = new Set(
    currentAttachments.map((attachment) =>
      getAttachmentDedupKey({
        fileName: attachment.fileName,
        contentType: attachment.contentType,
        size: attachment.size,
      }),
    ),
  );
  const nextAttachments: DraftAttachment[] = [];
  let blockedCount = 0;
  let duplicateCount = 0;
  let overLimitCount = 0;

  for (const file of files) {
    if (!isAllowedAttachmentFile(file)) {
      blockedCount += 1;
      continue;
    }

    if (currentAttachments.length + nextAttachments.length >= MAX_ATTACHMENTS) {
      overLimitCount += 1;
      continue;
    }

    const dedupKey = getAttachmentDedupKey({
      fileName: file.name,
      contentType: file.type || "application/octet-stream",
      size: file.size,
    });

    if (existingKeys.has(dedupKey)) {
      duplicateCount += 1;
      continue;
    }

    existingKeys.add(dedupKey);
    nextAttachments.push(createDraftAttachment(file));
  }

  return {
    attachments: nextAttachments,
    blockedCount,
    duplicateCount,
    overLimitCount,
  };
}

export function revokeComposerAttachmentPreview(attachment: ComposerAttachment) {
  if (attachment.source === "draft" && attachment.previewUrl) {
    URL.revokeObjectURL(attachment.previewUrl);
  }
}

export function createComposerAttachmentFromMessageAttachment(
  attachment: MessageAttachment,
): StoredComposerAttachment {
  return {
    id: attachment.storageId,
    source: "stored",
    kind: attachment.kind,
    storageId: attachment.storageId,
    fileName: attachment.fileName,
    contentType: attachment.contentType,
    size: attachment.size,
    url: attachment.url,
    previewUrl: attachment.kind === "image" ? attachment.url : null,
  };
}
