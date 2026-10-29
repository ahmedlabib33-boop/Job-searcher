import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { TtlCache } from '../src/cache.js';

function fakeClock(start = 0) {
  let time = start;
  return { now: () => time, advance: (ms) => { time += ms; } };
}

describe('TtlCache', () => {
  it('reuses values until they expire', async () => {
    const clock = fakeClock();
    const cache = new TtlCache({ now: clock.now });
    let calls = 0;
    const load = async () => ++calls;

    assert.equal(await cache.getOrLoad('k', 1000, load), 1);
    assert.equal(await cache.getOrLoad('k', 1000, load), 1);
    clock.advance(1001);
    assert.equal(await cache.getOrLoad('k', 1000, load), 2);
  });

  it('shares one in-flight request between concurrent callers', async () => {
    const cache = new TtlCache();
    let calls = 0;
    const load = () => new Promise((resolve) => setTimeout(() => resolve(++calls), 5));
    const results = await Promise.all([cache.getOrLoad('k', 1000, load), cache.getOrLoad('k', 1000, load)]);
    assert.deepEqual(results, [1, 1]);
    assert.equal(calls, 1);
  });

  it('does not cache failures', async () => {
    const cache = new TtlCache();
    await assert.rejects(cache.getOrLoad('k', 1000, async () => { throw new Error('down'); }));
    assert.equal(await cache.getOrLoad('k', 1000, async () => 'ok'), 'ok');
  });

  it('evicts the oldest entries when full', async () => {
    const cache = new TtlCache({ maxEntries: 2 });
    await cache.getOrLoad('a', 1000, async () => 1);
    await cache.getOrLoad('b', 1000, async () => 2);
    await cache.getOrLoad('c', 1000, async () => 3);
    assert.deepEqual([...cache.entries.keys()], ['b', 'c']);
  });
});
