import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { parseSearchParams } from '../src/params.js';
import { careerjet, normalizeCareerjetJob } from '../src/providers/careerjet.js';
import { jooble, normalizeJoobleJob } from '../src/providers/jooble.js';
import { buildSerpApiQuery, normalizeSerpApiJob, serpapi } from '../src/providers/serpapi.js';
import { fakeContext, NOW } from './helpers.js';

const serpJob = {
  title: 'Graphic Designer',
  company_name: 'Cairo Studio',
  location: 'Cairo, Egypt',
  via: 'via LinkedIn',
  thumbnail: 'https://logo.example/studio.png',
  description: 'Design social media posts.',
  detected_extensions: { posted_at: '3 days ago', schedule_type: 'Full-time', salary: 'EGP 12K–18K a month' },
  apply_options: [{ title: 'LinkedIn', link: 'https://www.linkedin.com/jobs/view/1' }],
  share_link: 'https://www.google.com/search?ibp=htl;jobs#1',
  job_id: 'eyJqb2JfdGl0bGUiOiJHcmFwaGljIn0=',
};

describe('SerpApi (Google Jobs)', () => {
  it('builds a location-aware query', () => {
    assert.equal(buildSerpApiQuery(parseSearchParams({ q: 'designer', area: 'zamalek' })), 'designer in Zamalek, Cairo, Egypt');
    assert.equal(buildSerpApiQuery(parseSearchParams({ mode: 'remote' })), 'jobs remote in Cairo, Egypt');
  });

  it('normalizes a job', () => {
    const job = normalizeSerpApiJob(serpJob, NOW);
    assert.equal(job.company, 'Cairo Studio');
    assert.equal(job.publisher, 'LinkedIn');
    assert.equal(job.type, 'fulltime');
    assert.equal(job.remote, false);
    assert.equal(job.postedAt, '2026-10-26T12:00:00.000Z');
    assert.equal(job.salary, 'EGP 12K–18K a month');
    assert.equal(job.url, 'https://www.linkedin.com/jobs/view/1');
  });

  it('stops paging after page 5', async () => {
    const { ctx, requests } = fakeContext({ jobs_results: [serpJob], serpapi_pagination: { next_page_token: 'T' } },
      { env: { SERPAPI_API_KEY: 'secret' } });
    assert.equal((await serpapi.search(parseSearchParams({ page: '5' }), ctx)).hasMore, false);
    const before = requests.length;
    assert.deepEqual(await serpapi.search(parseSearchParams({ page: '6' }), ctx), { jobs: [], hasMore: false });
    assert.equal(requests.length, before);
  });

  it('pages with the token from the previous page and keeps the key out of cache keys', async () => {
    const { ctx, requests, cacheKeys } = fakeContext(({ url }) => (url.searchParams.has('next_page_token')
      ? { jobs_results: [{ ...serpJob, job_id: 'page-2' }] }
      : { jobs_results: [serpJob], serpapi_pagination: { next_page_token: 'TOKEN-2' } }),
    { env: { SERPAPI_API_KEY: 'secret' } });

    const first = await serpapi.search(parseSearchParams({ q: 'designer' }), ctx);
    const second = await serpapi.search(parseSearchParams({ q: 'designer', page: '2' }), ctx);

    assert.equal(first.hasMore, true);
    assert.deepEqual(second.jobs.map((job) => job.id), ['serpapi:page-2']);
    assert.equal(second.hasMore, false);
    assert.equal(requests.length, 2, 'page 1 is reused from the cache when loading page 2');
    assert.equal(requests[0].url.searchParams.get('engine'), 'google_jobs');
    assert.equal(requests[0].url.searchParams.get('gl'), 'eg');
    assert.equal(requests[0].url.searchParams.get('api_key'), 'secret');
    assert.equal(requests[1].url.searchParams.get('next_page_token'), 'TOKEN-2');
    assert.ok(cacheKeys.every((key) => !key.includes('secret')));
  });
});

const careerjetJob = {
  title: 'Customer Service Representative',
  company: 'Telecom Co',
  date: 'Wed, 28 Oct 2026 09:00:00 GMT',
  description: 'Answer <b>customer</b> calls',
  locations: 'Cairo',
  salary: '',
  salary_min: 8000,
  salary_max: 10000,
  salary_currency_code: 'EGP',
  salary_type: 'M',
  url: 'https://jobviewtrack.com/en-eg/job-abc',
};

describe('Careerjet', () => {
  const env = { CAREERJET_API_KEY: 'cj-key' };
  const client = { ip: '41.33.1.2', userAgent: 'Mozilla/5.0 (Test)', referer: 'http://localhost:3000/?q=sales' };

  it('normalizes a job', () => {
    const job = normalizeCareerjetJob(careerjetJob, parseSearchParams({ type: 'parttime' }));
    assert.equal(job.title, 'Customer Service Representative');
    assert.equal(job.location, 'Cairo');
    assert.equal(job.type, 'parttime');
    assert.equal(job.salary, 'EGP 8,000–10,000 / month');
    assert.equal(job.summary, 'Answer customer calls');
    assert.equal(job.postedAt, '2026-10-28T09:00:00.000Z');
  });

  it('sends the key, the Egypt locale, filters and the visitor details', async () => {
    const { ctx, requests, cacheKeys } = fakeContext({ type: 'JOBS', hits: 45, pages: 3, jobs: [careerjetJob] }, { env, client });
    const result = await careerjet.search(parseSearchParams({ q: 'sales', area: 'maadi', type: 'internship' }), ctx);

    const [{ url, headers }] = requests;
    assert.equal(url.origin + url.pathname, 'https://search.api.careerjet.net/v4/query');
    assert.equal(url.searchParams.get('locale_code'), 'en_EG');
    assert.equal(url.searchParams.get('keywords'), 'sales');
    assert.equal(url.searchParams.get('location'), 'Maadi');
    assert.equal(url.searchParams.get('contract_type'), 'i');
    assert.equal(url.searchParams.get('user_ip'), '41.33.1.2');
    assert.equal(url.searchParams.get('user_agent'), 'Mozilla/5.0 (Test)');
    assert.equal(headers.authorization, `Basic ${Buffer.from('cj-key:').toString('base64')}`);
    assert.equal(headers.referer, 'http://localhost:3000/?q=sales');
    assert.ok(cacheKeys.every((key) => !key.includes('41.33.1.2')));
    assert.equal(result.jobs.length, 1);
    assert.equal(result.hasMore, true);
  });

  it('marks jobs as remote when the description says so', () => {
    const remote = normalizeCareerjetJob({ ...careerjetJob, description: 'This is a fully remote role.' }, parseSearchParams({}));
    const onsite = normalizeCareerjetJob({ ...careerjetJob, description: 'Not a remote position, office in Maadi.' }, parseSearchParams({}));
    assert.equal(remote.remote, true);
    assert.equal(onsite.remote, false);
  });

  it('falls back to all of Cairo when an area is not recognized', async () => {
    const { ctx, requests } = fakeContext(({ url }) => (url.searchParams.get('location') === 'Cairo'
      ? { type: 'JOBS', pages: 1, jobs: [careerjetJob] }
      : { type: 'LOCATIONS', locations: ['Mokattam, Cairo', 'Mokattam, Giza'] }), { env, client });
    const result = await careerjet.search(parseSearchParams({ area: 'mokattam' }), ctx);
    assert.deepEqual(requests.map((r) => r.url.searchParams.get('location')), ['Mokattam', 'Cairo']);
    assert.equal(result.jobs.length, 1);
    assert.equal(result.hasMore, false);
  });
});

const joobleJob = {
  id: 987654321,
  title: 'Pharmacist',
  location: 'Cairo',
  snippet: '<b>Pharmacist</b> needed for a pharmacy chain&nbsp;...',
  salary: '9,000 - 12,000 EGP',
  source: 'wuzzuf.net',
  type: 'Full-time',
  link: 'https://eg.jooble.org/jdp/987654321',
  company: 'Pharma Plus',
  updated: '2026-10-28T10:15:00.0000000',
};

describe('Jooble', () => {
  it('normalizes a job', () => {
    const job = normalizeJoobleJob(joobleJob);
    assert.equal(job.id, 'jooble:987654321');
    assert.equal(job.summary, 'Pharmacist needed for a pharmacy chain ...');
    assert.equal(job.salary, '9,000 - 12,000 EGP');
    assert.equal(job.type, 'fulltime');
    assert.equal(job.publisher, 'wuzzuf.net');
    assert.equal(job.url, 'https://eg.jooble.org/jdp/987654321');
    assert.equal(job.postedAt, '2026-10-28T10:15:00.000Z');
  });

  it('posts the search with the key in the address', async () => {
    const { ctx, requests } = fakeContext({ totalCount: 55, jobs: [joobleJob] }, { env: { JOOBLE_API_KEY: 'jb-key' } });
    const result = await jooble.search(parseSearchParams({ q: 'pharmacist', area: 'heliopolis', page: '2' }), ctx);

    const [{ url, json }] = requests;
    assert.equal(url.href, 'https://jooble.org/api/jb-key');
    assert.deepEqual(json, { keywords: 'pharmacist', location: 'Heliopolis', page: '2', ResultOnPage: '20' });
    assert.equal(result.jobs.length, 1);
    assert.equal(result.hasMore, true);
  });

  it('can use a regional address', async () => {
    const { ctx, requests } = fakeContext({ totalCount: 0, jobs: [] }, { env: { JOOBLE_API_KEY: 'k', JOOBLE_HOST: 'eg.jooble.org' } });
    await jooble.search(parseSearchParams({}), ctx);
    assert.equal(requests[0].url.host, 'eg.jooble.org');
  });
});
