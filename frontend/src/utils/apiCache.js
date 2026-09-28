import axios from 'axios';

// Fast in-memory cache for GET requests
const memoryCache = new Map();

/**
 * Fetch with memory + stale-while-revalidate caching
 * @param {string} url - API endpoint
 * @param {object} options - { maxAgeMs: number, force: boolean }
 */
export async function getCached(url, options = {}) {
  const { maxAgeMs = 30000, force = false } = options;
  const now = Date.now();
  const cached = memoryCache.get(url);

  if (!force && cached && (now - cached.time < maxAgeMs)) {
    return cached.data;
  }

  const res = await axios.get(url);
  memoryCache.set(url, { data: res.data, time: now });
  return res.data;
}

/**
 * Clear cache for specific path prefix or all
 * @param {string} [prefix] 
 */
export function invalidateApiCache(prefix) {
  if (!prefix) {
    memoryCache.clear();
    return;
  }
  for (const key of memoryCache.keys()) {
    if (key.startsWith(prefix)) {
      memoryCache.delete(key);
    }
  }
}
