import { prisma } from "./prisma";

/**
 * Models that have a tenantId column.
 * Queries on these models get automatic tenant scoping.
 */
const TENANT_SCOPED_MODELS = new Set([
  "User",
  "Event",
  "EventCategory",
  "EmailAccount",
  "EventAction",
  "Message",
  "CustomPage",
  "SectionCategory",
  "AgentContext",
  "CronJob",
  "Snapshot",
]);

function isTenantScoped(model: string): boolean {
  return TENANT_SCOPED_MODELS.has(model);
}

/* eslint-disable @typescript-eslint/no-explicit-any */

/**
 * Returns a Prisma client with automatic tenant scoping.
 * All queries on tenant-scoped models include tenantId filter.
 */
export function tenantPrisma(tenantId: string) {
  return prisma.$extends({
    query: {
      $allModels: {
        async findMany({ model, args, query }: any) {
          if (isTenantScoped(model)) {
            args.where = { ...args.where, tenantId };
          }
          return query(args);
        },
        async findFirst({ model, args, query }: any) {
          if (isTenantScoped(model)) {
            args.where = { ...args.where, tenantId };
          }
          return query(args);
        },
        async findUnique({ model, args, query }: any) {
          const result = await query(args);
          if (result && isTenantScoped(model) && (result as Record<string, unknown>).tenantId !== tenantId) {
            return null;
          }
          return result;
        },
        async create({ model, args, query }: any) {
          if (isTenantScoped(model)) {
            args.data = { ...(args.data as Record<string, unknown>), tenantId };
          }
          return query(args);
        },
        async createMany({ model, args, query }: any) {
          if (isTenantScoped(model) && Array.isArray(args.data)) {
            args.data = (args.data as Record<string, unknown>[]).map((d: Record<string, unknown>) => ({
              ...d,
              tenantId,
            }));
          }
          return query(args);
        },
        async update({ model, args, query }: any) {
          if (isTenantScoped(model) && args.where) {
            (args.where as Record<string, unknown>).tenantId = tenantId;
          }
          return query(args);
        },
        async updateMany({ model, args, query }: any) {
          if (isTenantScoped(model)) {
            args.where = { ...args.where, tenantId };
          }
          return query(args);
        },
        async delete({ model, args, query }: any) {
          if (isTenantScoped(model) && args.where) {
            (args.where as Record<string, unknown>).tenantId = tenantId;
          }
          return query(args);
        },
        async deleteMany({ model, args, query }: any) {
          if (isTenantScoped(model)) {
            args.where = { ...args.where, tenantId };
          }
          return query(args);
        },
        async count({ model, args, query }: any) {
          if (isTenantScoped(model)) {
            args.where = { ...args.where, tenantId };
          }
          return query(args);
        },
        async aggregate({ model, args, query }: any) {
          if (isTenantScoped(model)) {
            args.where = { ...args.where, tenantId };
          }
          return query(args);
        },
      },
    },
  } as any);
}

/* eslint-enable @typescript-eslint/no-explicit-any */

/**
 * Get the PostgreSQL schema name for a tenant's custom tables.
 */
export function getTenantSchema(tenantId: string): string {
  return `tenant_${tenantId}`;
}
