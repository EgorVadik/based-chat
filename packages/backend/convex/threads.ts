import { paginationOptsValidator } from "convex/server";
import { ConvexError, v } from "convex/values";

import { mutation, query } from "./_generated/server";
import { authComponent } from "./auth";

function normalizeTitle(title?: string) {
  const trimmed = title?.trim();
  return trimmed && trimmed.length > 0 ? trimmed : "New chat";
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

    return await ctx.db
      .query("threads")
      .withIndex("by_userId_updatedAt", (q) => q.eq("userId", user._id))
      .order("desc")
      .paginate(args.paginationOpts);
  },
});

export const create = mutation({
  args: {
    title: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const user = await authComponent.safeGetAuthUser(ctx);
    if (!user) {
      throw new ConvexError("Not authenticated");
    }

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
