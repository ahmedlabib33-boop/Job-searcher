import { findArea } from '../areas.js';
import {
  describesRemoteWork, formatSalary, htmlToText, looksRemote, safeUrl, searchKeywords, toIsoDate, truncate,
} from '../util.js';

// Careerjet collects jobs from Egyptian job boards and company sites
// (careerjet.com.eg). Docs: https://www.careerjet.com/partners/api/
const QUERY_URL = 'https://search.api.careerjet.net/v4/query';
const PAGE_SIZE = 20;
const MAX_PAGE = 10;
const CACHE_TTL_MS = 3 * 60 * 60 * 1000;
const SALARY_PERIODS = { Y: 'year', M: 'month', W: 'week', D: 'day', H: 'hour' };
// Careerjet filters by contract kind and by working hours separately.
const TYPE_FILTERS = {
  fulltime: { work_hours: 'f' },
  parttime: { work_hours: 'p' },
  contract: { contract_type: 'c' },
  internship: { contract_type: 'i' },
};

export function normalizeCareerjetJob(raw, params) {
  const description = htmlToText(raw.description);
  const locations = htmlToText(raw.locations);
  const title = htmlToText(raw.title) || 'Untitled job';
  return {
    id: `careerjet:${raw.url}`,
    title,
    company: htmlToText(raw.company) || null,
    companyLogo: null,
    location: locations || null,
    remote: looksRemote(title, locations) || describesRemoteWork(description),
    // Careerjet doesn't label each job's type, but results are already
    // filtered by the type that was asked for.
    type: params.type !== 'any' ? params.type : null,
    postedAt: toIsoDate(raw.date),
    salary: raw.salary || formatSalary({
      min: raw.salary_min,
      max: raw.salary_max,
      currency: raw.salary_currency_code,
      period: SALARY_PERIODS[raw.salary_type],
    }),
    summary: truncate(description, 280),
    description: truncate(description, 4000),
    url: safeUrl(raw.url),
    source: 'careerjet',
  };
}

export const careerjet = {
  id: 'careerjet',
  name: 'Careerjet',
  homepage: 'https://www.careerjet.com.eg',
  signupUrl: 'https://www.careerjet.com.eg/partners/',
  description: 'On-site jobs in Cairo collected from Egyptian job boards and company sites',
  modes: ['onsite', 'remote'],
  setupHint: 'Add CAREERJET_API_KEY to .env (free with a Careerjet partner account).',

  isConfigured(env) {
    return Boolean(env.CAREERJET_API_KEY);
  },

  async search(params, { env, fetchJson, cached, client }) {
    if (params.page > MAX_PAGE) return { jobs: [], hasMore: false };

    const base = {
      locale_code: env.CAREERJET_LOCALE || 'en_EG',
      keywords: searchKeywords(params),
      page: String(params.page),
      page_size: String(PAGE_SIZE),
      sort: params.q ? 'relevance' : 'date',
      fragment_size: '300',
      ...TYPE_FILTERS[params.type],
    };

    // Careerjet requires the visitor's IP address, browser and page with every
    // call. They are left out of the cache key: results don't depend on them.
    const load = (location) => {
      const query = new URLSearchParams({ ...base, location });
      return cached(`careerjet:${query}`, CACHE_TTL_MS, () => {
        query.set('user_ip', client?.ip || '127.0.0.1');
        query.set('user_agent', client?.userAgent || 'CairoJobFinder/0.1');
        return fetchJson(`${QUERY_URL}?${query}`, {
          headers: {
            authorization: `Basic ${Buffer.from(`${env.CAREERJET_API_KEY}:`).toString('base64')}`,
            referer: client?.referer || 'http://localhost/',
          },
        });
      });
    };

    const place = findArea(params.area).place;
    let body = await load(place);
    // An area Careerjet doesn't know (or finds ambiguous) falls back to all of Cairo.
    if (body?.type === 'LOCATIONS' && place !== 'Cairo') body = await load('Cairo');

    const data = body?.type === 'JOBS' && Array.isArray(body.jobs) ? body.jobs : [];
    return {
      jobs: data.filter((raw) => raw?.url && raw.title).map((raw) => normalizeCareerjetJob(raw, params)),
      hasMore: params.page < Math.min(Number(body?.pages) || 0, MAX_PAGE),
    };
  },
};
