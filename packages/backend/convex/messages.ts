import { ConvexError, v } from "convex/values";

import type { Id } from "./_generated/dataModel";
import { mutation, query, type MutationCtx, type QueryCtx } from "./_generated/server";
import { authComponent } from "./auth";

const attachmentValidator = v.object({
  kind: v.union(v.literal("image"), v.literal("file")),
  storageId: v.id("_storage"),
  fileName: v.string(),
  contentType: v.string(),
  size: v.number(),
});

type StoredAttachment = {
  kind: "image" | "file";
  storageId: Id<"_storage">;
  fileName: string;
  contentType: string;
  size: number;
};

async function resolveAttachments(
  ctx: QueryCtx | MutationCtx,
  attachments: StoredAttachment[] | undefined,
) {
  if (!attachments?.length) {
    return [];
  }

  return await Promise.all(
    attachments.map(async (attachment) => ({
      ...attachment,
      url: await ctx.storage.getUrl(attachment.storageId),
    })),
  );
}

async function toClientMessage(
  ctx: QueryCtx | MutationCtx,
  message: {
    _id: Id<"messages">;
    threadId: Id<"threads">;
    userId: string;
    role: "user" | "system";
    modelId: string;
    content: string;
    attachments?: StoredAttachment[];
    createdAt: number;
    updatedAt?: number;
  },
) {
  return {
    ...message,
    attachments: await resolveAttachments(ctx, message.attachments),
  };
}

function deriveThreadTitle(
  content: string,
  attachments?: StoredAttachment[],
) {
  const normalized = content.trim().replace(/\s+/g, " ");

  if (normalized.length > 0 && normalized.length <= 60) {
    return normalized;
  }

  if (normalized.length > 0) {
    return `${normalized.slice(0, 57).trimEnd()}...`;
  }

  if (attachments?.length === 1) {
    return attachments[0]!.fileName || "Shared image";
  }

  if (attachments && attachments.length > 1) {
    return `${attachments.length} shared images`;
  }

  return "New chat";
}

async function deleteMessageAttachments(
  ctx: MutationCtx,
  attachments: StoredAttachment[] | undefined,
) {
  if (!attachments?.length) {
    return;
  }

  for (const attachment of attachments) {
    await ctx.storage.delete(attachment.storageId);
  }
}

async function requireAuthenticatedUser(
  ctx: QueryCtx | MutationCtx,
) {
  const user = await authComponent.safeGetAuthUser(ctx);
  if (!user) {
    throw new ConvexError("Not authenticated");
  }

  return user;
}

async function listOwnedThreadsWithMessages(
  ctx: QueryCtx | MutationCtx,
  userId: string,
) {
  const threads = await ctx.db
    .query("threads")
    .withIndex("by_userId", (q) => q.eq("userId", userId))
    .collect();

  return await Promise.all(
    threads.map(async (thread) => ({
      thread,
      messages: await ctx.db
        .query("messages")
        .withIndex("by_threadId_createdAt", (q) => q.eq("threadId", thread._id))
        .order("asc")
        .collect(),
    })),
  );
}

async function getAuthorizedThread(
  ctx: QueryCtx | MutationCtx,
  threadId: Id<"threads">,
) {
  const user = await requireAuthenticatedUser(ctx);

  const thread = await ctx.db.get(threadId);
  if (!thread || thread.userId !== user._id) {
    throw new ConvexError("Thread not found");
  }

  return { thread, user };
}

export const listByThread = query({
  args: {
    threadId: v.id("threads"),
  },
  handler: async (ctx, args) => {
    await getAuthorizedThread(ctx, args.threadId);

    const messages = await ctx.db
      .query("messages")
      .withIndex("by_threadId_createdAt", (q) => q.eq("threadId", args.threadId))
      .order("asc")
      .collect();

    return await Promise.all(messages.map((message) => toClientMessage(ctx, message)));
  },
});

export const listUserAttachments = query({
  args: {},
  handler: async (ctx) => {
    const user = await requireAuthenticatedUser(ctx);
    const threadEntries = await listOwnedThreadsWithMessages(ctx, user._id);
    const attachments = await Promise.all(
      threadEntries.flatMap(({ thread, messages }) =>
        messages.flatMap((message) =>
          (message.attachments ?? []).map(async (attachment) => ({
            id: attachment.storageId,
            storageId: attachment.storageId,
            messageId: message._id,
            threadId: thread._id,
            threadTitle: thread.title,
            kind: attachment.kind,
            fileName: attachment.fileName,
            contentType: attachment.contentType,
            size: attachment.size,
            createdAt: message.createdAt,
            updatedAt: message.updatedAt ?? message.createdAt,
            url: await ctx.storage.getUrl(attachment.storageId),
          })),
        ),
      ),
    );

    return attachments.sort((a, b) => b.createdAt - a.createdAt);
  },
});

export const create = mutation({
  args: {
    threadId: v.id("threads"),
    role: v.union(v.literal("user"), v.literal("system")),
    modelId: v.string(),
    content: v.string(),
    attachments: v.optional(v.array(attachmentValidator)),
  },
  handler: async (ctx, args) => {
    const { thread, user } = await getAuthorizedThread(ctx, args.threadId);
    const content = args.content.trim();
    const attachments = args.attachments ?? [];

    if (!content && attachments.length === 0) {
      throw new ConvexError("Message content or an attachment is required");
    }

    const timestamp = Date.now();
    const messageId = await ctx.db.insert("messages", {
      threadId: args.threadId,
      userId: user._id,
      role: args.role,
      modelId: args.modelId,
      content,
      attachments: attachments.length > 0 ? attachments : undefined,
      createdAt: timestamp,
      updatedAt: timestamp,
    });

    const threadPatch: {
      updatedAt: number;
      title?: string;
    } = {
      updatedAt: timestamp,
    };

    if (args.role === "user" && thread.title === "New chat") {
      threadPatch.title = deriveThreadTitle(content, attachments);
    }

    await ctx.db.patch(args.threadId, threadPatch);

    return await toClientMessage(ctx, {
      _id: messageId,
      threadId: args.threadId,
      userId: user._id,
      role: args.role,
      modelId: args.modelId,
      content,
      attachments: attachments.length > 0 ? attachments : undefined,
      createdAt: timestamp,
      updatedAt: timestamp,
    });
  },
});

export const generateAttachmentUploadUrl = mutation({
  args: {},
  handler: async (ctx) => {
    const user = await authComponent.safeGetAuthUser(ctx);
    if (!user) {
      throw new ConvexError("Not authenticated");
    }

    return await ctx.storage.generateUploadUrl();
  },
});

export const edit = mutation({
  args: {
    threadId: v.id("threads"),
    messageId: v.id("messages"),
    modelId: v.string(),
    content: v.string(),
    attachments: v.optional(v.array(attachmentValidator)),
  },
  handler: async (ctx, args) => {
    await getAuthorizedThread(ctx, args.threadId);

    const messages = await ctx.db
      .query("messages")
      .withIndex("by_threadId_createdAt", (q) => q.eq("threadId", args.threadId))
      .order("asc")
      .collect();

    const targetIndex = messages.findIndex((message) => message._id === args.messageId);
    if (targetIndex === -1) {
      throw new ConvexError("Message not found");
    }

    const targetMessage = messages[targetIndex]!;
    const content = args.content.trim();
    const nextAttachments = args.attachments ?? targetMessage.attachments ?? [];
    if (targetMessage.role !== "user") {
      throw new ConvexError("Only user messages can be edited");
    }

    if (!content && !nextAttachments.length) {
      throw new ConvexError("Message content or an attachment is required");
    }

    const nextAttachmentStorageIds = new Set(
      nextAttachments.map((attachment) => attachment.storageId),
    );

    const deletedMessageIds = messages
      .slice(targetIndex + 1)
      .map((message) => message._id);

    for (const message of messages.slice(targetIndex + 1)) {
      await deleteMessageAttachments(ctx, message.attachments);
      await ctx.db.delete(message._id);
    }

    const timestamp = Date.now();
    for (const attachment of targetMessage.attachments ?? []) {
      if (!nextAttachmentStorageIds.has(attachment.storageId)) {
        await ctx.storage.delete(attachment.storageId);
      }
    }

    await ctx.db.patch(args.messageId, {
      content,
      modelId: args.modelId,
      attachments: nextAttachments.length > 0 ? nextAttachments : undefined,
      updatedAt: timestamp,
    });

    await ctx.db.patch(args.threadId, {
      updatedAt: timestamp,
      ...(targetIndex === 0
        ? { title: deriveThreadTitle(content, nextAttachments) }
        : {}),
    });

    return {
      updatedMessage: await toClientMessage(ctx, {
        ...targetMessage,
        content,
        modelId: args.modelId,
        attachments: nextAttachments.length > 0 ? nextAttachments : undefined,
        updatedAt: timestamp,
      }),
      deletedMessageIds,
    };
  },
});

export const createSystemReply = mutation({
  args: {
    threadId: v.id("threads"),
    userMessageId: v.id("messages"),
    userMessageUpdatedAt: v.number(),
    modelId: v.string(),
    content: v.string(),
  },
  handler: async (ctx, args) => {
    const { user } = await getAuthorizedThread(ctx, args.threadId);
    const content = args.content.trim();

    if (!content) {
      throw new ConvexError("Message content is required");
    }

    const messages = await ctx.db
      .query("messages")
      .withIndex("by_threadId_createdAt", (q) => q.eq("threadId", args.threadId))
      .order("asc")
      .collect();

    const targetIndex = messages.findIndex(
      (message) => message._id === args.userMessageId,
    );
    if (targetIndex === -1) {
      throw new ConvexError("Message not found");
    }

    const targetMessage = messages[targetIndex]!;
    const targetUpdatedAt = targetMessage.updatedAt ?? targetMessage.createdAt;

    if (targetMessage.role !== "user") {
      throw new ConvexError("System replies must target a user message");
    }

    if (targetUpdatedAt !== args.userMessageUpdatedAt) {
      return null;
    }

    if (targetIndex !== messages.length - 1) {
      return null;
    }

    const timestamp = Date.now();
    const messageId = await ctx.db.insert("messages", {
      threadId: args.threadId,
      userId: user._id,
      role: "system",
      modelId: args.modelId,
      content,
      createdAt: timestamp,
      updatedAt: timestamp,
    });

    await ctx.db.patch(args.threadId, {
      updatedAt: timestamp,
    });

    return await toClientMessage(ctx, {
      _id: messageId,
      threadId: args.threadId,
      userId: user._id,
      role: "system" as const,
      modelId: args.modelId,
      content,
      createdAt: timestamp,
      updatedAt: timestamp,
    });
  },
});

export const deleteManyAttachments = mutation({
  args: {
    storageIds: v.array(v.id("_storage")),
  },
  handler: async (ctx, args) => {
    const user = await requireAuthenticatedUser(ctx);
    const uniqueStorageIds = [...new Set(args.storageIds)];
    if (uniqueStorageIds.length === 0) {
      return { deletedCount: 0 };
    }

    const targetStorageIds = new Set(uniqueStorageIds);
    const threadEntries = await listOwnedThreadsWithMessages(ctx, user._id);
    const timestamp = Date.now();
    let deletedCount = 0;

    for (const { thread, messages } of threadEntries) {
      let shouldPatchThread = false;
      let nextTitle = thread.title;

      for (const [index, message] of messages.entries()) {
        const currentAttachments = message.attachments ?? [];
        if (currentAttachments.length === 0) {
          continue;
        }

        const removedAttachments = currentAttachments.filter((attachment) =>
          targetStorageIds.has(attachment.storageId),
        );
        if (removedAttachments.length === 0) {
          continue;
        }

        const nextAttachments = currentAttachments.filter(
          (attachment) => !targetStorageIds.has(attachment.storageId),
        );

        await ctx.db.patch(message._id, {
          attachments: nextAttachments.length > 0 ? nextAttachments : undefined,
          updatedAt: timestamp,
        });

        for (const attachment of removedAttachments) {
          await ctx.storage.delete(attachment.storageId);
          deletedCount += 1;
        }

        if (index === 0) {
          nextTitle = deriveThreadTitle(message.content, nextAttachments);
        }

        shouldPatchThread = true;
      }

      if (shouldPatchThread) {
        await ctx.db.patch(thread._id, {
          updatedAt: timestamp,
          title: nextTitle,
        });
      }
    }

    return { deletedCount };
  },
});
