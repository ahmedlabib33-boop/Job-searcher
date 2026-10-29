import { findArea } from '../areas.js';
import { htmlToText, looksRemote, normalizeJobType, relativeAgeToIso, safeUrl, truncate } from '../util.js';

// SerpApi's Google Jobs engine: a second route to Google for Jobs (LinkedIn,
// Indeed, Wuzzuf, Bayt, Glassdoor, company sites), alongside JSearch.
// Docs: https://serpapi.com/google-jobs-api
const SEARCH_URL = 'https://serpapi.com/search.json';
// The free plan has 250 searches a month, so identical searches are reused for hours.
const CACHE_TTL_MS = 6 * 60 * 60 * 1000;

export function buildSerpApiQuery(params) {
  const what = [params.q || 'jobs', params.mode === 'remote' ? 'remote' : ''].filter(Boolean).join(' ');
  return `${what} in ${findArea(params.area).query}`;
}

export function normalizeSerpApiJob(raw, nowMs) {
  const description = htmlToText(raw.description);
  const extensions = raw.detected_extensions ?? {};
  const location = htmlToText(raw.location);
  return {
    id: `serpapi:${raw.job_id}`,
    title: htmlToText(raw.title) || 'Untitled job',
    company: htmlToText(raw.company_name) || null,
    companyLogo: safeUrl(raw.thumbnail),
    location: location || null,
    remote: extensions.work_from_home === true || looksRemote(location),
    type: normalizeJobType(extensions.schedule_type),
    postedAt: relativeAgeToIso(extensions.posted_at, nowMs),
    salary: extensions.salary || null,
    summary: truncate(description, 280),
    description: truncate(description, 4000),
    url: safeUrl(raw.apply_options?.[0]?.link) ?? safeUrl(raw.share_link),
    publisher: htmlToText(raw.via).replace(/^via\s+/i, '') || null,
    source: 'serpapi',
  };
}

export const serpapi = {
  id: 'serpapi',
  name: 'SerpApi (Google Jobs)',
  homepage: 'https://serpapi.com/google-jobs-api',
  signupUrl: 'https://serpapi.com/users/sign_up',
  description: 'On-site jobs in Cairo from LinkedIn, Indeed, Wuzzuf, Bayt, Glassdoor and company sites, through Google Jobs',
  modes: ['onsite', 'remote'],
  setupHint: 'Add SERPAPI_API_KEY to .env (free plan: 250 searches a month).',

  isConfigured(env) {
    return Boolean(env.SERPAPI_API_KEY);
  },

  async search(params, { env, fetchJson, cached, now }) {
    const base = new URLSearchParams({ engine: 'google_jobs', q: buildSerpApiQuery(params), gl: 'eg', hl: 'en' });

    // Google Jobs pages with a token from the previous page, so page N first
    // needs page N-1. Earlier pages normally come straight from the cache.
    const loadPage = (page) => cached(`serpapi:${base}:${page}`, CACHE_TTL_MS, async () => {
      const query = new URLSearchParams(base);
      if (page > 1) {
        const token = (await loadPage(page - 1))?.serpapi_pagination?.next_page_token;
        if (!token) return { jobs_results: [] };
        query.set('next_page_token', token);
      }
      // The key is added last so it never ends up in a cache key.
      query.set('api_key', env.SERPAPI_API_KEY);
      return fetchJson(`${SEARCH_URL}?${query}`);
    });

    const body = await loadPage(params.page);
    const data = Array.isArray(body?.jobs_results) ? body.jobs_results : [];
    const nowMs = now();
    return {
      jobs: data.filter((raw) => raw?.job_id).map((raw) => normalizeSerpApiJob(raw, nowMs)),
      hasMore: Boolean(body?.serpapi_pagination?.next_page_token),
    };
  },
};
