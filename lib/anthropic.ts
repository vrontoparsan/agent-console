import Anthropic from "@anthropic-ai/sdk";
import { prisma } from "@/lib/prisma";

type ApiKeyEntry = {
  label: string;
  token: string;
};

// ─── Per-tenant key cache (survives hot-reloads via globalThis) ──

type TenantCache = {
  keys: ApiKeyEntry[];
  keyIndex: number;
  client: Anthropic | null;
  loadedAt: number;
};

const g = globalThis as unknown as {
  _anthropicTenantCache: Map<string, TenantCache>;
};

if (!g._anthropicTenantCache) {
  g._anthropicTenantCache = new Map();
}

const CACHE_TTL = 60_000; // reload keys from DB every 60s

// ─── Load keys from DB with env fallback ────────────────────

async function loadKeys(tenantId?: string): Promise<ApiKeyEntry[]> {
  try {
    if (tenantId) {
      // Load from Tenant.extra.aiApiKeys
      const tenant = await prisma.tenant.findUnique({
        where: { id: tenantId },
        select: { extra: true },
      });
      const extra = tenant?.extra as Record<string, unknown> | null;
      const keys = (extra?.aiApiKeys as ApiKeyEntry[]) || [];
      const valid = keys.filter((k) => k.token?.trim());
      if (valid.length > 0) return valid;
    } else {
      // Legacy: try CompanyInfo (for backward compat during migration)
      const info = await prisma.companyInfo.findUnique({
        where: { id: "default" },
        select: { extra: true },
      });
      const extra = info?.extra as Record<string, unknown> | null;
      const keys = (extra?.aiApiKeys as ApiKeyEntry[]) || [];
      const valid = keys.filter((k) => k.token?.trim());
      if (valid.length > 0) return valid;
    }
  } catch {
    /* DB not available, use env */
  }

  // Fallback to environment variable
  const envToken = process.env.ANTHROPIC_OAUTH_TOKEN;
  if (envToken) {
    return [{ label: "Environment", token: envToken }];
  }

  return [];
}

function createClient(token: string): Anthropic {
  // OAuth tokens: sk-ant-oat01-... / API keys: sk-ant-api03-...
  const isOAuth = token.startsWith("sk-ant-oat");
  if (isOAuth) {
    return new Anthropic({
      authToken: token,
      defaultHeaders: { "anthropic-beta": "oauth-2025-04-20" },
    });
  }
  return new Anthropic({ apiKey: token });
}

function getTenantCache(tenantId: string): TenantCache {
  let cache = g._anthropicTenantCache.get(tenantId);
  if (!cache) {
    cache = { keys: [], keyIndex: 0, client: null, loadedAt: 0 };
    g._anthropicTenantCache.set(tenantId, cache);
  }
  return cache;
}

async function ensureKeys(tenantId?: string): Promise<{ keys: ApiKeyEntry[]; cache: TenantCache }> {
  const cacheKey = tenantId || "__default__";
  const cache = getTenantCache(cacheKey);
  const now = Date.now();

  if (cache.keys.length === 0 || now - cache.loadedAt > CACHE_TTL) {
    cache.keys = await loadKeys(tenantId);
    cache.loadedAt = now;
    cache.client = null;
    cache.keyIndex = 0;
  }
  return { keys: cache.keys, cache };
}

// ─── Public API ─────────────────────────────────────────────

/**
 * Returns the Anthropic client for a tenant.
 * Loads keys from Tenant.extra on first call and every 60s.
 */
export async function getAnthropicClient(tenantId?: string): Promise<Anthropic> {
  const { keys, cache } = await ensureKeys(tenantId);
  if (keys.length === 0) {
    throw new Error("No AI API keys configured. Go to Settings > AI APIs.");
  }

  if (!cache.client) {
    cache.client = createClient(keys[cache.keyIndex].token);
  }
  return cache.client;
}

/**
 * Call when an auth error occurs. Rotates to the next key.
 * Returns true if there's a next key to try, false if all exhausted.
 */
export function failoverToNextKey(tenantId?: string): boolean {
  const cacheKey = tenantId || "__default__";
  const cache = g._anthropicTenantCache.get(cacheKey);
  if (!cache || cache.keys.length <= 1) return false;

  cache.keyIndex = (cache.keyIndex + 1) % cache.keys.length;
  cache.client = null;
  return true;
}

/**
 * Force reload keys from DB on next getAnthropicClient() call.
 * Call after updating keys in settings.
 */
export function invalidateKeyCache(tenantId?: string): void {
  if (tenantId) {
    g._anthropicTenantCache.delete(tenantId);
  } else {
    g._anthropicTenantCache.clear();
  }
}
