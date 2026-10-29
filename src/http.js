const USER_AGENT = 'CairoJobFinder/0.1 (+https://github.com/ahmedlabib33-boop/Job-searcher)';

export class UpstreamError extends Error {
  constructor(status, url) {
    super(`Request to ${new URL(url).host} failed with HTTP ${status}`);
    this.name = 'UpstreamError';
    this.status = status;
  }
}

export async function fetchJson(url, { headers = {}, timeoutMs = 12_000 } = {}) {
  const response = await fetch(url, {
    headers: { accept: 'application/json', 'user-agent': USER_AGENT, ...headers },
    signal: AbortSignal.timeout(timeoutMs),
  });
  if (!response.ok) throw new UpstreamError(response.status, String(url));
  return response.json();
}

// A short reason that is safe to show in the UI (no URLs, keys or stack traces).
export function describeError(error) {
  if (error?.name === 'TimeoutError' || error?.name === 'AbortError') return 'Timed out';
  if (error instanceof UpstreamError) {
    if (error.status === 401 || error.status === 403) return 'API key was rejected';
    if (error.status === 429) return 'Rate limit reached, try again later';
    return `Unavailable right now (HTTP ${error.status})`;
  }
  return 'Unavailable right now';
}
