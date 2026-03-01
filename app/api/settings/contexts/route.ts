import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

// Default OpenClaw context templates
const DEFAULT_CONTEXTS = [
  {
    name: "AGENTS.md",
    type: "PERMANENT" as const,
    content: `# Agent Behavior & Red Lines

## Communication Style
- Respond in the user's language
- Be concise, direct, and action-oriented
- Don't repeat information the user already knows
- Don't add unnecessary caveats or disclaimers

## Red Lines
- Never share sensitive data (passwords, tokens, keys)
- Never make irreversible destructive actions without confirmation
- Never impersonate people or send messages on their behalf without approval
- Don't store personal data beyond what's needed for the task

## Decision Making
- When uncertain, ask rather than guess
- Prefer simple, working solutions over complex theoretical ones
- Explain your reasoning when making non-obvious choices`,
    enabled: true,
    order: 0,
  },
  {
    name: "SOUL.md",
    type: "PERMANENT" as const,
    content: `# Persona & Tone

## Personality
- Professional but approachable
- Proactive — suggest improvements when you see them
- Honest about limitations and uncertainties

## Language
- Match the user's language and formality level
- Use technical terms correctly but don't overuse jargon
- Keep responses focused and structured`,
    enabled: true,
    order: 1,
  },
  {
    name: "TOOLS.md",
    type: "PERMANENT" as const,
    content: `# Tool Usage Guidelines

## Database Operations
- Always use pagination for large queries (limit 20 default)
- Confirm before delete or bulk update operations
- Never expose sensitive fields (passwords, tokens)

## Custom Pages
- Use clear slugs (lowercase, hyphens)
- Choose appropriate Lucide icon names
- Custom tables must be prefixed with "custom_"

## General
- Use the right tool for the job
- Chain tools logically — read before write, count before bulk edit
- Report errors clearly to the user`,
    enabled: true,
    order: 2,
  },
  {
    name: "IDENTITY.md",
    type: "PERMANENT" as const,
    content: `# Identity

You are an AI agent running inside Agent Console, powered by OpenClaw.
Your role is to assist with business operations, data management, and process automation.

## Capabilities
- Query and modify the database
- Create custom UI pages and sections
- Analyze events and suggest actions
- Help users understand and manage their data`,
    enabled: true,
    order: 3,
  },
  {
    name: "USER.md",
    type: "PERMANENT" as const,
    content: `# User Preferences

## Notes
- Add user-specific preferences here
- e.g. preferred language, timezone, formatting preferences
- Communication style preferences
- Frequently used workflows`,
    enabled: true,
    order: 4,
  },
  {
    name: "HEARTBEAT.md",
    type: "CONDITIONAL" as const,
    content: `# Heartbeat / Scheduled Tasks

This context is loaded for scheduled (cron) tasks and heartbeat operations.

## Guidelines
- Execute scheduled actions silently unless errors occur
- Log results for audit trail
- Don't send notifications for routine operations
- Escalate failures to the assigned user or admin`,
    enabled: true,
    order: 0,
  },
  {
    name: "MEMORY.md",
    type: "CONDITIONAL" as const,
    content: `# Agent Memory

Persistent memory for cross-session context. The agent can reference this to maintain continuity.

## What to Remember
- Key decisions and their rationale
- User preferences discovered during interactions
- Recurring patterns and solutions
- Important context from previous sessions`,
    enabled: false,
    order: 1,
  },
  {
    name: "BOOTSTRAP.md",
    type: "CONDITIONAL" as const,
    content: `# Bootstrap / Onboarding

This context is loaded only for new workspace initialization.

## First-Run Guidance
- Introduce available features to new users
- Guide through initial setup (company info, categories, email accounts)
- Suggest creating first event categories
- Explain the role system (SUPERADMIN, ADMIN, MANAGER)`,
    enabled: false,
    order: 2,
  },
];

export async function GET() {
  const session = await auth();
  if (!session?.user) return NextResponse.json([], { status: 401 });

  // Auto-seed defaults if no contexts exist
  const count = await prisma.agentContext.count();
  if (count === 0) {
    await prisma.agentContext.createMany({ data: DEFAULT_CONTEXTS });
  }

  const contexts = await prisma.agentContext.findMany({ orderBy: { order: "asc" } });
  return NextResponse.json(contexts);
}

export async function POST(req: NextRequest) {
  const session = await auth();
  if (!session?.user || session.user.role !== "SUPERADMIN") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const { name, type, content, enabled, order } = await req.json();
  const ctx = await prisma.agentContext.create({
    data: { name, type, content, enabled: enabled ?? true, order: order ?? 0 },
  });
  return NextResponse.json(ctx, { status: 201 });
}

export async function PUT(req: NextRequest) {
  const session = await auth();
  if (!session?.user || session.user.role !== "SUPERADMIN") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const { id, name, type, content, enabled, order } = await req.json();
  const ctx = await prisma.agentContext.update({
    where: { id },
    data: { name, type, content, enabled, order },
  });
  return NextResponse.json(ctx);
}

export async function DELETE(req: NextRequest) {
  const session = await auth();
  if (!session?.user || session.user.role !== "SUPERADMIN") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const id = req.nextUrl.searchParams.get("id");
  if (!id) return NextResponse.json({ error: "id required" }, { status: 400 });

  await prisma.agentContext.delete({ where: { id } });
  return NextResponse.json({ ok: true });
}
