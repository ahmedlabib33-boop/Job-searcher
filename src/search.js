import { describeError } from './http.js';

const DAY_MS = 24 * 60 * 60 * 1000;

// Sources apply filters with different precision, so every job is checked
// again here to make results consistent no matter where they came from.
export function matchesFilters(job, params, nowMs) {
  if (params.mode === 'onsite' && job.remote) return false;
  if (params.mode === 'remote' && !job.remote) return false;
  if (params.type !== 'any' && job.type !== params.type) return false;
  if (params.posted !== 'any') {
    const posted = Date.parse(job.postedAt ?? '');
    if (Number.isNaN(posted) || nowMs - posted > Number(params.posted) * DAY_MS) return false;
  }
  return true;
}

function dedupeKey(job) {
  const clean = (text) => (text ?? '').toLowerCase().replace(/[^\p{L}\p{N}]+/gu, ' ').trim();
  return `${clean(job.title)}|${clean(job.company)}`;
}

export function dedupeJobs(jobs) {
  const seen = new Set();
  return jobs.filter((job) => {
    const key = dedupeKey(job);
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function newestFirst(a, b) {
  const time = (job) => Date.parse(job.postedAt ?? '') || 0;
  return time(b) - time(a);
}

export function describeSource(provider, env) {
  return {
    id: provider.id,
    name: provider.name,
    homepage: provider.homepage,
    description: provider.description,
    modes: provider.modes,
    configured: provider.isConfigured(env),
    setupHint: provider.setupHint,
  };
}

async function searchOne(provider, params, ctx) {
  const source = describeSource(provider, ctx.env);
  if (!source.configured) return { ...source, status: 'not_configured', jobs: [] };
  if (params.sources && !params.sources.includes(provider.id)) return { ...source, status: 'skipped', jobs: [] };
  if (params.mode !== 'any' && !provider.modes.includes(params.mode)) return { ...source, status: 'skipped', jobs: [] };

  try {
    const { jobs, hasMore } = await provider.search(params, ctx);
    const nowMs = ctx.now();
    return {
      ...source,
      status: 'ok',
      jobs: jobs.filter((job) => job.url && matchesFilters(job, params, nowMs)),
      hasMore,
    };
  } catch (error) {
    ctx.log?.(`[${provider.id}] ${error.message}`);
    return { ...source, status: 'error', message: describeError(error), jobs: [] };
  }
}

export async function searchJobs(params, { providers, env, fetchJson, cache, now = Date.now, log }) {
  const ctx = {
    env,
    fetchJson,
    now,
    log,
    cached: (key, ttlMs, load) => cache.getOrLoad(key, ttlMs, load),
  };
  const outcomes = await Promise.all(providers.map((provider) => searchOne(provider, params, ctx)));

  return {
    jobs: dedupeJobs(outcomes.flatMap((outcome) => outcome.jobs)).sort(newestFirst),
    sources: outcomes.map(({ jobs, hasMore, ...source }) => ({
      ...source,
      count: jobs.length,
      hasMore: Boolean(hasMore),
    })),
  };
}
