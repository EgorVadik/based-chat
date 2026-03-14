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
  threads: defineTable({
    userId: v.string(),
    title: v.string(),
    createdAt: v.number(),
    updatedAt: v.number(),
  })
    .index("by_userId", ["userId"])
    .index("by_userId_updatedAt", ["userId", "updatedAt"]),
  messages: defineTable({
    threadId: v.id("threads"),
    userId: v.string(),
    role: v.union(v.literal("user"), v.literal("system")),
    modelId: v.string(),
    content: v.string(),
    createdAt: v.number(),
    updatedAt: v.optional(v.number()),
  }).index("by_threadId_createdAt", ["threadId", "createdAt"]),
});
