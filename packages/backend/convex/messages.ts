import { ConvexError, v } from "convex/values";

import type { Id } from "./_generated/dataModel";
import { mutation, query, type MutationCtx, type QueryCtx } from "./_generated/server";
import { authComponent } from "./auth";

function deriveThreadTitle(content: string) {
  const normalized = content.trim().replace(/\s+/g, " ");

  if (normalized.length <= 60) {
    return normalized;
  }

  return `${normalized.slice(0, 57).trimEnd()}...`;
}

async function getAuthorizedThread(
  ctx: QueryCtx | MutationCtx,
  threadId: Id<"threads">,
) {
  const user = await authComponent.safeGetAuthUser(ctx);
  if (!user) {
    throw new ConvexError("Not authenticated");
  }

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

    return await ctx.db
      .query("messages")
      .withIndex("by_threadId_createdAt", (q) => q.eq("threadId", args.threadId))
      .order("asc")
      .collect();
  },
});

export const create = mutation({
  args: {
    threadId: v.id("threads"),
    role: v.union(v.literal("user"), v.literal("system")),
    modelId: v.string(),
    content: v.string(),
  },
  handler: async (ctx, args) => {
    const { thread, user } = await getAuthorizedThread(ctx, args.threadId);
    const content = args.content.trim();

    if (!content) {
      throw new ConvexError("Message content is required");
    }

    const timestamp = Date.now();
    const messageId = await ctx.db.insert("messages", {
      threadId: args.threadId,
      userId: user._id,
      role: args.role,
      modelId: args.modelId,
      content,
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
      threadPatch.title = deriveThreadTitle(content);
    }

    await ctx.db.patch(args.threadId, threadPatch);

    return {
      _id: messageId,
      threadId: args.threadId,
      userId: user._id,
      role: args.role,
      modelId: args.modelId,
      content,
      createdAt: timestamp,
      updatedAt: timestamp,
    };
  },
});

export const edit = mutation({
  args: {
    threadId: v.id("threads"),
    messageId: v.id("messages"),
    modelId: v.string(),
    content: v.string(),
  },
  handler: async (ctx, args) => {
    await getAuthorizedThread(ctx, args.threadId);

    const content = args.content.trim();
    if (!content) {
      throw new ConvexError("Message content is required");
    }

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
    if (targetMessage.role !== "user") {
      throw new ConvexError("Only user messages can be edited");
    }

    const deletedMessageIds = messages
      .slice(targetIndex + 1)
      .map((message) => message._id);

    for (const messageId of deletedMessageIds) {
      await ctx.db.delete(messageId);
    }

    const timestamp = Date.now();
    await ctx.db.patch(args.messageId, {
      content,
      modelId: args.modelId,
      updatedAt: timestamp,
    });

    await ctx.db.patch(args.threadId, {
      updatedAt: timestamp,
      ...(targetIndex === 0 ? { title: deriveThreadTitle(content) } : {}),
    });

    return {
      updatedMessage: {
        ...targetMessage,
        content,
        modelId: args.modelId,
        updatedAt: timestamp,
      },
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

    return {
      _id: messageId,
      threadId: args.threadId,
      userId: user._id,
      role: "system" as const,
      modelId: args.modelId,
      content,
      createdAt: timestamp,
      updatedAt: timestamp,
    };
  },
});
