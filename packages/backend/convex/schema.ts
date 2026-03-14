import { defineSchema, defineTable } from "convex/server";
import { v } from "convex/values";

export default defineSchema({
  favoriteModels: defineTable({
    userId: v.string(),
    modelId: v.string(),
    createdAt: v.number(),
  })
    .index("by_userId", ["userId"])
    .index("by_userId_modelId", ["userId", "modelId"]),
});
