# Agent Bizi — AI Context Document

> **This document is for AI assistants, not humans.** It provides comprehensive context for any AI working on this codebase. **You MUST update this document when you make significant changes** (new features, schema changes, new API routes, architectural decisions).

Last updated: 2026-03-03

---

## What Is Agent Bizi?

Agent Bizi is a **multi-tenant SaaS business management platform** built as a **Next.js 15 web app** (also works as a mobile PWA). It helps companies manage events, communication, and custom business workflows through an AI-powered agent. Each company (tenant) gets fully isolated data and custom sections.

**Key characteristics:**
- Full-stack TypeScript app (Next.js 15 App Router + Prisma 6 + PostgreSQL)
- **Multi-tenant**: schema-per-tenant for custom tables, row-level isolation on shared Prisma tables
- AI-powered with Anthropic Claude (Sonnet 4.6) via OAuth
- Role-based access control (SUPERADMIN = platform admin, ADMIN = tenant admin, MANAGER = restricted user)
- Custom section system ("Instance Pages") where AI generates runtime-compiled React JSX
- Self-service signup with automatic tenant provisioning
- Email integration (IMAP polling + SMTP sending)
- Deployed on Railway with auto-deploy from GitHub

---

## Tech Stack

| Layer | Technology |
|-------|-----------|
| Framework | Next.js 15.3 (App Router, standalone output) |
| Language | TypeScript 5.7 |
| Database | PostgreSQL (via Prisma 6 ORM) |
| AI | Anthropic Claude Sonnet 4.6 (@anthropic-ai/sdk, OAuth + API key auth with failover) |
| Auth | NextAuth 5 (JWT + Credentials provider) |
| Styling | Tailwind CSS 4 + Radix UI + shadcn/ui |
| Icons | lucide-react |
| Email | imapflow (IMAP) + nodemailer (SMTP) + mailparser |
| Runtime JSX | sucrase (compilation) + Function constructor (sandbox) |
| Deploy | Railway (Docker, auto-deploy from GitHub push) |

---

## Project Structure

```
app/
  page.tsx                # Landing page (public, marketing)
  api/                    # REST API routes
    auth/                 # NextAuth endpoints
      signup/route.ts     # Self-service signup API (creates Tenant + User + schema)
    chat/route.ts         # Main chat (event-specific or general)
    cstm/route.ts         # Custom table CRUD (tenant schema)
    data/route.ts         # Data query endpoint
    events/               # Event CRUD + voice input
    files/parse/          # File parsing (PDF, DOCX, XLSX, images)
    instance/ai/          # Instance AI endpoint
    instance/email/       # Instance email sending
    pages/route.ts        # Custom pages list + create + delete + reorder (PATCH)
    pages/categories/     # Section categories CRUD + reorder
    settings/             # All settings endpoints (incl. ai-apis for API key management)
    superadmin/tenants/   # Tenant CRUD (SUPERADMIN only)
    ui-chat/route.ts      # UI Agent/page-editor chat with threads
    ui-chat/threads/      # Thread list for UI Agent
  (auth)/
    login/                # Login page
    signup/               # Self-service signup page
  (dashboard)/            # Protected tenant routes
    events/               # Events dashboard
    chat/                 # General chat
    data/                 # Data browser
    p/[slug]/             # Dynamic custom pages
    settings/             # All settings pages
      sections/           # Manage sections (DnD tree, categories, admin toggle)
  superadmin/             # Platform admin panel (SUPERADMIN only)
    page.tsx              # Tenant list + management
    layout.tsx            # Superadmin layout

components/
  ui/                     # shadcn/ui primitives (Button, Input, Badge, Card, etc.)
  layout/nav.tsx          # Sidebar navigation (role-aware)
  events/                 # Event components
  chat/chat-panel.tsx     # Main chat panel (persistent, with history)
  custom-page/
    agent-chat.tsx        # UI Agent chat (threaded, persistent)
    page-renderer.tsx     # Legacy JSON config renderer
    components/           # data-table, form, stats, text components

lib/
  anthropic.ts            # Centralized Anthropic client: per-tenant key loading, failover, cache
  api-utils.ts            # requireTenantAuth(), isAuthError(), requireAuth() helpers
  agent-tasks.ts          # In-memory active task registry (globalThis singleton)
  auth.ts                 # NextAuth config (tenantId in JWT)
  claude.ts               # AI functions: agenticChat, generateActions, classifyEmail, composeReply
  prisma.ts               # Prisma singleton
  prisma-tenant.ts        # tenantPrisma(tenantId) Prisma Client Extension, getTenantSchema()
  utils.ts                # cn() helper
  agent-tools/db-tools.ts # All AI agent tools (DB, Page, SQL, Instance)
  email/                  # IMAP poller, reply composer, poll scheduler
  instance/
    compile.ts            # Sucrase JSX compilation + security checks
    sandbox.tsx           # Function constructor sandbox + ErrorBoundary
    sdk.tsx               # SDK hooks: useCstmQuery, useCstmMutation, useAI, sdk.*
    sdk-components.tsx    # SDK UI components for Instance pages
    configurator-prompt.ts # Expert system prompt for UI Agent

prisma/schema.prisma      # All database models (incl. Tenant)
scripts/
  migrate-tenant-schemas.ts  # Per-tenant schema creation, legacy instance→tenant migration
  migrate-instance-schema.ts # Legacy (kept for backward compat)
middleware.ts             # Auth guard with public/platform/tenant zones
instrumentation.ts        # Email polling startup
start.sh                  # Railway startup script
Dockerfile                # Multi-stage Docker build
```

---

## Database Architecture

### PostgreSQL Schema Strategy

1. **`public` schema** — Core app tables managed by Prisma (Tenant, User, Event, Message, CustomPage, etc.). Shared tables use row-level isolation via `tenantId` column.
2. **`tenant_{id}` schemas** (one per tenant) — Custom tables created by AI/users (prefixed `cstm_`). Auto-qualified by `qualifyInstanceTables()` in db-tools.ts using `getTenantSchema(tenantId)`.

> **Replaced**: The old single `instance` schema has been replaced by per-tenant schemas (`tenant_{id}`). The migration script renames `instance` to `tenant_{firstTenantId}` on first run.

### Key Models

**Tenant** — name, slug (unique), plan, active, company fields (companyName, ico, dic, icDph, address, email, phone, web), extra (JSON: aiApiKeys, allowAdminUIAgent, emailSettings). **Absorbs the old CompanyInfo fields.** All tenant-scoped models have a `tenantId` FK pointing here.

**User** — email, name, password (bcrypt), role (SUPERADMIN/ADMIN/MANAGER), tenantId? (null for SUPERADMIN). Unique constraint: `@@unique([email, tenantId])` — same email can exist in different tenants.

**Event** — title, summary, rawContent, source, type (PLUS/MINUS), status (NEW/IN_PROGRESS/RESOLVED/ARCHIVED), priority, categoryId, assignedTo, emailAccountId, senderEmail, metadata, tenantId

**Message** — content, role (user/assistant), eventId? (event chat), customPageId? (UI Agent thread), threadId? (temp thread for new sections), userId?, metadata (toolEvents for UI Agent), tenantId

**CustomPage** — slug, title, icon?, config (JSON for legacy components), code? (JSX for Instance pages), published (defaults true for new sections), order, categoryId? (→ SectionCategory), tenantId. Unique constraint: `@@unique([slug, tenantId])`.

**Snapshot** — label, parentId? (tree structure), customPageId?, codeState (JSON: all page codes), schemaDdl (Text: tenant schema DDL), dataFile? (path to gzip dump), dataHash? (SHA-256 for dedup), dataSize, isCurrent (only one active), tenantId

**SectionCategory** — name, order (for sidebar grouping of custom pages), tenantId

**EventAction** — eventId, title, description, status (SUGGESTED→COMPLETED), aiSuggested, result, tenantId

**EmailAccount** — IMAP + SMTP credentials, enabled, lastPolledAt, lastError, tenantId

**AgentContext** — name, type (PERMANENT/CONDITIONAL), content (markdown), enabled, order, tenantId

**CompanyInfo** — *(kept for migration backward compat, will be dropped later)*. Singleton id="default".

**CronJob** — name, schedule, action, enabled, lastRun, nextRun, tenantId

**Access tables** — UserCategoryAccess, UserEmailAccountAccess, UserPageAccess (junction tables for MANAGER permissions)

---

## Multi-Tenancy Architecture

### Isolation Strategy
Agent Bizi uses a **hybrid isolation** model:
- **Shared tables** (Prisma models): Row-level isolation via `tenantId` column on every tenant-scoped model. Enforced by `tenantPrisma(tenantId)` Prisma Client Extension.
- **Custom tables** (`cstm_*`): Schema-level isolation. Each tenant gets its own PostgreSQL schema (`tenant_{tenantId}`) for complete DDL/data separation.

### Key Components

**`lib/prisma-tenant.ts`** — `tenantPrisma(tenantId)`:
- Returns a Prisma client extension that auto-injects `tenantId` filter on all operations (findMany, findFirst, create, update, delete, count, aggregate)
- `findUnique` post-checks tenantId on the result (can't add WHERE on unique queries)
- `create`/`createMany` auto-sets tenantId on new records
- Scoped models: User, Event, EventCategory, EmailAccount, EventAction, Message, CustomPage, SectionCategory, AgentContext, CronJob, Snapshot

**`lib/prisma-tenant.ts`** — `getTenantSchema(tenantId)`:
- Returns `tenant_{tenantId}` — the PostgreSQL schema name for custom tables

**`lib/api-utils.ts`** — `requireTenantAuth()`:
- Standard auth guard for all tenant API routes
- Returns `{ session, tenantId, tenantSchema, db, role }` or `{ error: NextResponse }`
- `isAuthError()` type guard for checking the result
- `requireAuth()` — lighter variant that allows SUPERADMIN (no tenant context)

### Tenant Lifecycle
1. **Signup**: `POST /api/auth/signup` → creates `Tenant` + `User(role=ADMIN)` + `CREATE SCHEMA tenant_{id}`
2. **Runtime**: Every API request extracts `tenantId` from JWT → `tenantPrisma(tenantId)` scopes all queries
3. **Custom tables**: SQL operations use `qualifyInstanceTables(sql, getTenantSchema(tenantId))` to rewrite `cstm_*` → `tenant_{id}.cstm_*`
4. **AI keys**: Loaded from `Tenant.extra.aiApiKeys` with per-tenant caching in `lib/anthropic.ts`
5. **Snapshots**: Stored in `/data/tenants/{tenantId}/snapshots/`, pg_dump scoped to `tenant_{id}` schema

### Migration from Single-Tenant
- `seed.js` creates a default Tenant and migrates existing User/Event/etc. records by setting their `tenantId`
- `scripts/migrate-tenant-schemas.ts` renames the legacy `instance` schema to `tenant_{firstTenantId}`, creates schemas for any additional tenants, and moves stray `cstm_*` tables from `public`
- `CompanyInfo` model kept temporarily for backward compat; its fields are now on the `Tenant` model

---

## Authentication & Authorization

- **NextAuth 5** with JWT strategy (no session DB)
- Credentials provider (email + password)
- **JWT contains `tenantId`** — set during login from `User.tenantId`, propagated to session via callbacks
- Session-based routing: all tenants share the same URL space (no subdomain/path prefix per tenant)
- `requireTenantAuth()` helper in `lib/api-utils.ts` returns `{session, tenantId, tenantSchema, db, role}` — use in all tenant API routes

### Middleware Zones (`middleware.ts`)
1. **Public** — `/`, `/login`, `/signup`, `/api/auth/*` — no auth required. Logged-in users redirected: SUPERADMIN → `/superadmin`, others → `/events`.
2. **Platform** — `/superadmin/*`, `/api/superadmin/*` — SUPERADMIN only. Non-SUPERADMIN redirected to `/events`.
3. **Tenant** — everything else — requires authentication + tenantId in session.

### Roles
- **SUPERADMIN** — platform-level admin. `tenantId: null`. Manages tenants via `/superadmin`. No tenant data access (no tenantId in session).
- **ADMIN** — tenant admin. Full access within their tenant: agentic chat with DB tools, page management, UI Agent access, settings.
- **MANAGER** — restricted user within tenant: only sees assigned categories/email accounts/pages, agentic chat with DB tools (max 3 record updates, no delete)

### Signup Flow
1. User fills `/signup` form (company name, email, password)
2. `POST /api/auth/signup` creates Tenant (slug from company name) + User (role=ADMIN) + PostgreSQL schema (`tenant_{id}`)
3. User redirected to `/login`

---

## AI Client Architecture (`lib/anthropic.ts`)

### Centralized Client with Per-Tenant Key Caching
All Anthropic API calls go through a centralized client module (`lib/anthropic.ts`). No file should create `new Anthropic()` directly.

- **Key storage**: `Tenant.extra.aiApiKeys` — array of `{label, token}` (up to 3 slots per tenant)
- **Per-tenant cache**: `Map<tenantId, TenantCache>` on globalThis. Each tenant gets independent key rotation. Cache key `"__default__"` used when no tenantId (legacy/migration compat).
- **Env fallback**: If no DB keys found for the tenant, falls back to `ANTHROPIC_OAUTH_TOKEN` env var
- **Key type detection**: Tokens starting with `sk-ant-oat` → OAuth token (`authToken` + `anthropic-beta: oauth-2025-04-20` header); all other tokens → API key (`apiKey`). Important: both OAuth and API keys share the `sk-ant-` prefix, so must check for `sk-ant-oat` specifically.
- **Failover**: `withFailover()` helper in `claude.ts` catches 401/403 errors and rotates to next configured key (up to 3 attempts)
- **Cache TTL**: 60s per tenant (globalThis singleton survives hot-reloads)
- **Management**: Settings → AI APIs (ADMIN only within tenant) — 3 key slots: primary + 2 backups
- **API**: `getAnthropicClient(tenantId?)`, `failoverToNextKey(tenantId?)`, `invalidateKeyCache(tenantId?)`

---

## AI Agent System

### How agenticChat Works (`lib/claude.ts`)

```
1. Receive user message(s) + system prompt + tools
2. Loop (max 25 iterations):
   a. Call Claude with messages + tools (client from getAnthropicClient())
   b. If stop_reason = "tool_use": execute tools, add results to history, call onLoopComplete, continue
   c. If stop_reason = "max_tokens" with no tools: ask Claude to continue
   d. If stop_reason = "end_turn": break
3. Return final text
```

- **max_tokens**: 32768
- **model**: claude-sonnet-4-6
- **Auth**: Centralized via `lib/anthropic.ts` (supports both OAuth and API keys with failover)
- **Tool result size limit**: 8000 chars
- **onLoopComplete callback**: Called after each tool loop iteration for intermediate progress saves

### Available Tools

**DB Tools** — query_data, count_records, create_record, update_records, delete_records
**Page Tools** — create_page, update_page, get_page, list_pages, delete_page
**Instance Page Tools** — create_instance_page, update_instance_page_code, get_instance_page, verify_instance_code, introspect_table, list_instance_pages_code, create_snapshot
**SQL Tools** — execute_sql (SUPERADMIN only)

**verify_instance_code** — Runs Sucrase compilation + security checks on JSX code. Agent MUST call this after every code write/update. Returns `{ok: true}` or `{ok: false, error: "..."}`. If error, agent fixes and re-verifies.

**introspect_table** — Returns column schema (name, type, default, nullable) for a custom table. Agent uses this before writing code that references custom tables.

**list_instance_pages_code** — Lists existing Instance pages with code snippets (max 5 pages, 150 lines each). Agent calls this before creating new pages to learn patterns and maintain consistency.

**create_snapshot** — Creates a versioned snapshot of all page code + instance database state. Agent MUST call this after every code or schema change. Label should describe what changed. Uses pg_dump with SHA-256 deduplication.

### Agentic Quality Features

1. **Self-correction loop** — Agent verifies code after every write. If compilation fails, it reads the error, fixes, and re-verifies (up to 3 attempts).
2. **Incremental creation** — Agent builds pages step by step: basic DataTable → verify → add CRUD → verify → polish → verify.
3. **Learning from existing pages** — Before creating new pages, agent reads existing page code for pattern/style consistency.
4. **Runtime error reporting** — ErrorBoundary in sandbox.tsx has "Oprav chybu" button that auto-opens page editor chat with error context. Agent receives the runtime error message and runs full diagnostic flow.
5. **Error diagnosis** — When user reports "it doesn't work", agent automatically: reads code → verifies → introspects tables → analyzes for common issues → fixes.

### Two Chat Contexts

1. **Main Chat** (`/api/chat`) — general business data assistant. Agentic mode with DB tools for ALL roles (query, create, update, delete). Role-based permissions: MANAGER limited to 3 records, no delete; ADMIN/SUPERADMIN full access. No page/SQL tools. History: 80 messages. Persistent via Message model with eventId.
2. **UI Chat** (`/api/ui-chat`) — UI Agent (SUPERADMIN only) and page-editor, persistent via Message model with customPageId, threaded per section. Has full tool suite: DB + Page + Instance Page + SQL (SUPERADMIN). Supports file attachments (PDF, CSV, XLSX, XML, images) and image vision via multi-content messages. **Page-editor context**: when editing an existing page, `create_instance_page` tool is removed — agent must use `update_instance_page_code`. The `update_instance_page_code` tool supports `published` parameter. System prompt explicitly forbids creating new pages in page-editor context. After DB schema changes, agent must check cross-section impact.

### Background Processing (`/api/ui-chat`)

UI Agent processing continues in the background even when the user navigates away or refreshes:

1. **Fire-and-forget**: `agenticChat` runs in a detached async IIFE inside `ReadableStream.start()` — NOT awaited. Stream closure doesn't abort processing.
2. **`safeEnqueue()` wrapper**: Catches errors when stream is closed, prevents stream errors from aborting background work.
3. **Intermediate saves**: `onLoopComplete` callback saves partial progress to DB (Message content + toolEvents) after each tool loop.
4. **Active task registry** (`lib/agent-tasks.ts`): In-memory `Map<messageId, {startedAt}>` via globalThis — tracks running tasks to distinguish "still working" from "stuck after restart".
5. **Staleness detection**: GET handler checks last assistant message: if `processing: true` for >150s AND not in `activeTasks` → auto-resolves as timed out.
6. **Client polling**: On mount, if last message has `metadata.processing === true`, client polls GET every 3s for updates. Shows intermediate progress.
7. **Message queue**: Messages sent while agent is busy go to client-side queue with "Čaká..." indicator. Auto-sent when current task completes.
8. **Message metadata**: `{ processing: boolean, processingStartedAt: ISO, error?: boolean, timedOut?: boolean, toolEvents?: string[] }`

---

## Instance Pages System (Custom Sections)

This is the most complex subsystem. Companies get custom UI sections without modifying Core code.

### Architecture
```
User describes UI → UI Agent writes JSX → Stored in CustomPage.code →
User opens page → Sucrase compiles JSX → Function constructor sandbox →
React component renders with SDK hooks and components
```

### Security
- **Blocked patterns** (compile.ts): import(), require(), eval(), new Function(), window, document, fetch, localStorage, sessionStorage, XMLHttpRequest, globalThis
- **Sandbox**: Function constructor with controlled scope — only SDK-provided names are available
- **ErrorBoundary**: Runtime errors don't crash the Core app

### SDK (available in Instance code scope)
- **Hooks**: useCstmQuery(table, options), useCstmMutation(table), useAI(), useVoice(options?), useCamera()
- **Components**: Button, Input, Badge, Card/CardHeader/CardTitle/CardDescription/CardContent, DataTable, StatCard, Select, Tabs, LoadingSpinner, EmptyState
- **Utilities**: sdk.notify(), sdk.navigate(), sdk.formatDate(), sdk.formatDateTime(), sdk.formatCurrency(), sdk.formatNumber(), sdk.download(), sdk.sendEmail()
- **Convention**: Code must end with `var __default__ = ComponentName;`

### Document Scanning (useCamera + useAI with images)

Instance pages can capture photos and extract data using AI vision:

1. **`useCamera()`** — Opens native camera (mobile rear cam) or file picker (desktop). Returns `{ capture, image, loading, error, clear }`. Image is auto-resized to max 1600px JPEG.
2. **`useAI().ask(prompt, { images: [base64] })`** — Sends images to Claude vision via `/api/instance/ai`. Max 3 images, 10MB each. `max_tokens: 12288`.
3. **Flow**: `capture()` → preview → `ai.ask("Extract...", { images: [camera.image] })` → parse JSON → fill form → save to DB.
4. **No file storage** — images are processed in memory and discarded. Only extracted data is persisted in cstm_ tables.
5. **API**: `/api/instance/ai` accepts `{ prompt, context?, images?: string[] }`. Images are raw base64 (no data URL prefix).

### Custom Tables
- Prefix: always `cstm_` (e.g., cstm_orders, cstm_products)
- Required columns: id (TEXT PK, gen_random_uuid()), created_at, updated_at
- Live in per-tenant PostgreSQL schema (`tenant_{tenantId}`) — fully isolated between tenants
- `qualifyInstanceTables(sql, tenantSchema)` rewrites `cstm_xxx` to `tenant_{id}.cstm_xxx` in SQL
- CRUD via `/api/cstm` endpoint

### UI Agent Threading
- Each CustomPage has its own conversation thread (Message.customPageId)
- New sections use temporary threadId until page is created
- When agent creates page, orphan messages auto-link to new page
- Page editor (wand button on pages, right-side panel) shares the same thread
- Wand button visible to SUPERADMIN only
- Sections managed in `/settings/sections` with drag-and-drop tree (uses @dnd-kit)
- Sections can be organized into collapsible categories (SectionCategory model)
- Sidebar groups sections by category with collapsible headers (localStorage state)
- History loaded on mount, full context sent to agent (80 messages)
- System prompt includes current page code inline

---

## Email Integration

### Inbound (IMAP)
1. `instrumentation.ts` starts poll scheduler on server boot
2. Polls every 2 minutes for each enabled EmailAccount
3. Fetches unseen emails, classifies with AI (PLUS/MINUS), creates Events
4. Generates 2-4 suggested actions per event
5. Prevents duplicates via metadata.messageId

### Outbound (SMTP)
- `composeEmailReply()` in claude.ts generates professional replies
- Uses configured SMTP accounts
- Includes company context, category guidelines, signature
- Instance pages can send emails via `sdk.sendEmail()`

---

## Streaming Protocol

Chat APIs stream responses as newline-delimited text:

```
event:{"type":"tool","data":"execute_sql: {\"sql\":\"CREATE TABLE..."}
event:{"type":"tool","data":"create_instance_page: {\"slug\":\"orders\"..."}
pageCreated:{"id":"clxx...","slug":"orders","title":"Orders"}
result:Your orders page has been created! It's now visible in the sidebar.
```

- `text:` — real-time text delta (JSON-encoded string), streamed word-by-word
- `event:` — tool execution notification (shown as pill badges in UI)
- `pageCreated:` — signals new page creation (UI Agent switches thread)
- `result:` — final assistant text response (used for DB persistence)
- `error:` — error message

---

## Deployment

- **Platform**: Railway
- **Auto-deploy**: Push to `main` branch on GitHub → Railway builds Docker image → deploys
- **Start sequence** (start.sh): `mkdir -p /data/tenants /data/uploads` → `prisma db push` → `seed.js` (migrates legacy data to default tenant) → `migrate-tenant-schemas.ts` (creates per-tenant schemas, renames `instance` → `tenant_*`) → `server.js`
- **DB**: PostgreSQL on Railway (internal URL, not accessible from outside)
- **Volume**: /data for uploads and per-tenant snapshots

### File Storage
- Per-tenant directories: `/data/tenants/{tenantId}/snapshots/` for data dumps
- Shared: `/data/uploads/` for file uploads

### Key Environment Variables
```
DATABASE_URL              # PostgreSQL connection string
ANTHROPIC_OAUTH_TOKEN     # Claude API auth (fallback if no tenant DB keys configured)
NEXTAUTH_SECRET           # JWT signing secret
NEXTAUTH_URL              # App URL (for NextAuth)
ADMIN_PASSWORD            # Initial admin password
```

---

## Snapshot System

Instance pages and custom database tables are versioned via snapshots. The UI Agent creates snapshots automatically after making changes. Snapshots are tenant-scoped.

- **Model**: `Snapshot` in Prisma — stores code state (JSON), tenant schema DDL, references compressed data dump files, tenantId
- **Storage**: Data dumps in `/data/tenants/{tenantId}/snapshots/` as gzip-compressed pg_dump output. Never deleted.
- **Deduplication**: SHA-256 hash of data dump. Code-only changes reuse the previous data file.
- **Tree structure**: `parentId` self-reference supports branching (rollback + new change = new branch)
- **Agent tool**: `create_snapshot(label)` — mandatory after code or schema changes
- **Restore**: Creates auto-backup first, then restores code + drops/recreates tenant schema (`tenant_{id}`)
- **UI**: Settings > Backup & Snapshots — timeline view with restore buttons
- **API**: `GET/POST /api/settings/snapshots`, `POST /api/settings/snapshots/[id]/restore`
- **Service**: `lib/snapshots.ts` — `createSnapshot(tenantId)` and `restoreSnapshot(id, tenantId)` use `getTenantSchema(tenantId)` for pg_dump/restore

---

## Important Patterns & Conventions

1. **Schema changes**: Use `prisma db push` (not migrations). Schema is in `prisma/schema.prisma`.
2. **Custom tables**: Always prefix with `cstm_`, always include id/created_at/updated_at.
3. **API routes**: Follow Next.js App Router convention. Use `requireTenantAuth()` from `lib/api-utils.ts` for tenant routes. Check `isAuthError()` before proceeding.
4. **Tenant scoping**: All shared-table queries MUST go through `tenantPrisma(tenantId)` — never use raw `prisma` for tenant data. The Prisma extension auto-injects `tenantId` on all CRUD operations.
5. **Sensitive fields**: Passwords and SMTP passwords are masked in API responses via sanitizeRecord().
6. **Tool descriptions**: Include usage examples for AI agents in tool description strings.
7. **Instance code convention**: Must end with `var __default__ = ComponentName;`
8. **Responsive design**: All UI must work on mobile (375px) and desktop. Use Tailwind mobile-first breakpoints.
9. **Core protection**: Never modify Core tables (User, Event, etc.) via raw SQL. Use Prisma.
10. **qualifyInstanceTables()**: Auto-rewrites `cstm_xxx` to `tenant_{id}.cstm_xxx` in SQL (takes `tenantSchema` param).
11. **Build check**: Always run `npm run build` before pushing. Prisma generate needs dummy DATABASE_URL locally.

---

## Chat UI Features

- **Markdown rendering** — Assistant messages are rendered with `react-markdown` via `components/chat/markdown.tsx`. Supports headings, lists, code blocks, tables, links, blockquotes. User messages stay plain text.
- **Real-time text streaming** — Agent responses stream word-by-word via `text:` events in the streaming protocol. Both UI Agent and general chat.
- **Persistent loading indicator** — "Agent pracuje..." status bar visible during entire agent processing (tool calls, code generation, verification).
- **Tool event badges** — Tool executions shown as inline pills on assistant messages (Wrench icon + tool name + truncated input).
- **Runtime error reporting** — ErrorBoundary in sandbox.tsx has "Oprav chybu" button that auto-opens page editor chat with error message → agent auto-diagnoses and fixes.

---

## Things to Watch Out For

- **Always use `tenantPrisma()`**: Never query tenant-scoped models with raw `prisma` — data will leak between tenants. Use `requireTenantAuth()` which returns a scoped `db`.
- **SUPERADMIN has no tenantId**: Platform admin routes must not call `requireTenantAuth()`. Use `requireAuth()` instead.
- **User.email not globally unique**: The unique constraint is `@@unique([email, tenantId])`. Login uses `findFirst` not `findUnique`.
- **Custom table SQL**: Always pass `tenantSchema` to `qualifyInstanceTables()` — forgetting this will try to access tables in the wrong schema.
- **JSDoc comments with `*/`**: If you write `cstm_*/custom_*` inside a `/** */` comment, the `*/` will close the comment prematurely. Use `//` line comments instead.
- **Prisma generate locally**: Needs `DATABASE_URL` env var even if the DB isn't accessible. Use a dummy URL: `DATABASE_URL="postgresql://x:x@localhost:5432/x" npx prisma generate`
- **nodemailer types**: `createTransport()` needs `as nodemailer.TransportOptions` cast for the host config.
- **Token limits**: agenticChat uses 32768 max_tokens. Long JSX code might still approach this — the system auto-continues if truncated.
- **Railway CLI**: May not be authenticated. Use API token for Railway GraphQL API instead.
- **IMAP errors**: The `[IMAP] Poll error` logs for test accounts are expected, not bugs.

---

## File Quick Reference

| What | Where |
|------|-------|
| Prisma schema | `prisma/schema.prisma` |
| Tenant Prisma extension | `lib/prisma-tenant.ts` |
| API auth helpers | `lib/api-utils.ts` |
| Anthropic client (per-tenant) | `lib/anthropic.ts` |
| Claude AI functions | `lib/claude.ts` |
| Active task registry | `lib/agent-tasks.ts` |
| All agent tools | `lib/agent-tools/db-tools.ts` |
| Auth configuration (JWT+tenantId) | `lib/auth.ts` |
| Middleware (zone routing) | `middleware.ts` |
| Instance SDK hooks | `lib/instance/sdk.tsx` |
| Instance UI components | `lib/instance/sdk-components.tsx` |
| JSX compiler | `lib/instance/compile.ts` |
| JSX sandbox | `lib/instance/sandbox.tsx` |
| UI Agent prompt | `lib/instance/configurator-prompt.ts` |
| Landing page | `app/page.tsx` |
| Signup page | `app/(auth)/signup/page.tsx` |
| Signup API | `app/api/auth/signup/route.ts` |
| Superadmin panel | `app/superadmin/page.tsx` |
| Tenant CRUD API | `app/api/superadmin/tenants/route.ts` |
| Instance AI API (+ vision) | `app/api/instance/ai/route.ts` |
| Main chat API | `app/api/chat/route.ts` |
| UI Agent chat API | `app/api/ui-chat/route.ts` |
| Custom table CRUD API | `app/api/cstm/route.ts` |
| Pages + categories API | `app/api/pages/route.ts`, `app/api/pages/categories/route.ts` |
| Sidebar navigation | `components/layout/nav.tsx` |
| AgentChat component | `components/custom-page/agent-chat.tsx` |
| Manage sections (DnD) | `app/(dashboard)/settings/sections/page.tsx` |
| AI APIs settings | `app/(dashboard)/settings/ai-apis/page.tsx` |
| AI APIs API | `app/api/settings/ai-apis/route.ts` |
| Snapshot service | `lib/snapshots.ts` |
| Snapshot API | `app/api/settings/snapshots/route.ts` |
| Snapshot restore API | `app/api/settings/snapshots/[id]/restore/route.ts` |
| Backup & Snapshots UI | `app/(dashboard)/settings/backup/page.tsx` |
| Main chat panel | `components/chat/chat-panel.tsx` |
| Markdown renderer | `components/chat/markdown.tsx` |
| Tenant schema migration | `scripts/migrate-tenant-schemas.ts` |
| Dockerfile | `Dockerfile` |
| Startup script | `start.sh` |

---

## Recent Changes (2026-03-03)

### Multi-Tenant SaaS Conversion (MAJOR)
Converted from single-tenant "Agent Console" to multi-tenant SaaS "Agent Bizi". Key changes:
- **Tenant model** absorbs CompanyInfo fields. All shared models gain `tenantId` column with indexes.
- **`tenantPrisma(tenantId)`** Prisma Client Extension auto-scopes all queries (lib/prisma-tenant.ts)
- **`requireTenantAuth()`** standard API guard returns `{session, tenantId, tenantSchema, db, role}` (lib/api-utils.ts)
- **Per-tenant PostgreSQL schemas** (`tenant_{id}`) replace the single `instance` schema for custom tables
- **Auth**: `tenantId` stored in JWT, propagated to session. `User.email` unique per tenant, not globally.
- **Roles**: SUPERADMIN = platform admin (tenantId: null), ADMIN = tenant admin (full access), MANAGER = restricted user
- **New routes**: `/` landing page, `/signup`, `/superadmin`, `/api/auth/signup`, `/api/superadmin/tenants`
- **Middleware zones**: Public (/, /login, /signup), Platform (/superadmin/*), Tenant (everything else)
- **AI keys**: Per-tenant key caching from `Tenant.extra.aiApiKeys` in `lib/anthropic.ts`
- **File storage**: Per-tenant dirs at `/data/tenants/{tenantId}/snapshots/`
- **Migration**: `seed.js` migrates legacy data to default tenant, `start.sh` runs `migrate-tenant-schemas.ts`
- **`qualifyInstanceTables()`** now takes `tenantSchema` param, rewrites to `tenant_{id}.cstm_*`

### Snapshot System
Full versioning for Instance pages + custom database tables. UI Agent creates snapshots after every code/schema change. Users can rollback to any previous state via Settings > Backup & Snapshots. Restoring auto-backups current state first, then restores code + drops/recreates tenant schema from snapshot. Data dumps are SHA-256 deduplicated — code-only changes reuse the previous data file. Snapshots never deleted. Tree structure via `parentId` supports branching (rollback + new change = new branch). Files: `lib/snapshots.ts`, `app/api/settings/snapshots/`, `prisma/schema.prisma` (Snapshot model).

### UI Agent Page-Editor Hardening
**Problem:** UI Agent was creating NEW pages instead of editing the current one when opened in page-editor context.
**Fix (3-layer defense):**
1. `PAGE_EDITOR_CONTEXT` in `configurator-prompt.ts` rewritten with explicit "NEVER call create_instance_page" rules
2. `create_instance_page` tool physically removed from available tools in page-editor context (`route.ts` line 194-196)
3. `pageContext` in system prompt now repeats the slug multiple times and says "DO NOT CREATE A NEW PAGE"
4. `update_instance_page_code` gained `published` parameter so agent can publish pages without create

### Cross-Section Impact Check
After ANY DB schema change (CREATE/ALTER/DROP TABLE), agent must call `list_instance_pages_code`, identify affected sections, and ask user before modifying other sections. Added to `configurator-prompt.ts`.

### OAuth Token Classification Fix
**Problem:** `createClient()` in `lib/anthropic.ts` used `token.startsWith("sk-ant-")` to detect API keys, but OAuth tokens (`sk-ant-oat01-...`) also match this prefix, causing `authentication_error: invalid x-api-key`.
**Fix:** Changed to `token.startsWith("sk-ant-oat")` for OAuth detection. OAuth: `sk-ant-oat01-...`, API key: `sk-ant-api03-...`.

### PageRenderer Empty Config Fix
**Problem:** Pages with `code: null` and `config: {}` crashed on `config.components.map()` (undefined).
**Fix:** `PageRenderer` now defaults to `components = config.components || []` with empty state UI.

### New Sections Default to Published
**Problem:** POST `/api/pages` created sections with `published: false`, so they didn't appear in sidebar even after creating.
**Fix:** Changed default to `published: true`.

### Settings UI Translated to English
All Slovak text in `settings/sections/page.tsx` and `settings/page.tsx` translated to English for consistency.
