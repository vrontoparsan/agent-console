# Agent Console — Instructions for AI

## Quick Context
This is Agent Console — a Next.js 15 business management platform with AI-powered custom sections. Full documentation is in [`ai_context_document.md`](ai_context_document.md).

**Read `ai_context_document.md` before making any significant changes.** It contains the complete project architecture, database schema, API routes, patterns, and gotchas.

## Critical Rules

1. **Always update `ai_context_document.md`** when you make significant changes (new features, schema changes, new API routes, new components, architectural decisions). Keep it accurate and current.

2. **Never modify Core tables** (User, Event, EventCategory, etc.) via raw SQL. Use Prisma only.

3. **Custom tables** must use `cstm_` prefix and always include `id TEXT PRIMARY KEY DEFAULT gen_random_uuid()`, `created_at TIMESTAMPTZ DEFAULT NOW()`, `updated_at TIMESTAMPTZ DEFAULT NOW()`. They live in the `instance` PostgreSQL schema.

4. **Instance page code** must end with `var __default__ = ComponentName;` and must be fully responsive (mobile + desktop).

5. **Always run `npm run build`** before pushing to verify no TypeScript errors.

6. **Prisma generate locally** needs a DATABASE_URL env var: `DATABASE_URL="postgresql://x:x@localhost:5432/x" npx prisma generate`

7. **Deploy**: Push to `main` branch triggers auto-deploy on Railway. DB push runs in `start.sh`.

## Key Files
- Full AI context: `ai_context_document.md`
- Database schema: `prisma/schema.prisma`
- AI agent tools: `lib/agent-tools/db-tools.ts`
- Claude integration: `lib/claude.ts`
- Instance SDK: `lib/instance/sdk.tsx`, `lib/instance/sdk-components.tsx`
- JSX sandbox: `lib/instance/compile.ts`, `lib/instance/sandbox.tsx`
- UI Agent prompt: `lib/instance/configurator-prompt.ts`
