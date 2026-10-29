import { AREAS } from './areas.js';

export const MODES = ['any', 'onsite', 'remote'];
export const JOB_TYPES = ['any', 'fulltime', 'parttime', 'contract', 'internship'];
export const POSTED = ['any', '1', '3', '7', '30'];

export const PAGE_SIZE = 20;
const MAX_PAGE = 20;
const MAX_QUERY_LENGTH = 100;

function oneOf(value, allowed, fallback) {
  return allowed.includes(value) ? value : fallback;
}

// Turns raw query-string values into a validated search request.
// `sources` limits the search to some sources (used by "Load more" to skip
// sources that have run out); null means all of them.
export function parseSearchParams(raw = {}) {
  const text = (value) => (typeof value === 'string' ? value : '');
  const page = Number.parseInt(text(raw.page), 10);
  const sources = text(raw.sources).split(',').map((id) => id.trim()).filter(Boolean);

  return {
    q: text(raw.q).replace(/\s+/g, ' ').trim().slice(0, MAX_QUERY_LENGTH),
    area: oneOf(text(raw.area), AREAS.map((area) => area.id), 'all'),
    mode: oneOf(text(raw.mode), MODES, 'any'),
    type: oneOf(text(raw.type), JOB_TYPES, 'any'),
    posted: oneOf(text(raw.posted), POSTED, 'any'),
    page: Number.isInteger(page) && page >= 1 ? Math.min(page, MAX_PAGE) : 1,
    sources: sources.length > 0 ? sources : null,
  };
}
