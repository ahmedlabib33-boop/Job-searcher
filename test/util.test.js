import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { formatSalary, htmlToText, normalizeJobType, safeUrl, toIsoDate, truncate } from '../src/util.js';

describe('htmlToText', () => {
  it('turns markup into readable plain text', () => {
    const html = '<p>We&rsquo;re hiring &amp; growing</p><ul><li><p>Node.js</p></li><li>SQL</li></ul><br>Apply&nbsp;now';
    assert.equal(htmlToText(html), 'We’re hiring & growing\n• Node.js\n• SQL\n\nApply now');
  });

  it('drops scripts and styles entirely', () => {
    assert.equal(htmlToText('<style>p{}</style><p>Hi</p><script>alert(1)</script>'), 'Hi');
  });

  it('decodes numeric entities, including Arabic text', () => {
    assert.equal(htmlToText('&#1605;&#1581;&#1575;&#1587;&#1576; &#x2013; Cairo'), 'محاسب – Cairo');
  });

  it('handles empty and non-text input', () => {
    assert.equal(htmlToText(null), '');
    assert.equal(htmlToText(''), '');
    assert.equal(htmlToText({}), '');
  });

  it('only turns real <li> tags into bullets', () => {
    assert.equal(htmlToText('<link rel="x">Hello'), 'Hello');
  });
});

describe('truncate', () => {
  it('leaves short text alone', () => {
    assert.equal(truncate('short', 10), 'short');
  });

  it('cuts at a word boundary and adds an ellipsis', () => {
    assert.equal(truncate('Senior accountant needed in Maadi', 20), 'Senior accountant…');
  });
});

describe('safeUrl', () => {
  it('passes http(s) links through unchanged', () => {
    const link = 'https://himalayas.app/companies/x/jobs/y?utm_source=api';
    assert.equal(safeUrl(link), link);
  });

  it('rejects other protocols and garbage', () => {
    assert.equal(safeUrl('javascript:alert(1)'), null);
    assert.equal(safeUrl('data:text/html,hi'), null);
    assert.equal(safeUrl('not a url'), null);
    assert.equal(safeUrl(undefined), null);
  });
});

describe('toIsoDate', () => {
  it('accepts Unix seconds, milliseconds and date strings', () => {
    assert.equal(toIsoDate(1793276907), '2026-10-29T12:28:27.000Z');
    assert.equal(toIsoDate(1793276907000), '2026-10-29T12:28:27.000Z');
    assert.equal(toIsoDate('2026-10-29T09:59:37+00:00'), '2026-10-29T09:59:37.000Z');
  });

  it('returns null for missing or invalid dates', () => {
    assert.equal(toIsoDate(null), null);
    assert.equal(toIsoDate('soon'), null);
    assert.equal(toIsoDate(0), null);
  });

  it('reads dates without a time zone as UTC, whatever the server’s zone', () => {
    assert.equal(toIsoDate('2026-10-28T10:15:00.0000000'), '2026-10-28T10:15:00.000Z');
    assert.equal(toIsoDate('2026-10-28T10:15'), '2026-10-28T10:15:00.000Z');
  });
});

describe('normalizeJobType', () => {
  it('understands each source’s wording', () => {
    assert.equal(normalizeJobType('FULLTIME'), 'fulltime');
    assert.equal(normalizeJobType('Full Time'), 'fulltime');
    assert.equal(normalizeJobType(['Full-Time']), 'fulltime');
    assert.equal(normalizeJobType('PARTTIME'), 'parttime');
    assert.equal(normalizeJobType('Contractor'), 'contract');
    assert.equal(normalizeJobType('freelance'), 'contract');
    assert.equal(normalizeJobType('INTERN'), 'internship');
    assert.equal(normalizeJobType(null), null);
    assert.equal(normalizeJobType('Volunteer'), null);
  });
});

describe('formatSalary', () => {
  it('formats ranges with currency and period', () => {
    assert.equal(formatSalary({ min: 15000, max: 20000, currency: 'EGP', period: 'MONTH' }), 'EGP 15,000–20,000 / month');
    assert.equal(formatSalary({ min: 95000, max: 95000, currency: 'GBP', period: 'yearly' }), 'GBP 95,000 / year');
    assert.equal(formatSalary({ max: 30, currency: 'USD', period: 'hourly' }), 'USD 30 / hour');
  });

  it('returns null when there is no amount', () => {
    assert.equal(formatSalary({ min: null, max: 0, currency: 'USD' }), null);
  });
});
