import Anthropic from "@anthropic-ai/sdk";
import { prisma } from "@/lib/prisma";

type ApiKeyEntry = {
  label: string;
  token: string;
};

// ─── Key cache (survives hot-reloads via globalThis) ────────────

const g = globalThis as unknown as {
  _anthropicKeys: ApiKeyEntry[] | null;
  _anthropicKeyIndex: number;
  _anthropicClient: Anthropic | null;
  _anthropicKeysLoadedAt: number;
};

if (!g._anthropicKeys) {
  g._anthropicKeys = null;
  g._anthropicKeyIndex = 0;
  g._anthropicClient = null;
  g._anthropicKeysLoadedAt = 0;
}

const CACHE_TTL = 60_000; // reload keys from DB every 60s

// ─── Load keys from DB with env fallback ────────────────────

async function loadKeys(): Promise<ApiKeyEntry[]> {
  try {
    const info = await prisma.companyInfo.findUnique({
      where: { id: "default" },
      select: { extra: true },
    });
    const extra = info?.extra as Record<string, unknown> | null;
    const keys = (extra?.aiApiKeys as ApiKeyEntry[]) || [];
    // Filter out empty tokens
    const valid = keys.filter((k) => k.token?.trim());
    if (valid.length > 0) return valid;
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
  const isApiKey = token.startsWith("sk-ant-");
  if (isApiKey) {
    return new Anthropic({ apiKey: token });
  }
  return new Anthropic({
    authToken: token,
    defaultHeaders: { "anthropic-beta": "oauth-2025-04-20" },
  });
}

async function ensureKeys(): Promise<ApiKeyEntry[]> {
  const now = Date.now();
  if (!g._anthropicKeys || now - g._anthropicKeysLoadedAt > CACHE_TTL) {
    g._anthropicKeys = await loadKeys();
    g._anthropicKeysLoadedAt = now;
    // Reset client if keys changed
    g._anthropicClient = null;
    g._anthropicKeyIndex = 0;
  }
  return g._anthropicKeys;
}

// ─── Public API ─────────────────────────────────────────────

/**
 * Returns the current Anthropic client.
 * Loads keys from DB on first call and every 60s.
 */
export async function getAnthropicClient(): Promise<Anthropic> {
  const keys = await ensureKeys();
  if (keys.length === 0) {
    throw new Error("No AI API keys configured. Go to Settings > AI APIs.");
  }

  if (!g._anthropicClient) {
    g._anthropicClient = createClient(keys[g._anthropicKeyIndex].token);
  }
  return g._anthropicClient;
}

/**
 * Call when an auth error occurs. Rotates to the next key.
 * Returns true if there's a next key to try, false if all exhausted.
 */
export function failoverToNextKey(): boolean {
  const keys = g._anthropicKeys;
  if (!keys || keys.length <= 1) return false;

  g._anthropicKeyIndex = (g._anthropicKeyIndex + 1) % keys.length;
  g._anthropicClient = null;
  return true;
}

/**
 * Force reload keys from DB on next getAnthropicClient() call.
 * Call after updating keys in settings.
 */
export function invalidateKeyCache(): void {
  g._anthropicKeys = null;
  g._anthropicClient = null;
  g._anthropicKeyIndex = 0;
  g._anthropicKeysLoadedAt = 0;
}
