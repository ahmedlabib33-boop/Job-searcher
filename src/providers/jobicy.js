import { formatSalary, htmlToText, normalizeJobType, pageOf, safeUrl, toIsoDate, truncate } from '../util.js';

// Fully remote jobs that can be done from anywhere in the world.
// API terms: credit Jobicy with a link and send Apply clicks to the job's own
// URL from the feed. Docs: https://jobi.cy/apidocs
const FEED_URL = 'https://jobicy.com/api/v2/remote-jobs';
const FEED_SIZE = 100;
const CACHE_TTL_MS = 60 * 60 * 1000;

export function normalizeJobicyJob(raw) {
  const description = htmlToText(raw.jobDescription);
  return {
    id: `jobicy:${raw.id}`,
    title: htmlToText(raw.jobTitle) || 'Untitled job',
    company: htmlToText(raw.companyName) || null,
    companyLogo: safeUrl(raw.companyLogo),
    location: !raw.jobGeo || /anywhere/i.test(raw.jobGeo) ? 'Remote · Worldwide' : `Remote · ${raw.jobGeo}`,
    remote: true,
    type: normalizeJobType(raw.jobType),
    postedAt: toIsoDate(raw.pubDate),
    salary: formatSalary({
      min: raw.salaryMin,
      max: raw.salaryMax,
      currency: raw.salaryCurrency,
      period: raw.salaryPeriod,
    }),
    summary: truncate(htmlToText(raw.jobExcerpt) || description, 280),
    description: truncate(description, 4000),
    url: safeUrl(raw.url),
    sourceUrl: safeUrl(raw.url),
    source: 'jobicy',
  };
}

export const jobicy = {
  id: 'jobicy',
  name: 'Jobicy',
  homepage: 'https://jobicy.com',
  description: 'Remote jobs you can do from anywhere, including Cairo',
  modes: ['remote'],
  setupHint: null,

  isConfigured() {
    return true;
  },

  async search(params, { fetchJson, cached }) {
    const url = new URL(FEED_URL);
    url.searchParams.set('count', String(FEED_SIZE));
    url.searchParams.set('geo', 'anywhere');
    if (params.q) url.searchParams.set('tag', params.q);

    // The feed is small, so it is fetched whole once and paged through locally.
    const body = await cached(`jobicy:${url.search}`, CACHE_TTL_MS, () => fetchJson(url));
    const all = (Array.isArray(body?.jobs) ? body.jobs : []).filter((raw) => raw?.id && raw.url);
    return pageOf(all.map(normalizeJobicyJob), params.page);
  },
};
