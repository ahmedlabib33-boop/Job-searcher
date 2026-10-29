import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { parseSearchParams } from '../src/params.js';
import { remoteok } from '../src/providers/remoteok.js';
import { normalizeWwrItem, weworkremotely } from '../src/providers/weworkremotely.js';
import { isOpenToEgypt, matchesKeywords, pageOf, parseRssItems, relativeAgeToIso } from '../src/util.js';
import { fakeContext, NOW } from './helpers.js';

describe('isOpenToEgypt', () => {
  it('keeps jobs open worldwide, to Egypt or to its region and time zone', () => {
    for (const text of ['', 'Remote', 'Anywhere in the World', 'Worldwide', 'EMEA', 'Egypt',
      'Middle East & Africa', 'Time zone: CET (+/- 3 hours)', 'UTC+2']) {
      assert.equal(isOpenToEgypt(text), true, text);
    }
  });

  it('drops jobs limited to other places', () => {
    for (const text of ['United States', 'Remote - Americas', 'Anywhere in India', 'South Africa', 'Europe',
      'USA, Canada, Ireland or UK only']) {
      assert.equal(isOpenToEgypt(text), false, text);
    }
  });
});

describe('matchesKeywords', () => {
  it('needs every word somewhere in the fields', () => {
    assert.equal(matchesKeywords(['Senior React Developer', ['frontend', 'react']], 'react  SENIOR'), true);
    assert.equal(matchesKeywords(['Senior React Developer'], 'react native'), false);
    assert.equal(matchesKeywords(['Anything'], ''), true);
  });
});

describe('pageOf', () => {
  it('slices pages of 20', () => {
    const items = Array.from({ length: 45 }, (_, i) => i);
    assert.deepEqual(pageOf(items, 3), { jobs: [40, 41, 42, 43, 44], hasMore: false });
    assert.equal(pageOf(items, 2).hasMore, true);
  });
});

describe('relativeAgeToIso', () => {
  it('turns Google-style ages into dates', () => {
    assert.equal(relativeAgeToIso('17 hours ago', NOW), '2026-10-28T19:00:00.000Z');
    assert.equal(relativeAgeToIso('30+ days ago', NOW), '2026-09-29T12:00:00.000Z');
    assert.equal(relativeAgeToIso('Just posted', NOW), '2026-10-29T12:00:00.000Z');
    assert.equal(relativeAgeToIso(undefined, NOW), null);
  });
});

const RSS = `<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0" xmlns:media="http://search.yahoo.com/mrss"><channel>
  <title>We Work Remotely</title>
  <item>
    <title>Acme: Senior Accountant</title>
    <region>Anywhere in the World</region>
    <category>Finance</category>
    <type>Full-Time</type>
    <skills>IFRS</skills>
    <description>&lt;p&gt;Close the books&amp;nbsp;monthly.&lt;/p&gt;</description>
    <pubDate>Tue, 27 Oct 2026 10:00:00 +0000</pubDate>
    <expires_at>Fri, 27 Nov 2026 10:00:00 +0000</expires_at>
    <guid>https://weworkremotely.com/remote-jobs/acme-senior-accountant</guid>
    <link>https://weworkremotely.com/remote-jobs/acme-senior-accountant</link>
    <media:content url="https://wwr.example/acme.png" type="image/png"/>
  </item>
  <item>
    <title>Globex: Support Agent</title>
    <region>USA Only</region>
    <type>Full-Time</type>
    <description><![CDATA[<p>US customers</p>]]></description>
    <pubDate>Tue, 27 Oct 2026 09:00:00 +0000</pubDate>
    <link>https://weworkremotely.com/remote-jobs/globex-support</link>
  </item>
  <item>
    <title>Initech: Old Accountant Role</title>
    <region>Anywhere in the World</region>
    <description>Expired</description>
    <pubDate>Tue, 01 Sep 2026 09:00:00 +0000</pubDate>
    <expires_at>Thu, 01 Oct 2026 09:00:00 +0000</expires_at>
    <link>https://weworkremotely.com/remote-jobs/initech-old</link>
  </item>
</channel></rss>`;

describe('parseRssItems', () => {
  it('reads text, CDATA and self-closing elements', () => {
    const [first, second] = parseRssItems(RSS);
    assert.equal(first.title, 'Acme: Senior Accountant');
    assert.equal(first.description, '<p>Close the books&nbsp;monthly.</p>');
    assert.deepEqual(first['media:content'], { url: 'https://wwr.example/acme.png', type: 'image/png' });
    assert.equal(second.description, '<p>US customers</p>');
  });
});

describe('We Work Remotely', () => {
  it('splits "Company: Title" and normalizes the job', () => {
    const job = normalizeWwrItem(parseRssItems(RSS)[0]);
    assert.equal(job.company, 'Acme');
    assert.equal(job.title, 'Senior Accountant');
    assert.equal(job.location, 'Remote · Worldwide');
    assert.equal(job.type, 'fulltime');
    assert.equal(job.companyLogo, 'https://wwr.example/acme.png');
    assert.equal(job.summary, 'Close the books monthly.');
    assert.equal(job.url, 'https://weworkremotely.com/remote-jobs/acme-senior-accountant');
  });

  it('keeps open, unexpired jobs that match the keywords', async () => {
    const { ctx } = fakeContext(RSS);
    const all = await weworkremotely.search(parseSearchParams({}), ctx);
    assert.deepEqual(all.jobs.map((job) => job.title), ['Senior Accountant']);

    const none = await weworkremotely.search(parseSearchParams({ q: 'designer' }), ctx);
    assert.deepEqual(none.jobs, []);
  });
});

describe('Remote OK', () => {
  const feed = [
    { legal: 'API Terms of Service: please link back to Remote OK.' },
    {
      id: '1', position: 'Senior React Developer', company: 'Acme', tags: ['react', 'dev'],
      location: '', date: '2026-10-28T08:00:00+00:00', salary_min: 60000, salary_max: 90000,
      description: '<p>Build things</p>', url: 'https://remoteOK.com/remote-jobs/1',
    },
    {
      id: '2', position: 'Backend Engineer', company: 'Globex', tags: ['go'],
      location: 'United States', date: '2026-10-28T08:00:00+00:00', url: 'https://remoteOK.com/remote-jobs/2',
    },
    {
      id: '3', position: 'Data Analyst', company: 'Initech', tags: ['sql'],
      location: 'Worldwide', date: '2026-10-27T08:00:00+00:00', url: 'https://remoteOK.com/remote-jobs/3',
    },
  ];

  it('skips the legal notice and jobs not open to Egypt', async () => {
    const { ctx } = fakeContext(feed);
    const result = await remoteok.search(parseSearchParams({}), ctx);
    assert.deepEqual(result.jobs.map((job) => job.id), ['remoteok:1', 'remoteok:3']);
    assert.equal(result.jobs[0].location, 'Remote · Location not stated');
    assert.equal(result.jobs[0].salary, 'USD 60,000–90,000 / year');
    assert.equal(result.jobs[1].location, 'Remote · Worldwide');
  });

  it('searches titles, companies and tags, from one cached download', async () => {
    const { ctx, requests } = fakeContext(feed);
    const react = await remoteok.search(parseSearchParams({ q: 'react' }), ctx);
    const sql = await remoteok.search(parseSearchParams({ q: 'sql' }), ctx);
    assert.deepEqual(react.jobs.map((job) => job.id), ['remoteok:1']);
    assert.deepEqual(sql.jobs.map((job) => job.id), ['remoteok:3']);
    assert.equal(requests.length, 1);
  });
});
