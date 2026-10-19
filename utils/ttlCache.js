/**
 * Small in-process TTL cache with in-flight de-duplication.
 * Per instance only; good enough to protect rate-limited free APIs
 * (Unsplash, OpenWeather, Wikipedia) from repeated identical requests.
 */
const createTtlCache = ({ ttlMs, maxEntries = 500 }) => {
  const entries = new Map();

  const get = (key) => {
    const entry = entries.get(key);
    if (!entry) return undefined;
    if (entry.expiresAt <= Date.now()) {
      entries.delete(key);
      return undefined;
    }
    return entry.value;
  };

  const set = (key, value) => {
    if (entries.size >= maxEntries) {
      entries.delete(entries.keys().next().value); // evict oldest
    }
    entries.set(key, { value, expiresAt: Date.now() + ttlMs });
  };

  /**
   * Return the cached value or compute it once; concurrent callers share the
   * same promise. Failures are not cached.
   */
  const wrap = (key, compute) => {
    const cached = get(key);
    if (cached !== undefined) return Promise.resolve(cached);

    const promise = Promise.resolve()
      .then(compute)
      .catch((error) => {
        entries.delete(key);
        throw error;
      });
    set(key, promise);
    return promise;
  };

  return { get, set, wrap, clear: () => entries.clear() };
};

module.exports = { createTtlCache };
