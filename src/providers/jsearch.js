import { findArea } from '../areas.js';
import { formatSalary, htmlToText, normalizeJobType, safeUrl, toIsoDate, truncate } from '../util.js';

// JSearch reads Google for Jobs, which indexes LinkedIn, Indeed, Wuzzuf, Bayt
// and company career pages, so it is the source of on-site Cairo listings.
const ENDPOINTS = {
  rapidapi: {
    url: 'https://jsearch.p.rapidapi.com/search',
    headers: (key) => ({ 'x-rapidapi-key': key, 'x-rapidapi-host': 'jsearch.p.rapidapi.com' }),
  },
  openwebninja: {
    url: 'https://api.openwebninja.com/jsearch/search',
    headers: (key) => ({ 'x-api-key': key }),
  },
};

const DATE_POSTED = { 1: 'today', 3: '3days', 7: 'week', 30: 'month' };
const EMPLOYMENT_TYPES = { fulltime: 'FULLTIME', parttime: 'PARTTIME', contract: 'CONTRACTOR', internship: 'INTERN' };
const COUNTRY_NAMES = { EG: 'Egypt' };
const PAGE_SIZE = 10;
// The free plan has a small monthly quota, so identical searches are reused for hours.
const CACHE_TTL_MS = 6 * 60 * 60 * 1000;

function endpointFor(env) {
  return ENDPOINTS[String(env.JSEARCH_PROVIDER ?? '').toLowerCase()] ?? ENDPOINTS.rapidapi;
}

export function buildJsearchQuery(params) {
  const what = params.q || 'jobs';
  return `${what} in ${findArea(params.area).query}`;
}

export function normalizeJsearchJob(raw) {
  const description = htmlToText(raw.job_description);
  const country = COUNTRY_NAMES[raw.job_country] ?? raw.job_country;
  return {
    id: `jsearch:${raw.job_id}`,
    title: raw.job_title?.trim() || 'Untitled job',
    company: raw.employer_name?.trim() || null,
    companyLogo: safeUrl(raw.employer_logo),
    location: raw.job_location || [raw.job_city, raw.job_state, country].filter(Boolean).join(', ') || null,
    remote: Boolean(raw.job_is_remote),
    type: normalizeJobType(raw.job_employment_types ?? raw.job_employment_type),
    postedAt: toIsoDate(raw.job_posted_at_datetime_utc ?? raw.job_posted_at_timestamp),
    salary: raw.job_salary || formatSalary({
      min: raw.job_min_salary,
      max: raw.job_max_salary,
      currency: raw.job_salary_currency,
      period: raw.job_salary_period,
    }),
    summary: truncate(description, 280),
    description: truncate(description, 4000),
    url: safeUrl(raw.job_apply_link) ?? safeUrl(raw.job_google_link),
    publisher: raw.job_publisher || null,
    source: 'jsearch',
  };
}

export const jsearch = {
  id: 'jsearch',
  name: 'JSearch',
  homepage: 'https://www.openwebninja.com/api/jsearch',
  description: 'On-site jobs in Cairo from LinkedIn, Indeed, Wuzzuf, Bayt and company sites (via Google for Jobs)',
  modes: ['onsite', 'remote'],
  setupHint: 'Add a free JSEARCH_API_KEY to .env to see on-site jobs in Cairo.',

  isConfigured(env) {
    return Boolean(env.JSEARCH_API_KEY);
  },

  async search(params, { env, fetchJson, cached }) {
    const endpoint = endpointFor(env);
    const url = new URL(endpoint.url);
    url.searchParams.set('query', buildJsearchQuery(params));
    url.searchParams.set('page', String(params.page));
    url.searchParams.set('num_pages', '1');
    url.searchParams.set('country', 'eg');
    if (DATE_POSTED[params.posted]) url.searchParams.set('date_posted', DATE_POSTED[params.posted]);
    if (EMPLOYMENT_TYPES[params.type]) url.searchParams.set('employment_types', EMPLOYMENT_TYPES[params.type]);
    if (params.mode === 'remote') url.searchParams.set('work_from_home', 'true');

    const body = await cached(`jsearch:${url.search}`, CACHE_TTL_MS, () =>
      fetchJson(url, { headers: endpoint.headers(env.JSEARCH_API_KEY) }));
    const data = Array.isArray(body?.data) ? body.data : [];
    return {
      jobs: data.filter((raw) => raw?.job_id).map(normalizeJsearchJob),
      hasMore: data.length >= PAGE_SIZE,
    };
  },
};
