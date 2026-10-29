import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { parseSearchParams } from '../src/params.js';
import { describeHimalayasLocation, himalayas, normalizeHimalayasJob } from '../src/providers/himalayas.js';
import { jobicy, normalizeJobicyJob } from '../src/providers/jobicy.js';
import { buildJsearchQuery, jsearch, normalizeJsearchJob } from '../src/providers/jsearch.js';
import { fakeContext, NOW } from './helpers.js';

const jsearchJob = {
  job_id: 'abc123',
  job_title: 'Senior Accountant',
  employer_name: 'Nile Foods',
  employer_logo: 'https://logo.example/nile.png',
  job_publisher: 'Wuzzuf',
  job_employment_type: 'FULLTIME',
  job_apply_link: 'https://wuzzuf.net/jobs/p/abc',
  job_description: 'Prepare monthly reports.<br>IFRS knowledge.',
  job_is_remote: false,
  job_posted_at_datetime_utc: '2026-10-27T08:00:00.000Z',
  job_city: 'Cairo',
  job_country: 'EG',
  job_min_salary: 15000,
  job_max_salary: 20000,
  job_salary_currency: 'EGP',
  job_salary_period: 'MONTH',
};

describe('JSearch', () => {
  it('is only enabled with an API key', () => {
    assert.equal(jsearch.isConfigured({}), false);
    assert.equal(jsearch.isConfigured({ JSEARCH_API_KEY: 'k' }), true);
  });

  it('builds a location-aware query', () => {
    assert.equal(buildJsearchQuery(parseSearchParams({ q: 'accountant', area: 'maadi' })), 'accountant in Maadi, Cairo, Egypt');
    assert.equal(buildJsearchQuery(parseSearchParams({})), 'jobs in Cairo, Egypt');
  });

  it('normalizes a job', () => {
    assert.deepEqual(normalizeJsearchJob(jsearchJob), {
      id: 'jsearch:abc123',
      title: 'Senior Accountant',
      company: 'Nile Foods',
      companyLogo: 'https://logo.example/nile.png',
      location: 'Cairo, Egypt',
      remote: false,
      type: 'fulltime',
      postedAt: '2026-10-27T08:00:00.000Z',
      salary: 'EGP 15,000–20,000 / month',
      summary: 'Prepare monthly reports.\nIFRS knowledge.',
      description: 'Prepare monthly reports.\nIFRS knowledge.',
      url: 'https://wuzzuf.net/jobs/p/abc',
      publisher: 'Wuzzuf',
      source: 'jsearch',
    });
  });

  it('sends filters and the RapidAPI key', async () => {
    const { ctx, requests } = fakeContext({ data: [jsearchJob] }, { env: { JSEARCH_API_KEY: 'secret' } });
    const params = parseSearchParams({ q: 'accountant', posted: '7', type: 'parttime', mode: 'remote', page: '2' });
    const result = await jsearch.search(params, ctx);

    const [{ url, headers }] = requests;
    assert.equal(url.origin + url.pathname, 'https://jsearch.p.rapidapi.com/search');
    assert.equal(url.searchParams.get('query'), 'accountant in Cairo, Egypt');
    assert.equal(url.searchParams.get('country'), 'eg');
    assert.equal(url.searchParams.get('page'), '2');
    assert.equal(url.searchParams.get('date_posted'), 'week');
    assert.equal(url.searchParams.get('employment_types'), 'PARTTIME');
    assert.equal(url.searchParams.get('work_from_home'), 'true');
    assert.deepEqual(headers, { 'x-rapidapi-key': 'secret', 'x-rapidapi-host': 'jsearch.p.rapidapi.com' });
    assert.equal(result.jobs.length, 1);
    assert.equal(result.hasMore, false);
  });

  it('can use an OpenWeb Ninja key instead', async () => {
    const { ctx, requests } = fakeContext({ data: [] }, { env: { JSEARCH_API_KEY: 'secret', JSEARCH_PROVIDER: 'openwebninja' } });
    await jsearch.search(parseSearchParams({}), ctx);
    assert.equal(requests[0].url.host, 'api.openwebninja.com');
    assert.deepEqual(requests[0].headers, { 'x-api-key': 'secret' });
  });
});

const himalayasJob = {
  title: 'Senior Frontend Developer',
  excerpt: 'Build our dashboard in React.',
  companyName: 'Acme',
  companyLogo: 'https://cdn-images.himalayas.app/acme',
  employmentType: 'Full Time',
  minSalary: 3000,
  maxSalary: 4500,
  salaryPeriod: 'monthly',
  currency: 'USD',
  locationRestrictions: [{ alpha2: 'EG', name: 'Egypt', slug: 'egypt' }],
  description: '<p>Build our dashboard in <b>React</b>.</p>',
  pubDate: 1793200000,
  expiryDate: 1798460905,
  applicationLink: 'https://himalayas.app/companies/acme/jobs/frontend?utm_source=api',
  guid: 'https://himalayas.app/companies/acme/jobs/frontend',
};

describe('Himalayas', () => {
  it('describes where a remote job can be done from', () => {
    assert.equal(describeHimalayasLocation([]), 'Remote · Worldwide');
    assert.equal(describeHimalayasLocation(['Egypt']), 'Remote · Egypt');
    assert.equal(
      describeHimalayasLocation(['Bulgaria', 'Croatia', 'Egypt', 'Estonia', 'Morocco']),
      'Remote · Egypt + 4 other countries',
    );
  });

  it('normalizes a job and keeps the apply link unchanged', () => {
    const job = normalizeHimalayasJob(himalayasJob);
    assert.equal(job.url, himalayasJob.applicationLink);
    assert.equal(job.sourceUrl, himalayasJob.guid);
    assert.equal(job.location, 'Remote · Egypt');
    assert.equal(job.remote, true);
    assert.equal(job.type, 'fulltime');
    assert.equal(job.salary, 'USD 3,000–4,500 / month');
    assert.equal(job.summary, 'Build our dashboard in React.');
    assert.equal(job.postedAt, '2026-10-28T15:06:40.000Z');
  });

  it('searches jobs open to Egypt and drops expired ones', async () => {
    const expired = { ...himalayasJob, guid: 'https://himalayas.app/old', expiryDate: NOW / 1000 - 60 };
    const { ctx, requests } = fakeContext({ jobs: [himalayasJob, expired] });
    const result = await himalayas.search(parseSearchParams({ q: 'react', type: 'internship', page: '2' }), ctx);

    const { url } = requests[0];
    assert.equal(url.searchParams.get('q'), 'react');
    assert.equal(url.searchParams.get('country'), 'EG');
    assert.equal(url.searchParams.get('employment_type'), 'Intern');
    assert.equal(url.searchParams.get('page'), '2');
    assert.deepEqual(result.jobs.map((job) => job.id), [`himalayas:${himalayasJob.guid}`]);
    assert.equal(result.hasMore, true);
  });

  it('reports the end of results on an empty page', async () => {
    const { ctx } = fakeContext({ jobs: [] });
    assert.deepEqual(await himalayas.search(parseSearchParams({}), ctx), { jobs: [], hasMore: false });
  });
});

function jobicyJob(id) {
  return {
    id,
    url: `https://jobicy.com/jobs/${id}-role`,
    jobTitle: 'Customer Support &amp; Success',
    companyName: 'Remote Co',
    companyLogo: 'https://jobicy.com/logo.png',
    jobType: ['Part-Time'],
    jobGeo: 'Anywhere',
    jobExcerpt: 'Help our customers.',
    jobDescription: '<p>Help our customers.</p>',
    pubDate: '2026-10-29T09:59:37+00:00',
    salaryMin: 20,
    salaryMax: 25,
    salaryCurrency: 'USD',
    salaryPeriod: 'hourly',
  };
}

describe('Jobicy', () => {
  it('normalizes a job', () => {
    const job = normalizeJobicyJob(jobicyJob(7));
    assert.equal(job.id, 'jobicy:7');
    assert.equal(job.title, 'Customer Support & Success');
    assert.equal(job.location, 'Remote · Worldwide');
    assert.equal(job.type, 'parttime');
    assert.equal(job.salary, 'USD 20–25 / hour');
    assert.equal(job.url, 'https://jobicy.com/jobs/7-role');
  });

  it('fetches the worldwide feed once and pages through it locally', async () => {
    const feed = { jobs: Array.from({ length: 25 }, (_, i) => jobicyJob(i + 1)) };
    const { ctx, requests } = fakeContext(feed);

    const first = await jobicy.search(parseSearchParams({ q: 'support' }), ctx);
    const second = await jobicy.search(parseSearchParams({ q: 'support', page: '2' }), ctx);

    assert.equal(requests.length, 1, 'the second page comes from the cached feed');
    assert.equal(requests[0].url.searchParams.get('geo'), 'anywhere');
    assert.equal(requests[0].url.searchParams.get('tag'), 'support');
    assert.equal(first.jobs.length, 20);
    assert.equal(first.hasMore, true);
    assert.deepEqual(second.jobs.map((job) => job.id), ['jobicy:21', 'jobicy:22', 'jobicy:23', 'jobicy:24', 'jobicy:25']);
    assert.equal(second.hasMore, false);
  });
});
