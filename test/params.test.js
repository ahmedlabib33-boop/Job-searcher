import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { parseSearchParams } from '../src/params.js';

describe('parseSearchParams', () => {
  it('fills in defaults', () => {
    assert.deepEqual(parseSearchParams({}), {
      q: '', area: 'all', mode: 'any', type: 'any', posted: 'any', page: 1, sources: null,
    });
  });

  it('keeps valid values', () => {
    const params = parseSearchParams({
      q: '  data   analyst ', area: 'maadi', mode: 'onsite', type: 'internship', posted: '7', page: '3',
      sources: 'jsearch, himalayas',
    });
    assert.deepEqual(params, {
      q: 'data analyst', area: 'maadi', mode: 'onsite', type: 'internship', posted: '7', page: 3,
      sources: ['jsearch', 'himalayas'],
    });
  });

  it('replaces invalid values with defaults', () => {
    const params = parseSearchParams({ area: 'alexandria', mode: 'hybrid', type: ['a', 'b'], posted: '2', page: '-4' });
    assert.equal(params.area, 'all');
    assert.equal(params.mode, 'any');
    assert.equal(params.type, 'any');
    assert.equal(params.posted, 'any');
    assert.equal(params.page, 1);
  });

  it('caps the query length and page number', () => {
    const params = parseSearchParams({ q: 'x'.repeat(500), page: '9999' });
    assert.equal(params.q.length, 100);
    assert.equal(params.page, 20);
  });
});
