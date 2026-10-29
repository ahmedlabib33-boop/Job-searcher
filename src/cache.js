// Small in-memory TTL cache. It stores promises, so identical searches that
// arrive while a request is still in flight share that one upstream call.
export class TtlCache {
  constructor({ maxEntries = 500, now = Date.now } = {}) {
    this.maxEntries = maxEntries;
    this.now = now;
    this.entries = new Map();
  }

  async getOrLoad(key, ttlMs, load) {
    const hit = this.entries.get(key);
    if (hit && hit.expiresAt > this.now()) return hit.value;

    const value = Promise.resolve().then(load);
    // Re-inserting moves a refreshed entry to the back, so the oldest entries
    // are the ones evicted when the cache is full.
    this.entries.delete(key);
    this.entries.set(key, { value, expiresAt: this.now() + ttlMs });
    this.#evictOverflow();
    // Failures must not be cached, or one bad response would stick for the whole TTL.
    value.catch(() => {
      if (this.entries.get(key)?.value === value) this.entries.delete(key);
    });
    return value;
  }

  #evictOverflow() {
    while (this.entries.size > this.maxEntries) {
      this.entries.delete(this.entries.keys().next().value);
    }
  }
}
