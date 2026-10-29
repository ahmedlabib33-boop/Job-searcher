import assert from 'node:assert/strict';
import { after, before, describe, it } from 'node:test';
import { createApp } from '../src/server.js';

let lastClient = null;

const provider = {
  id: 'fake',
  name: 'Fake Jobs',
  homepage: 'https://fake.example',
  description: 'Test source',
  modes: ['onsite', 'remote'],
  setupHint: null,
  isConfigured: () => true,
  search: async (params, ctx) => {
    lastClient = ctx.client;
    return {
      jobs: [{
        id: `fake:${params.q}`,
        title: `${params.q} role`,
        company: 'Test Co',
        remote: false,
        type: 'fulltime',
        postedAt: new Date().toISOString(),
        url: 'https://fake.example/apply',
        source: 'fake',
      }],
      hasMore: false,
    };
  },
};

describe('server', () => {
  let server;
  let base;

  before(async () => {
    const app = createApp({ providers: [provider], env: {}, log: () => {} });
    server = app.listen(0);
    await new Promise((resolve) => server.once('listening', resolve));
    base = `http://127.0.0.1:${server.address().port}`;
  });

  after(() => server.close());

  it('searches through /api/search', async () => {
    const response = await fetch(`${base}/api/search?q=pharmacist&area=heliopolis`);
    assert.equal(response.status, 200);
    const body = await response.json();
    assert.equal(body.params.q, 'pharmacist');
    assert.equal(body.params.area, 'heliopolis');
    assert.deepEqual(body.jobs.map((job) => job.title), ['pharmacist role']);
    assert.equal(body.sources[0].status, 'ok');
  });

  it('passes the visitor’s browser and page on to sources that need them', async () => {
    await fetch(`${base}/api/search?q=nurse`, { headers: { 'user-agent': 'TestBrowser/1.0', referer: 'http://localhost/?q=nurse' } });
    assert.equal(lastClient.userAgent, 'TestBrowser/1.0');
    assert.equal(lastClient.referer, 'http://localhost/?q=nurse');
    assert.ok(lastClient.ip);
  });

  it('lists areas and sources through /api/meta', async () => {
    const body = await (await fetch(`${base}/api/meta`)).json();
    assert.ok(body.areas.some((area) => area.id === 'new-cairo'));
    assert.deepEqual(body.sources.map((source) => [source.id, source.configured]), [['fake', true]]);
  });

  it('answers unknown API routes with JSON 404', async () => {
    const response = await fetch(`${base}/api/unknown`);
    assert.equal(response.status, 404);
    assert.deepEqual(await response.json(), { error: 'Not found' });
  });

  it('serves the web page with security headers', async () => {
    const response = await fetch(`${base}/`);
    assert.equal(response.status, 200);
    assert.match(await response.text(), /Cairo Job Finder/);
    assert.match(response.headers.get('content-security-policy'), /script-src 'self'/);
    assert.equal(response.headers.get('x-content-type-options'), 'nosniff');
  });
});
