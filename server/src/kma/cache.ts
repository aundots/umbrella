const cache = new Map<string, { at: number; data: unknown }>();
const TTL_MS = 5 * 60 * 1000;
const STALE_MS = 15 * 60 * 1000;

export function getCached<T>(key: string, maxAgeMs = TTL_MS): T | null {
  const hit = cache.get(key);
  if (!hit) return null;
  if (Date.now() - hit.at > maxAgeMs) {
    return null;
  }
  return hit.data as T;
}

/** Expired entries kept up to STALE_MS for rate-limit fallback */
export function getStaleCached<T>(key: string, maxStaleMs = STALE_MS): T | null {
  const hit = cache.get(key);
  if (!hit) return null;
  if (Date.now() - hit.at > maxStaleMs) {
    cache.delete(key);
    return null;
  }
  return hit.data as T;
}

export function setCache(key: string, data: unknown): void {
  cache.set(key, { at: Date.now(), data });
}
