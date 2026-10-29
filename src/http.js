const USER_AGENT = 'CairoJobFinder/0.1 (+https://github.com/ahmedlabib33-boop/Job-searcher)';

export class UpstreamError extends Error {
  constructor(status, url) {
    super(`Request to ${new URL(url).host} failed with HTTP ${status}`);
    this.name = 'UpstreamError';
    this.status = status;
  }
}

async function request(url, { method = 'GET', headers = {}, body, timeoutMs = 12_000, accept }) {
  const response = await fetch(url, {
    method,
    headers: { accept, 'user-agent': USER_AGENT, ...headers },
    body,
    signal: AbortSignal.timeout(timeoutMs),
  });
  if (!response.ok) throw new UpstreamError(response.status, String(url));
  return response;
}

// Pass `json` to send a JSON request body (the request then becomes a POST).
export async function fetchJson(url, { json, ...options } = {}) {
  if (json !== undefined) {
    options.method ??= 'POST';
    options.headers = { 'content-type': 'application/json', ...options.headers };
    options.body = JSON.stringify(json);
  }
  const response = await request(url, { accept: 'application/json', ...options });
  return response.json();
}

// For RSS and other XML feeds.
export async function fetchText(url, options = {}) {
  const response = await request(url, { accept: 'application/rss+xml, application/xml, text/xml, */*', ...options });
  return response.text();
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
