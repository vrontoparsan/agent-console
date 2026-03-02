# Agent Console — AI Context Document

> **This document is for AI assistants, not humans.** It provides comprehensive context for any AI working on this codebase. **You MUST update this document when you make significant changes** (new features, schema changes, new API routes, architectural decisions).

Last updated: 2026-03-02

---

## What Is Agent Console?

Agent Console is a **business management platform** built as a **Next.js 15 web app** (also works as a mobile PWA). It helps companies manage events, communication, and custom business workflows through an AI-powered agent.

**Key characteristics:**
- Full-stack TypeScript app (Next.js 15 App Router + Prisma 6 + PostgreSQL)
- AI-powered with Anthropic Claude (Sonnet 4.6) via OAuth
- Role-based access control (SUPERADMIN, ADMIN, MANAGER)
- Custom section system ("Instance Pages") where AI generates runtime-compiled React JSX
- Email integration (IMAP polling + SMTP sending)
- Deployed on Railway with auto-deploy from GitHub

---

## Tech Stack

| Layer | Technology |
|-------|-----------|
| Framework | Next.js 15.3 (App Router, standalone output) |
| Language | TypeScript 5.7 |
| Database | PostgreSQL (via Prisma 6 ORM) |
| AI | Anthropic Claude Sonnet 4.6 (@anthropic-ai/sdk, OAuth auth) |
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
  api/                    # REST API routes
    auth/                 # NextAuth endpoints
    chat/route.ts         # Main chat (event-specific or general)
    cstm/route.ts         # Custom table CRUD (instance schema)
    data/route.ts         # Data query endpoint
    events/               # Event CRUD + voice input
    files/parse/          # File parsing (PDF, DOCX, XLSX, images)
    instance/ai/          # Instance AI endpoint
    instance/email/       # Instance email sending
    pages/route.ts        # Custom pages list
    settings/             # All settings endpoints
    ui-chat/route.ts      # Configurator/page-editor chat with threads
    ui-chat/threads/      # Thread list for configurator
  (auth)/login/           # Login page
  (dashboard)/            # Protected routes
    events/               # Events dashboard
    chat/                 # General chat
    data/                 # Data browser
    p/[slug]/             # Dynamic custom pages
    settings/             # All settings pages
      ui-configurator/    # Custom section builder

components/
  ui/                     # shadcn/ui primitives (Button, Input, Badge, Card, etc.)
  layout/nav.tsx          # Sidebar navigation (role-aware)
  events/                 # Event components
  chat/chat-panel.tsx     # Main chat panel (persistent, with history)
  custom-page/
    agent-chat.tsx        # Configurator chat (threaded, persistent)
    page-renderer.tsx     # Legacy JSON config renderer
    components/           # data-table, form, stats, text components

lib/
  auth.ts                 # NextAuth config
  claude.ts               # Anthropic SDK: streamChat, agenticChat, generateActions, classifyEmail, composeReply
  prisma.ts               # Prisma singleton
  utils.ts                # cn() helper
  agent-tools/db-tools.ts # All AI agent tools (DB, Page, SQL, Instance)
  email/                  # IMAP poller, reply composer, poll scheduler
  instance/
    compile.ts            # Sucrase JSX compilation + security checks
    sandbox.tsx           # Function constructor sandbox + ErrorBoundary
    sdk.tsx               # SDK hooks: useCstmQuery, useCstmMutation, useAI, sdk.*
    sdk-components.tsx    # SDK UI components for Instance pages
    configurator-prompt.ts # Expert system prompt for configurator agent

prisma/schema.prisma      # All database models
scripts/                  # Migration scripts
middleware.ts             # Auth guard
instrumentation.ts        # Email polling startup
start.sh                  # Railway startup script
Dockerfile                # Multi-stage Docker build
```

---

## Database Architecture

### Two PostgreSQL Schemas

1. **`public` schema** — Core app tables managed by Prisma (User, Event, Message, CustomPage, etc.)
2. **`instance` schema** — Custom tables created by AI/users (prefixed `cstm_`). Auto-qualified by `qualifyInstanceTables()` in db-tools.ts.

### Key Models

**User** — email, name, password (bcrypt), role (SUPERADMIN/ADMIN/MANAGER)

**Event** — title, summary, rawContent, source, type (PLUS/MINUS), status (NEW/IN_PROGRESS/RESOLVED/ARCHIVED), priority, categoryId, assignedTo, emailAccountId, senderEmail, metadata

**Message** — content, role (user/assistant), eventId? (event chat), customPageId? (configurator thread), threadId? (temp thread for new sections), userId?, metadata (toolEvents for configurator)

**CustomPage** — slug (unique), title, icon?, config (JSON for legacy components), code? (JSX for Instance pages), published, order

**EventAction** — eventId, title, description, status (SUGGESTED→COMPLETED), aiSuggested, result

**EmailAccount** — IMAP + SMTP credentials, enabled, lastPolledAt, lastError

**AgentContext** — name, type (PERMANENT/CONDITIONAL), content (markdown), enabled, order

**CompanyInfo** — name, ico, dic, icDph, address, email, phone, web, extra (singleton id="default")

**CronJob** — name, schedule, action, enabled, lastRun, nextRun

**Access tables** — UserCategoryAccess, UserEmailAccountAccess, UserPageAccess (junction tables for MANAGER permissions)

---

## Authentication & Authorization

- **NextAuth 5** with JWT strategy (no session DB)
- Credentials provider (email + password)
- Middleware redirects unauthenticated users to `/login`

### Roles
- **SUPERADMIN** — full access, agentic chat with tools, SQL execution, page management
- **ADMIN** — full access, agentic chat with tools (no raw SQL)
- **MANAGER** — restricted: only sees assigned categories/email accounts/pages, max 3 record updates, no delete, no SQL

---

## AI Agent System

### How agenticChat Works (`lib/claude.ts`)

```
1. Receive user message(s) + system prompt + tools
2. Loop (max 25 iterations):
   a. Call Claude with messages + tools
   b. If stop_reason = "tool_use": execute tools, add results to history, continue
   c. If stop_reason = "max_tokens" with no tools: ask Claude to continue
   d. If stop_reason = "end_turn": break
3. Return final text
```

- **max_tokens**: 32768
- **model**: claude-sonnet-4-6
- **Auth**: OAuth token via `authToken` + `anthropic-beta: oauth-2025-04-20` header
- **Tool result size limit**: 8000 chars

### Available Tools

**DB Tools** — query_data, count_records, create_record, update_records, delete_records
**Page Tools** — create_page, update_page, get_page, list_pages, delete_page
**Instance Page Tools** — create_instance_page, update_instance_page_code, get_instance_page, verify_instance_code, introspect_table
**SQL Tools** — execute_sql (SUPERADMIN only)

**verify_instance_code** — Runs Sucrase compilation + security checks on JSX code. Agent MUST call this after every code write/update. Returns `{ok: true}` or `{ok: false, error: "..."}`. If error, agent fixes and re-verifies.

**introspect_table** — Returns column schema (name, type, default, nullable) for a custom table. Agent uses this before writing code that references custom tables.

**list_instance_pages_code** — Lists existing Instance pages with code snippets (max 5 pages, 150 lines each). Agent calls this before creating new pages to learn patterns and maintain consistency.

### Agentic Quality Features

1. **Self-correction loop** — Agent verifies code after every write. If compilation fails, it reads the error, fixes, and re-verifies (up to 3 attempts).
2. **Incremental creation** — Agent builds pages step by step: basic DataTable → verify → add CRUD → verify → polish → verify.
3. **Learning from existing pages** — Before creating new pages, agent reads existing page code for pattern/style consistency.
4. **Runtime error reporting** — ErrorBoundary in sandbox.tsx has "Oprav chybu" button that auto-opens page editor chat with error context. Agent receives the runtime error message and runs full diagnostic flow.
5. **Error diagnosis** — When user reports "it doesn't work", agent automatically: reads code → verifies → introspects tables → analyzes for common issues → fixes.

### Two Chat Contexts

1. **Main Chat** (`/api/chat`) — general business chat, event-specific conversations, persistent via Message model with eventId
2. **UI Chat** (`/api/ui-chat`) — configurator and page-editor, persistent via Message model with customPageId, threaded per section

---

## Instance Pages System (Custom Sections)

This is the most complex subsystem. Companies get custom UI sections without modifying Core code.

### Architecture
```
User describes UI → Configurator agent writes JSX → Stored in CustomPage.code →
User opens page → Sucrase compiles JSX → Function constructor sandbox →
React component renders with SDK hooks and components
```

### Security
- **Blocked patterns** (compile.ts): import(), require(), eval(), new Function(), window, document, fetch, localStorage, sessionStorage, XMLHttpRequest, globalThis
- **Sandbox**: Function constructor with controlled scope — only SDK-provided names are available
- **ErrorBoundary**: Runtime errors don't crash the Core app

### SDK (available in Instance code scope)
- **Hooks**: useCstmQuery(table, options), useCstmMutation(table), useAI()
- **Components**: Button, Input, Badge, Card/CardHeader/CardTitle/CardDescription/CardContent, DataTable, StatCard, Select, Tabs, LoadingSpinner, EmptyState
- **Utilities**: sdk.notify(), sdk.navigate(), sdk.formatDate(), sdk.formatDateTime(), sdk.formatCurrency(), sdk.formatNumber(), sdk.download(), sdk.sendEmail()
- **Convention**: Code must end with `var __default__ = ComponentName;`

### Custom Tables
- Prefix: always `cstm_` (e.g., cstm_orders, cstm_products)
- Required columns: id (TEXT PK, gen_random_uuid()), created_at, updated_at
- Live in `instance` PostgreSQL schema (isolated from Core)
- CRUD via `/api/cstm` endpoint

### Configurator Threading
- Each CustomPage has its own conversation thread (Message.customPageId)
- New sections use temporary threadId until page is created
- When agent creates page, orphan messages auto-link to new page
- Page editor (wand button on pages) shares the same thread
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

- `event:` — tool execution notification (shown as pill badges in UI)
- `pageCreated:` — signals new page creation (configurator switches thread)
- `result:` — final assistant text response
- `error:` — error message

---

## Deployment

- **Platform**: Railway
- **Auto-deploy**: Push to `main` branch on GitHub → Railway builds Docker image → deploys
- **Start sequence** (start.sh): prisma db push → seed.js → migrate-instance-schema.ts → server.js
- **DB**: PostgreSQL on Railway (internal URL, not accessible from outside)
- **Volume**: /data for backups and uploads

### Key Environment Variables
```
DATABASE_URL              # PostgreSQL connection string
ANTHROPIC_OAUTH_TOKEN     # Claude API auth
NEXTAUTH_SECRET           # JWT signing secret
NEXTAUTH_URL              # App URL (for NextAuth)
ADMIN_PASSWORD            # Initial admin password
```

---

## Important Patterns & Conventions

1. **Schema changes**: Use `prisma db push` (not migrations). Schema is in `prisma/schema.prisma`.
2. **Custom tables**: Always prefix with `cstm_`, always include id/created_at/updated_at.
3. **API routes**: Follow Next.js App Router convention. Auth check first, then logic.
4. **Sensitive fields**: Passwords and SMTP passwords are masked in API responses via sanitizeRecord().
5. **Tool descriptions**: Include usage examples for AI agents in tool description strings.
6. **Instance code convention**: Must end with `var __default__ = ComponentName;`
7. **Responsive design**: All UI must work on mobile (375px) and desktop. Use Tailwind mobile-first breakpoints.
8. **Core protection**: Never modify Core tables (User, Event, etc.) via raw SQL. Use Prisma.
9. **qualifyInstanceTables()**: Auto-rewrites `cstm_xxx` to `instance.cstm_xxx` in SQL.
10. **Build check**: Always run `npm run build` before pushing. Prisma generate needs dummy DATABASE_URL locally.

---

## Things to Watch Out For

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
| Claude AI integration | `lib/claude.ts` |
| All agent tools | `lib/agent-tools/db-tools.ts` |
| Auth configuration | `lib/auth.ts` |
| Instance SDK hooks | `lib/instance/sdk.tsx` |
| Instance UI components | `lib/instance/sdk-components.tsx` |
| JSX compiler | `lib/instance/compile.ts` |
| JSX sandbox | `lib/instance/sandbox.tsx` |
| Configurator prompt | `lib/instance/configurator-prompt.ts` |
| Main chat API | `app/api/chat/route.ts` |
| Configurator chat API | `app/api/ui-chat/route.ts` |
| Custom table CRUD API | `app/api/cstm/route.ts` |
| Sidebar navigation | `components/layout/nav.tsx` |
| AgentChat component | `components/custom-page/agent-chat.tsx` |
| Main chat panel | `components/chat/chat-panel.tsx` |
| Dockerfile | `Dockerfile` |
| Startup script | `start.sh` |
