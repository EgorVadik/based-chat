import { ConvexError } from "convex/values";
import { v } from "convex/values";

import { mutation, query } from "./_generated/server";
import { authComponent } from "./auth";

export const list = query({
  args: {},
  handler: async (ctx) => {
    const user = await authComponent.safeGetAuthUser(ctx);
    if (!user) {
      return [];
    }

    const favorites = await ctx.db
      .query("favoriteModels")
      .withIndex("by_userId", (q) => q.eq("userId", user._id))
      .collect();

    return favorites.map((favorite) => favorite.modelId);
  },
});

export const toggle = mutation({
  args: {
    modelId: v.string(),
  },
  handler: async (ctx, args) => {
    const user = await authComponent.safeGetAuthUser(ctx);
    if (!user) {
      throw new ConvexError("Not authenticated");
    }

    const existingFavorite = await ctx.db
      .query("favoriteModels")
      .withIndex("by_userId_modelId", (q) =>
        q.eq("userId", user._id).eq("modelId", args.modelId),
      )
      .first();

    if (existingFavorite) {
      await ctx.db.delete(existingFavorite._id);
      return { isFavorite: false };
    }

    await ctx.db.insert("favoriteModels", {
      userId: user._id,
      modelId: args.modelId,
      createdAt: Date.now(),
    });

    return { isFavorite: true };
  },
});
