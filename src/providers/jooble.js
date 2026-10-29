import { findArea } from '../areas.js';
import {
  describesRemoteWork, htmlToText, looksRemote, normalizeJobType, safeUrl, searchKeywords, toIsoDate, truncate,
} from '../util.js';

// Jooble collects jobs from many job sites. Each country has its own API key:
// a key from eg.jooble.org returns jobs in Egypt.
// Docs: https://help.jooble.org/en/support/solutions/articles/60001448238-rest-api-documentation
const PAGE_SIZE = 20;
// A free key allows only 500 requests in its whole lifetime, so results are
// kept for a full day.
const CACHE_TTL_MS = 24 * 60 * 60 * 1000;

export function normalizeJoobleJob(raw) {
  const summary = htmlToText(raw.snippet);
  const location = htmlToText(raw.location);
  const title = htmlToText(raw.title) || 'Untitled job';
  return {
    id: `jooble:${raw.id}`,
    title,
    company: htmlToText(raw.company) || null,
    companyLogo: null,
    location: location || null,
    remote: looksRemote(title, location) || describesRemoteWork(summary),
    type: normalizeJobType(raw.type),
    postedAt: toIsoDate(raw.updated),
    salary: htmlToText(raw.salary) || null,
    summary: truncate(summary, 280),
    description: truncate(summary, 4000),
    url: safeUrl(raw.link),
    publisher: raw.source && !/^jooble$/i.test(raw.source) ? htmlToText(raw.source) : null,
    source: 'jooble',
  };
}

export const jooble = {
  id: 'jooble',
  name: 'Jooble',
  homepage: 'https://eg.jooble.org',
  signupUrl: 'https://eg.jooble.org/api/about',
  description: 'On-site jobs in Cairo collected from many Egyptian and international job sites',
  modes: ['onsite', 'remote'],
  setupHint: 'Add JOOBLE_API_KEY to .env (free key from eg.jooble.org; 500 requests in total).',

  isConfigured(env) {
    return Boolean(env.JOOBLE_API_KEY);
  },

  async search(params, { env, fetchJson, cached }) {
    const request = {
      keywords: searchKeywords(params),
      location: findArea(params.area).place,
      page: String(params.page),
      ResultOnPage: String(PAGE_SIZE),
    };
    const host = env.JOOBLE_HOST || 'jooble.org';
    const body = await cached(`jooble:${host}:${JSON.stringify(request)}`, CACHE_TTL_MS, () =>
      fetchJson(`https://${host}/api/${encodeURIComponent(env.JOOBLE_API_KEY)}`, { json: request }));

    const data = Array.isArray(body?.jobs) ? body.jobs : [];
    return {
      jobs: data.filter((raw) => raw?.id && raw.link).map(normalizeJoobleJob),
      hasMore: params.page * PAGE_SIZE < (Number(body?.totalCount) || 0),
    };
  },
};
