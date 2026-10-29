import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { TtlCache } from '../src/cache.js';
import { UpstreamError } from '../src/http.js';
import { parseSearchParams } from '../src/params.js';
import { searchJobs } from '../src/search.js';

const NOW = Date.parse('2026-10-29T12:00:00Z');
const daysAgo = (days) => new Date(NOW - days * 86_400_000).toISOString();

function job(overrides) {
  return {
    id: `test:${overrides.title}`,
    title: 'Job',
    company: 'Company',
    remote: false,
    type: 'fulltime',
    postedAt: daysAgo(1),
    url: 'https://example.com/apply',
    source: 'test',
    ...overrides,
  };
}

function provider(id, jobs, { modes = ['onsite', 'remote'], configured = true, hasMore = false } = {}) {
  return {
    id,
    name: id,
    homepage: `https://${id}.example`,
    modes,
    setupHint: configured ? null : 'Add a key',
    isConfigured: () => configured,
    search: async () => {
      if (jobs instanceof Error) throw jobs;
      return { jobs, hasMore };
    },
  };
}

function run(providers, raw = {}) {
  return searchJobs(parseSearchParams(raw), {
    providers,
    env: {},
    fetchJson: async () => ({}),
    cache: new TtlCache(),
    now: () => NOW,
    log: () => {},
  });
}

const sourceStatus = (result) => Object.fromEntries(result.sources.map((s) => [s.id, s.status]));

describe('searchJobs', () => {
  it('merges sources, newest first', async () => {
    const result = await run([
      provider('a', [job({ title: 'Old', postedAt: daysAgo(10) }), job({ title: 'Undated', postedAt: null })]),
      provider('b', [job({ title: 'New', postedAt: daysAgo(0.5) })], { hasMore: true }),
    ]);
    assert.deepEqual(result.jobs.map((j) => j.title), ['New', 'Old', 'Undated']);
    assert.deepEqual(result.sources.map((s) => [s.id, s.status, s.count, s.hasMore]), [
      ['a', 'ok', 2, false],
      ['b', 'ok', 1, true],
    ]);
  });

  it('removes the same job listed by several sources, keeping the first source', async () => {
    const result = await run([
      provider('a', [job({ id: 'a:1', title: 'Sales Executive', company: 'Vodafone Egypt' })]),
      provider('b', [job({ id: 'b:9', title: 'Sales  executive', company: 'Vodafone Egypt.' })]),
    ]);
    assert.deepEqual(result.jobs.map((j) => j.id), ['a:1']);
  });

  it('applies work mode, type and date filters to every source', async () => {
    const jobs = [
      job({ title: 'Remote FT', remote: true }),
      job({ title: 'Onsite FT' }),
      job({ title: 'Onsite PT', type: 'parttime' }),
      job({ title: 'Onsite old', postedAt: daysAgo(20) }),
      job({ title: 'Onsite undated', postedAt: null }),
    ];
    const titles = async (raw) => (await run([provider('a', jobs)], raw)).jobs.map((j) => j.title).sort();

    assert.deepEqual(await titles({ mode: 'remote' }), ['Remote FT']);
    assert.deepEqual(await titles({ mode: 'onsite', type: 'parttime' }), ['Onsite PT']);
    assert.deepEqual(await titles({ mode: 'onsite', posted: '7', type: 'fulltime' }), ['Onsite FT']);
  });

  it('drops jobs without an apply link', async () => {
    const result = await run([provider('a', [job({ title: 'No link', url: null })])]);
    assert.equal(result.jobs.length, 0);
  });

  it('keeps going when one source fails, with a safe error message', async () => {
    const result = await run([
      provider('down', new UpstreamError(429, 'https://api.example/search?key=secret')),
      provider('up', [job({ title: 'Works' })]),
    ]);
    assert.deepEqual(result.jobs.map((j) => j.title), ['Works']);
    const down = result.sources.find((s) => s.id === 'down');
    assert.equal(down.status, 'error');
    assert.equal(down.message, 'Rate limit reached, try again later');
  });

  it('skips sources that are not configured, cannot match the mode, or were not asked for', async () => {
    const providers = [
      provider('keyed', [job({ title: 'A' })], { configured: false }),
      provider('remote-only', [job({ title: 'B', remote: true })], { modes: ['remote'] }),
      provider('both', [job({ title: 'C' })]),
    ];
    assert.deepEqual(sourceStatus(await run(providers, { mode: 'onsite' })), {
      keyed: 'not_configured', 'remote-only': 'skipped', both: 'ok',
    });
    assert.deepEqual(sourceStatus(await run(providers, { sources: 'remote-only' })), {
      keyed: 'not_configured', 'remote-only': 'ok', both: 'skipped',
    });
  });
});
