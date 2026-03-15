import { paginationOptsValidator } from "convex/server";
import { ConvexError, v } from "convex/values";
import {
  PersistentTextStreaming,
  type StreamId,
} from "@convex-dev/persistent-text-streaming";

import type { Id } from "./_generated/dataModel";
import { components } from "./_generated/api";
import { mutation, query, type MutationCtx, type QueryCtx } from "./_generated/server";
import { authComponent } from "./auth";

const persistentTextStreaming = new PersistentTextStreaming(
  (components as typeof components & { persistentTextStreaming: any })
    .persistentTextStreaming,
);

function normalizeTitle(title?: string) {
  const trimmed = title?.trim();
  return trimmed && trimmed.length > 0 ? trimmed : "New chat";
}

async function requireAuthenticatedUser(
  ctx: MutationCtx | QueryCtx,
) {
  const user = await authComponent.safeGetAuthUser(ctx);
  if (!user) {
    throw new ConvexError("Not authenticated");
  }

  return user;
}

async function requireOwnedThread(
  ctx: MutationCtx | QueryCtx,
  threadId: Id<"threads">,
  userId: string,
) {
  const thread = await ctx.db.get(threadId);

  if (!thread || thread.userId !== userId) {
    throw new ConvexError("Thread not found");
  }

  return thread;
}

async function getThreadStreamingState(
  ctx: QueryCtx,
  threadId: Id<"threads">,
) {
  const latestMessage = await ctx.db
    .query("messages")
    .withIndex("by_threadId_createdAt", (q) => q.eq("threadId", threadId))
    .order("desc")
    .first();

  if (!latestMessage?.streamId) {
    return false;
  }

  const streamBody = await persistentTextStreaming.getStreamBody(
    ctx,
    latestMessage.streamId as StreamId,
  );

  return streamBody.status === "pending" || streamBody.status === "streaming";
}

export const listPaginated = query({
  args: {
    paginationOpts: paginationOptsValidator,
  },
  handler: async (ctx, args) => {
    const user = await authComponent.safeGetAuthUser(ctx);
    if (!user) {
      return {
        page: [],
        continueCursor: "",
        isDone: true,
        splitCursor: null,
        pageStatus: null,
      };
    }

    const result = await ctx.db
      .query("threads")
      .withIndex("by_userId_updatedAt", (q) => q.eq("userId", user._id))
      .order("desc")
      .paginate(args.paginationOpts);

    return {
      ...result,
      page: await Promise.all(
        result.page.map(async (thread) => ({
          ...thread,
          isStreaming: await getThreadStreamingState(ctx, thread._id),
        })),
      ),
    };
  },
});

export const create = mutation({
  args: {
    title: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const user = await requireAuthenticatedUser(ctx);

    const timestamp = Date.now();
    const title = normalizeTitle(args.title);
    const threadId = await ctx.db.insert("threads", {
      userId: user._id,
      title,
      createdAt: timestamp,
      updatedAt: timestamp,
    });

    return {
      _id: threadId,
      title,
      createdAt: timestamp,
      updatedAt: timestamp,
    };
  },
});

export const deleteMany = mutation({
  args: {
    threadIds: v.array(v.id("threads")),
  },
  handler: async (ctx, args) => {
    const user = await requireAuthenticatedUser(ctx);
    const uniqueThreadIds = [...new Set(args.threadIds)];

    for (const threadId of uniqueThreadIds) {
      await requireOwnedThread(ctx, threadId, user._id);
    }

    for (const threadId of uniqueThreadIds) {
      const messages = await ctx.db
        .query("messages")
        .withIndex("by_threadId_createdAt", (q) => q.eq("threadId", threadId))
        .collect();

      for (const message of messages) {
        for (const attachment of message.attachments ?? []) {
          await ctx.storage.delete(attachment.storageId);
        }

        await ctx.db.delete(message._id);
      }

      await ctx.db.delete(threadId);
    }

    return {
      deletedCount: uniqueThreadIds.length,
    };
  },
});
