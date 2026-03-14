import { expo } from "@better-auth/expo";
import { createClient, type GenericCtx } from "@convex-dev/better-auth";
import { convex, crossDomain } from "@convex-dev/better-auth/plugins";
import { betterAuth } from "better-auth/minimal";
import { ConvexError, v } from "convex/values";

import { components } from "./_generated/api";
import type { DataModel } from "./_generated/dataModel";
import { mutation, query } from "./_generated/server";
import authConfig from "./auth.config";

const siteUrl = process.env.SITE_URL!;
const nativeAppUrl = process.env.NATIVE_APP_URL || "based-chat://";
const NAME_MAX = 50;
const ROLE_MAX = 100;
const TRAIT_MAX = 100;
const TRAITS_MAX_COUNT = 20;
const BIO_MAX = 3000;

export const authComponent = createClient<DataModel>(components.betterAuth);

function createAuth(ctx: GenericCtx<DataModel>) {
  return betterAuth({
    trustedOrigins: [
      siteUrl,
      nativeAppUrl,
      ...(process.env.NODE_ENV === "development"
        ? ["exp://", "exp://**", "exp://192.168.*.*:*/**"]
        : []),
    ],
    database: authComponent.adapter(ctx),
    emailAndPassword: {
      enabled: true,
      requireEmailVerification: false,
    },
    plugins: [
      expo(),
      crossDomain({ siteUrl }),
      convex({
        authConfig,
        jwksRotateOnTokenGenerationError: true,
      }),
    ],
  });
}

export { createAuth };

export const getCurrentUser = query({
  args: {},
  handler: async (ctx) => {
    const user = await authComponent.safeGetAuthUser(ctx);
    if (!user) {
      return null;
    }

    const metadata = await ctx.db
      .query("userMetadata")
      .withIndex("by_userId", (q) => q.eq("userId", user._id))
      .unique();

    return {
      ...user,
      name: metadata?.name ?? user.name,
      role: metadata?.role ?? "",
      traits: metadata?.traits ?? [],
      bio: metadata?.bio ?? "",
    };
  },
});

export const updateProfile = mutation({
  args: {
    name: v.string(),
    role: v.string(),
    traits: v.array(v.string()),
    bio: v.string(),
  },
  handler: async (ctx, args) => {
    const user = await authComponent.safeGetAuthUser(ctx);
    if (!user) {
      throw new ConvexError("Not authenticated");
    }

    const name = args.name.trim();
    const role = args.role.trim();
    const bio = args.bio.trim();
    const traits = [...new Set(
      args.traits
        .map((trait) => trait.trim().toLowerCase())
        .filter((trait) => trait.length > 0),
    )];

    if (name.length === 0) {
      throw new ConvexError("Name is required");
    }

    if (name.length > NAME_MAX) {
      throw new ConvexError(`Name must be ${NAME_MAX} characters or fewer`);
    }

    if (role.length > ROLE_MAX) {
      throw new ConvexError(`Role must be ${ROLE_MAX} characters or fewer`);
    }

    if (traits.length > TRAITS_MAX_COUNT) {
      throw new ConvexError(`You can save up to ${TRAITS_MAX_COUNT} traits`);
    }

    if (traits.some((trait) => trait.length > TRAIT_MAX)) {
      throw new ConvexError(`Each trait must be ${TRAIT_MAX} characters or fewer`);
    }

    if (bio.length > BIO_MAX) {
      throw new ConvexError(`Bio must be ${BIO_MAX} characters or fewer`);
    }

    const timestamp = Date.now();
    const metadata = await ctx.db
      .query("userMetadata")
      .withIndex("by_userId", (q) => q.eq("userId", user._id))
      .unique();

    if (metadata) {
      await ctx.db.patch(metadata._id, {
        name,
        role,
        traits,
        bio,
        updatedAt: timestamp,
      });
    } else {
      await ctx.db.insert("userMetadata", {
        userId: user._id,
        name,
        role,
        traits,
        bio,
        createdAt: timestamp,
        updatedAt: timestamp,
      });
    }

    return {
      ...user,
      name,
      role,
      traits,
      bio,
    };
  },
});
