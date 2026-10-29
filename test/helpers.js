import { TtlCache } from '../src/cache.js';

export const NOW = Date.parse('2026-10-29T12:00:00Z');

// A provider context that records requests and answers with canned bodies.
// `respond` is either the body to return or a function of the request.
// The cache is real, so tests also see what a provider reuses.
export function fakeContext(respond, { env = {}, client } = {}) {
  const requests = [];
  const cacheKeys = [];
  const cache = new TtlCache({ now: () => NOW });
  const answer = async (url, options = {}) => {
    const request = { url: new URL(url), headers: options.headers ?? {}, json: options.json };
    requests.push(request);
    return typeof respond === 'function' ? respond(request) : respond;
  };
  return {
    requests,
    cacheKeys,
    ctx: {
      env,
      client,
      now: () => NOW,
      cached: (key, ttlMs, load) => {
        cacheKeys.push(key);
        return cache.getOrLoad(key, ttlMs, load);
      },
      fetchJson: answer,
      fetchText: answer,
    },
  };
}
