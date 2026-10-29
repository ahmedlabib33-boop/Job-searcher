import {
  htmlToText, isOpenToEgypt, matchesKeywords, normalizeJobType, pageOf, parseRssItems, safeUrl, toIsoDate, truncate,
} from '../util.js';

// Remote jobs from We Work Remotely's public RSS feed (its latest jobs across
// all categories). Every job links back to its page on We Work Remotely.
const FEED_URL = 'https://weworkremotely.com/remote-jobs.rss';
// The feed itself asks readers to wait 60 minutes between fetches (<ttl>60</ttl>).
const CACHE_TTL_MS = 60 * 60 * 1000;

// Titles look like "Company: Job title".
function splitTitle(title) {
  const index = title.indexOf(': ');
  return index > 0
    ? { company: title.slice(0, index).trim(), title: title.slice(index + 2).trim() }
    : { company: null, title: title.trim() };
}

export function normalizeWwrItem(item) {
  const { company, title } = splitTitle(htmlToText(item.title));
  const description = htmlToText(item.description);
  const region = htmlToText(item.region);
  return {
    id: `weworkremotely:${item.guid || item.link}`,
    title: title || 'Untitled job',
    company,
    companyLogo: safeUrl(item['media:content']?.url),
    location: !region || /anywhere in the world/i.test(region) ? 'Remote · Worldwide' : `Remote · ${region}`,
    remote: true,
    type: normalizeJobType(item.type),
    postedAt: toIsoDate(item.pubDate),
    salary: null,
    summary: truncate(description, 280),
    description: truncate(description, 4000),
    url: safeUrl(item.link),
    sourceUrl: safeUrl(item.link),
    category: htmlToText(item.category),
    skills: htmlToText(item.skills),
    region,
    expiresAt: toIsoDate(item.expires_at),
    source: 'weworkremotely',
  };
}

export const weworkremotely = {
  id: 'weworkremotely',
  name: 'We Work Remotely',
  homepage: 'https://weworkremotely.com',
  description: 'Remote jobs open to people anywhere in the world',
  modes: ['remote'],
  setupHint: null,

  isConfigured() {
    return true;
  },

  async search(params, { fetchText, cached, now }) {
    // The feed is parsed once per download; each search only filters it.
    const jobs = await cached('weworkremotely:jobs', CACHE_TTL_MS, async () =>
      parseRssItems(await fetchText(FEED_URL))
        .map(normalizeWwrItem)
        .filter((job) => job.url && isOpenToEgypt(job.region)));
    const nowMs = now();
    const matches = jobs
      .filter((job) => !job.expiresAt || Date.parse(job.expiresAt) > nowMs)
      .filter((job) => matchesKeywords([job.title, job.company, job.category, job.skills], params.q))
      .map(({ category, skills, region, expiresAt, ...job }) => job);
    return pageOf(matches, params.page);
  },
};
