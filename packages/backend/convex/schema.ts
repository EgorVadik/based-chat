import { defineSchema, defineTable } from "convex/server";
import { v } from "convex/values";

const generationStatsValidator = v.object({
  timeToFirstTokenMs: v.optional(v.number()),
  tokensPerSecond: v.optional(v.number()),
  costUsd: v.optional(v.number()),
  inputTokens: v.optional(v.number()),
  outputTokens: v.optional(v.number()),
  totalTokens: v.optional(v.number()),
  textTokens: v.optional(v.number()),
  reasoningTokens: v.optional(v.number()),
});

export default defineSchema({
  userMetadata: defineTable({
    userId: v.string(),
    name: v.string(),
    role: v.string(),
    traits: v.array(v.string()),
    bio: v.string(),
    createdAt: v.number(),
    updatedAt: v.number(),
  }).index("by_userId", ["userId"]),
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
    reasoningText: v.optional(v.string()),
    streamId: v.optional(v.string()),
    stopRequestedAt: v.optional(v.number()),
    errorMessage: v.optional(v.string()),
    attachments: v.optional(
      v.array(
        v.object({
          kind: v.union(v.literal("image"), v.literal("file")),
          storageId: v.id("_storage"),
          fileName: v.string(),
          contentType: v.string(),
          size: v.number(),
        }),
      ),
    ),
    generationStats: v.optional(generationStatsValidator),
    createdAt: v.number(),
    updatedAt: v.optional(v.number()),
  })
    .index("by_threadId_createdAt", ["threadId", "createdAt"])
    .index("by_streamId", ["streamId"]),
});
