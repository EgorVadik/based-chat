export type Model = {
  id: string;
  name: string;
  provider: string;
  badge?: string;
};

export type Message = {
  id: string;
  role: "user" | "assistant";
  content: string;
  model?: Model;
  createdAt: Date;
};

export type Conversation = {
  id: string;
  title: string;
  model: Model;
  messages: Message[];
  createdAt: Date;
  updatedAt: Date;
};

export const MODELS: Model[] = [
  { id: "claude-opus-4-6", name: "Claude Opus 4.6", provider: "Anthropic", badge: "NEW" },
  { id: "claude-sonnet-4-6", name: "Claude Sonnet 4.6", provider: "Anthropic" },
  { id: "gpt-4o", name: "GPT-4o", provider: "OpenAI" },
  { id: "gemini-2.5-pro", name: "Gemini 2.5 Pro", provider: "Google" },
  { id: "deepseek-r1", name: "DeepSeek R1", provider: "DeepSeek" },
];

const now = new Date();
const hoursAgo = (h: number) => new Date(now.getTime() - h * 60 * 60 * 1000);
const daysAgo = (d: number) => new Date(now.getTime() - d * 24 * 60 * 60 * 1000);

export const CONVERSATIONS: Conversation[] = [
  {
    id: "conv-1",
    title: "Building a REST API with Hono",
    model: MODELS[0]!,
    createdAt: hoursAgo(1),
    updatedAt: hoursAgo(1),
    messages: [
      {
        id: "msg-1",
        role: "user",
        content: "How do I set up a REST API with Hono and Bun? I want to have proper error handling and validation.",
        createdAt: hoursAgo(1),
      },
      {
        id: "msg-2",
        role: "assistant",
        content: `Here's how to set up a production-ready REST API with **Hono** and **Bun**:

## 1. Project Setup

First, create a new project and install dependencies:

\`\`\`bash
bun init my-api
cd my-api
bun add hono @hono/zod-validator zod
\`\`\`

## 2. Basic Server

Create your entry point with middleware and error handling:

\`\`\`typescript
import { Hono } from "hono";
import { cors } from "hono/cors";
import { logger } from "hono/logger";
import { HTTPException } from "hono/http-exception";

const app = new Hono();

// Middleware
app.use("*", logger());
app.use("*", cors());

// Global error handler
app.onError((err, c) => {
  if (err instanceof HTTPException) {
    return c.json({ error: err.message }, err.status);
  }
  console.error(err);
  return c.json({ error: "Internal server error" }, 500);
});

export default app;
\`\`\`

## 3. Route with Validation

Use Zod for request validation:

\`\`\`typescript
import { z } from "zod";
import { zValidator } from "@hono/zod-validator";

const createUserSchema = z.object({
  name: z.string().min(2),
  email: z.string().email(),
});

app.post(
  "/api/users",
  zValidator("json", createUserSchema),
  async (c) => {
    const data = c.req.valid("json");
    // Insert into database...
    return c.json({ user: data }, 201);
  }
);
\`\`\`

### Key Features

| Feature | Library | Purpose |
|---------|---------|---------|
| Routing | Hono | Fast, lightweight router |
| Validation | Zod | Runtime type checking |
| CORS | hono/cors | Cross-origin requests |
| Logging | hono/logger | Request logging |

> **Tip:** Hono's middleware system is composable. You can create route-specific middleware groups for authentication, rate limiting, etc.

This setup gives you a **type-safe**, **validated**, and **well-structured** API foundation.`,
        model: MODELS[0],
        createdAt: hoursAgo(1),
      },
    ],
  },
  {
    id: "conv-2",
    title: "React Server Components explained",
    model: MODELS[1]!,
    createdAt: hoursAgo(3),
    updatedAt: hoursAgo(3),
    messages: [
      {
        id: "msg-3",
        role: "user",
        content: "Can you explain React Server Components and when to use them?",
        createdAt: hoursAgo(3),
      },
      {
        id: "msg-4",
        role: "assistant",
        content: `## React Server Components (RSC)

Server Components run **exclusively on the server** and send rendered HTML to the client. They never ship JavaScript to the browser.

### When to Use Server Components

- **Data fetching** \u2014 Access databases and APIs directly
- **Large dependencies** \u2014 Keep heavy libraries off the client bundle
- **Sensitive operations** \u2014 API keys and tokens stay on the server

### When to Use Client Components

Add \`"use client"\` when you need:
- **Interactivity** (onClick, onChange, etc.)
- **Browser APIs** (localStorage, window)
- **React hooks** (useState, useEffect)

\`\`\`tsx
// Server Component (default)
async function UserProfile({ id }: { id: string }) {
  const user = await db.users.findById(id);
  return <div>{user.name}</div>;
}

// Client Component
"use client";
function LikeButton() {
  const [liked, setLiked] = useState(false);
  return (
    <button onClick={() => setLiked(!liked)}>
      {liked ? "\u2764\ufe0f" : "\ud83e\udd0d"}
    </button>
  );
}
\`\`\`

The mental model is simple: **start with Server Components** and only add \`"use client"\` when you need interactivity.`,
        model: MODELS[1],
        createdAt: hoursAgo(3),
      },
    ],
  },
  {
    id: "conv-3",
    title: "Tailwind v4 migration guide",
    model: MODELS[0]!,
    createdAt: hoursAgo(6),
    updatedAt: hoursAgo(6),
    messages: [
      {
        id: "msg-5",
        role: "user",
        content: "What are the main changes in Tailwind CSS v4?",
        createdAt: hoursAgo(6),
      },
      {
        id: "msg-6",
        role: "assistant",
        content: `Tailwind CSS v4 is a **ground-up rewrite** with some major changes:

### Key Changes

1. **CSS-first configuration** \u2014 No more \`tailwind.config.js\`. Use CSS \`@theme\` instead
2. **Lightning CSS engine** \u2014 Up to 10x faster builds
3. **Native cascade layers** \u2014 Uses \`@layer\` for proper specificity
4. **OKLCH colors** \u2014 Wider gamut, perceptually uniform

\`\`\`css
/* v4: Configure in CSS */
@import "tailwindcss";

@theme {
  --color-primary: oklch(0.72 0.17 195);
  --font-sans: "Inter Variable", sans-serif;
}
\`\`\`

### What's Removed

- \`tailwind.config.js\` / \`tailwind.config.ts\`
- \`@tailwind base/components/utilities\` directives
- PostCSS plugin (replaced by Vite/CLI)
- \`darkMode\` config (use \`@custom-variant\` instead)

### Migration Checklist

- [ ] Replace config file with \`@theme\` in CSS
- [ ] Update \`@tailwind\` directives to \`@import "tailwindcss"\`
- [ ] Switch to new Vite plugin or CLI
- [ ] Update color values to OKLCH
- [ ] Test dark mode with \`@custom-variant\``,
        model: MODELS[0],
        createdAt: hoursAgo(6),
      },
    ],
  },
  {
    id: "conv-4",
    title: "Database schema design",
    model: MODELS[2]!,
    createdAt: daysAgo(1),
    updatedAt: daysAgo(1),
    messages: [
      {
        id: "msg-7",
        role: "user",
        content: "Help me design a database schema for a multi-tenant SaaS app",
        createdAt: daysAgo(1),
      },
      {
        id: "msg-8",
        role: "assistant",
        content: `For a multi-tenant SaaS app, here's a solid **shared database** approach with row-level security:

\`\`\`sql
-- Organizations (tenants)
CREATE TABLE organizations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  slug TEXT UNIQUE NOT NULL,
  plan TEXT DEFAULT 'free',
  created_at TIMESTAMPTZ DEFAULT now()
);

-- Users belong to organizations
CREATE TABLE users (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id UUID REFERENCES organizations(id),
  email TEXT UNIQUE NOT NULL,
  role TEXT DEFAULT 'member',
  created_at TIMESTAMPTZ DEFAULT now()
);

-- Row-Level Security
ALTER TABLE users ENABLE ROW LEVEL SECURITY;

CREATE POLICY tenant_isolation ON users
  USING (org_id = current_setting('app.org_id')::UUID);
\`\`\`

### Isolation Strategies

| Strategy | Pros | Cons |
|----------|------|------|
| **Shared DB + RLS** | Simple, cost-effective | Complex policies |
| **Schema per tenant** | Good isolation | Migration complexity |
| **DB per tenant** | Full isolation | Expensive, harder to manage |

For most SaaS apps, **shared DB with RLS** offers the best balance of isolation and simplicity.`,
        model: MODELS[2],
        createdAt: daysAgo(1),
      },
    ],
  },
  {
    id: "conv-5",
    title: "TypeScript utility types",
    model: MODELS[1]!,
    createdAt: daysAgo(2),
    updatedAt: daysAgo(2),
    messages: [
      {
        id: "msg-9",
        role: "user",
        content: "Show me some advanced TypeScript utility types",
        createdAt: daysAgo(2),
      },
      {
        id: "msg-10",
        role: "assistant",
        content: `Here are some powerful utility types beyond the basics:

\`\`\`typescript
// Deep partial - makes all nested properties optional
type DeepPartial<T> = {
  [P in keyof T]?: T[P] extends object
    ? DeepPartial<T[P]>
    : T[P];
};

// Extract all string keys from a nested object
type PathKeys<T> = T extends object
  ? { [K in keyof T & string]:
      T[K] extends object
        ? K | \`\${K}.\${PathKeys<T[K]>}\`
        : K
    }[keyof T & string]
  : never;

// Branded types for type-safe IDs
type Brand<T, B> = T & { __brand: B };
type UserId = Brand<string, "UserId">;
type PostId = Brand<string, "PostId">;

function getUser(id: UserId) { /* ... */ }
// getUser("abc")        // Error!
// getUser("abc" as UserId)  // OK
\`\`\`

These patterns help you **catch bugs at compile time** rather than runtime.`,
        model: MODELS[1],
        createdAt: daysAgo(2),
      },
    ],
  },
  {
    id: "conv-6",
    title: "Docker Compose for development",
    model: MODELS[3]!,
    createdAt: daysAgo(3),
    updatedAt: daysAgo(3),
    messages: [],
  },
  {
    id: "conv-7",
    title: "Optimizing React renders",
    model: MODELS[0]!,
    createdAt: daysAgo(5),
    updatedAt: daysAgo(5),
    messages: [],
  },
  {
    id: "conv-8",
    title: "Git rebase workflow",
    model: MODELS[2]!,
    createdAt: daysAgo(7),
    updatedAt: daysAgo(7),
    messages: [],
  },
  {
    id: "conv-9",
    title: "WebSocket real-time chat",
    model: MODELS[4]!,
    createdAt: daysAgo(10),
    updatedAt: daysAgo(10),
    messages: [],
  },
  {
    id: "conv-10",
    title: "Kubernetes deployment basics",
    model: MODELS[3]!,
    createdAt: daysAgo(14),
    updatedAt: daysAgo(14),
    messages: [],
  },
];

export function getConversationsByTimeGroup(conversations: Conversation[]) {
  const groups: { label: string; conversations: Conversation[] }[] = [];
  const todayStart = new Date(now);
  todayStart.setHours(0, 0, 0, 0);
  const yesterdayStart = new Date(todayStart.getTime() - 24 * 60 * 60 * 1000);
  const weekAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
  const monthAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);

  const today = conversations.filter((c) => c.updatedAt >= todayStart);
  const yesterday = conversations.filter(
    (c) => c.updatedAt >= yesterdayStart && c.updatedAt < todayStart,
  );
  const thisWeek = conversations.filter(
    (c) => c.updatedAt >= weekAgo && c.updatedAt < yesterdayStart,
  );
  const older = conversations.filter((c) => c.updatedAt < weekAgo);

  if (today.length > 0) groups.push({ label: "Today", conversations: today });
  if (yesterday.length > 0) groups.push({ label: "Yesterday", conversations: yesterday });
  if (thisWeek.length > 0) groups.push({ label: "Previous 7 days", conversations: thisWeek });
  if (older.length > 0) groups.push({ label: "Older", conversations: older });

  return groups;
}
