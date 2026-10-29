import { formatSalary, htmlToText, normalizeJobType, safeUrl, toIsoDate, truncate } from '../util.js';

// Remote jobs whose hiring rules allow candidates based in Egypt.
// API terms: Apply buttons must use `applicationLink` unchanged, and each job
// must visibly credit Himalayas with a link. Docs: https://himalayas.app/api
const SEARCH_URL = 'https://himalayas.app/jobs/api/search';
const EMPLOYMENT_TYPES = { fulltime: 'Full Time', parttime: 'Part Time', contract: 'Contractor', internship: 'Intern' };
// Himalayas refreshes its data once a day, so frequent polling gains nothing.
const CACHE_TTL_MS = 60 * 60 * 1000;
const MAX_LISTED_COUNTRIES = 3;

function countryName(entry) {
  return typeof entry === 'string' ? entry : entry?.name;
}

export function describeHimalayasLocation(restrictions) {
  const names = (restrictions ?? []).map(countryName).filter(Boolean);
  if (names.length === 0) return 'Remote · Worldwide';
  if (names.length <= MAX_LISTED_COUNTRIES) return `Remote · ${names.join(', ')}`;
  const lead = names.find((name) => /^egypt$/i.test(name)) ?? names[0];
  const others = names.length - 1;
  return `Remote · ${lead} + ${others} other ${others === 1 ? 'country' : 'countries'}`;
}

export function normalizeHimalayasJob(raw) {
  const description = htmlToText(raw.description) || htmlToText(raw.excerpt);
  return {
    id: `himalayas:${raw.guid}`,
    title: raw.title?.trim() || 'Untitled job',
    company: raw.companyName?.trim() || null,
    companyLogo: safeUrl(raw.companyLogo),
    location: describeHimalayasLocation(raw.locationRestrictions),
    remote: true,
    type: normalizeJobType(raw.employmentType),
    postedAt: toIsoDate(raw.pubDate),
    salary: formatSalary({ min: raw.minSalary, max: raw.maxSalary, currency: raw.currency, period: raw.salaryPeriod }),
    summary: truncate(htmlToText(raw.excerpt) || description, 280),
    description: truncate(description, 4000),
    url: safeUrl(raw.applicationLink) ?? safeUrl(raw.guid),
    sourceUrl: safeUrl(raw.guid),
    source: 'himalayas',
  };
}

export const himalayas = {
  id: 'himalayas',
  name: 'Himalayas',
  homepage: 'https://himalayas.app',
  description: 'Remote jobs open to people living in Egypt',
  modes: ['remote'],
  setupHint: null,

  isConfigured() {
    return true;
  },

  async search(params, { fetchJson, cached, now }) {
    const url = new URL(SEARCH_URL);
    if (params.q) url.searchParams.set('q', params.q);
    url.searchParams.set('country', 'EG');
    url.searchParams.set('sort', 'recent');
    if (EMPLOYMENT_TYPES[params.type]) url.searchParams.set('employment_type', EMPLOYMENT_TYPES[params.type]);
    url.searchParams.set('page', String(params.page));

    const body = await cached(`himalayas:${url.search}`, CACHE_TTL_MS, () => fetchJson(url));
    const data = Array.isArray(body?.jobs) ? body.jobs : [];
    const nowSeconds = now() / 1000;
    return {
      // Expired jobs must not be shown.
      jobs: data
        .filter((raw) => raw?.guid && !(raw.expiryDate && raw.expiryDate < nowSeconds))
        .map(normalizeHimalayasJob),
      // Per the docs, only an empty page reliably marks the end of the results.
      hasMore: data.length > 0,
    };
  },
};
