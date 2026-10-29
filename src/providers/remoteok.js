import { formatSalary, htmlToText, isOpenToEgypt, matchesKeywords, pageOf, safeUrl, toIsoDate, truncate } from '../util.js';

// Remote jobs, mostly in tech. The API returns its whole feed at once.
// API terms: link back to the job's Remote OK page and name Remote OK as the
// source; don't use the Remote OK logo. Docs: https://remoteok.com/api
const FEED_URL = 'https://remoteok.com/api';
const CACHE_TTL_MS = 60 * 60 * 1000;

export function normalizeRemoteOkJob(raw) {
  const description = htmlToText(raw.description);
  const location = htmlToText(raw.location);
  return {
    id: `remoteok:${raw.id}`,
    title: htmlToText(raw.position) || 'Untitled job',
    company: htmlToText(raw.company) || null,
    companyLogo: safeUrl(raw.company_logo) ?? safeUrl(raw.logo),
    location: location && !/^remote$/i.test(location) ? `Remote · ${location}` : 'Remote · Location not stated',
    remote: true,
    type: null,
    postedAt: toIsoDate(raw.date ?? raw.epoch),
    // Remote OK salaries are yearly amounts in US dollars.
    salary: formatSalary({ min: raw.salary_min, max: raw.salary_max, currency: 'USD', period: 'year' }),
    summary: truncate(description, 280),
    description: truncate(description, 4000),
    url: safeUrl(raw.url),
    sourceUrl: safeUrl(raw.url),
    tags: Array.isArray(raw.tags) ? raw.tags : [],
    rawLocation: location,
    source: 'remoteok',
  };
}

export const remoteok = {
  id: 'remoteok',
  name: 'Remote OK',
  homepage: 'https://remoteok.com',
  description: 'Remote jobs, mostly in tech, that accept people from Egypt or don’t limit location',
  modes: ['remote'],
  setupHint: null,

  isConfigured() {
    return true;
  },

  async search(params, { fetchJson, cached }) {
    // The feed is cleaned up once per download; each search only filters it.
    const jobs = await cached('remoteok:jobs', CACHE_TTL_MS, async () => {
      const feed = await fetchJson(FEED_URL);
      // The first entry is the API's legal notice, not a job.
      return (Array.isArray(feed) ? feed : [])
        .filter((raw) => raw?.id && raw.position && raw.url)
        .map(normalizeRemoteOkJob)
        .filter((job) => isOpenToEgypt(job.rawLocation));
    });
    const matches = jobs
      .filter((job) => matchesKeywords([job.title, job.company, job.tags], params.q))
      .map(({ tags, rawLocation, ...job }) => job);
    return pageOf(matches, params.page);
  },
};
