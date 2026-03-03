# Agent Bizi — Instructions for AI

## Quick Context
This is Agent Bizi — a **multi-tenant SaaS** business management platform (Next.js 15) with AI-powered custom sections. Full documentation is in [`ai_context_document.md`](ai_context_document.md).

**Read `ai_context_document.md` before making any significant changes.** It contains the complete project architecture, database schema, API routes, multi-tenancy patterns, and gotchas.

## Critical Rules

1. **Always update `ai_context_document.md`** when you make significant changes (new features, schema changes, new API routes, new components, architectural decisions). Keep it accurate and current.

2. **Never modify Core tables** (User, Event, EventCategory, etc.) via raw SQL. Use Prisma only.

3. **Always use `tenantPrisma(tenantId)`** or `requireTenantAuth()` for tenant-scoped queries. Never use raw `prisma` for tenant data.

4. **Custom tables** must use `cstm_` prefix and always include `id TEXT PRIMARY KEY DEFAULT gen_random_uuid()`, `created_at TIMESTAMPTZ DEFAULT NOW()`, `updated_at TIMESTAMPTZ DEFAULT NOW()`. They live in per-tenant PostgreSQL schemas (`tenant_{id}`).

5. **Instance page code** must end with `var __default__ = ComponentName;` and must be fully responsive (mobile + desktop).

6. **Always run `npm run build`** before pushing to verify no TypeScript errors.

7. **Prisma generate locally** needs a DATABASE_URL env var: `DATABASE_URL="postgresql://x:x@localhost:5432/x" npx prisma generate`

8. **Deploy**: Push to `main` branch triggers auto-deploy on Railway. DB push + tenant schema migration runs in `start.sh`.

## Key Files
- Full AI context: `ai_context_document.md`
- Database schema: `prisma/schema.prisma`
- Tenant Prisma extension: `lib/prisma-tenant.ts`
- API auth helpers: `lib/api-utils.ts`
- AI agent tools: `lib/agent-tools/db-tools.ts`
- Claude integration: `lib/claude.ts`
- Instance SDK: `lib/instance/sdk.tsx`, `lib/instance/sdk-components.tsx`
- JSX sandbox: `lib/instance/compile.ts`, `lib/instance/sandbox.tsx`
- UI Agent prompt: `lib/instance/configurator-prompt.ts`
