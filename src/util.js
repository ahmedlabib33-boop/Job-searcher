import { PAGE_SIZE } from './params.js';

const ENTITIES = {
  amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' ',
  lsquo: '‘', rsquo: '’', ldquo: '“', rdquo: '”', ndash: '–', mdash: '—',
  hellip: '…', bull: '•', middot: '·', euro: '€', pound: '£', copy: '©', reg: '®', trade: '™',
};

export function decodeEntities(text) {
  return text.replace(/&(#x[0-9a-f]+|#\d+|[a-z]+);/gi, (match, code) => {
    if (code[0] === '#') {
      const point = code[1].toLowerCase() === 'x'
        ? Number.parseInt(code.slice(2), 16)
        : Number.parseInt(code.slice(1), 10);
      return Number.isFinite(point) && point <= 0x10ffff ? String.fromCodePoint(point) : match;
    }
    return ENTITIES[code.toLowerCase()] ?? match;
  });
}

// Job descriptions arrive as HTML; the UI only ever shows plain text.
export function htmlToText(html) {
  if (typeof html !== 'string' && typeof html !== 'number') return '';
  const text = String(html)
    .replace(/<(script|style)[\s\S]*?<\/\1>/gi, '')
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<li\b[^>]*>/gi, '\n• ')
    .replace(/<\/(p|div|h[1-6]|li|ul|ol|tr)>/gi, '\n')
    .replace(/<[^>]+>/g, '');
  return decodeEntities(text)
    .replace(/[ \t\f\v ]+/g, ' ')
    .replace(/ *\n */g, '\n')
    // `<li><p>text</p></li>` would otherwise leave the bullet alone on its line
    // and a blank line between items.
    .replace(/• *\n+/g, '• ')
    .replace(/\n{2,}(?=• )/g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

export function truncate(text, max) {
  if (!text || text.length <= max) return text ?? '';
  const cut = text.slice(0, max);
  const lastSpace = cut.lastIndexOf(' ');
  return `${(lastSpace > max * 0.6 ? cut.slice(0, lastSpace) : cut).trimEnd()}…`;
}

// Only http(s) links ever reach the browser, so a feed can't inject javascript: URLs.
// Valid links are passed through untouched: some sources require their apply
// links to be used exactly as given.
export function safeUrl(value) {
  if (!value) return null;
  const text = String(value).trim();
  try {
    const { protocol } = new URL(text);
    return protocol === 'https:' || protocol === 'http:' ? text : null;
  } catch {
    return null;
  }
}

export function toIsoDate(value) {
  if (value === null || value === undefined || value === '') return null;
  if (typeof value === 'number') {
    // Unix timestamps; anything below 1e12 is in seconds. 0 means "no date".
    if (!(value > 0)) return null;
    return new Date(value < 1e12 ? value * 1000 : value).toISOString();
  }
  // A date and time with no time zone (Jooble sends these) would otherwise be
  // read in the server's own time zone; treat it as UTC like the rest.
  const text = String(value).trim();
  const date = new Date(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(:\d{2}(\.\d+)?)?$/.test(text) ? `${text}Z` : text);
  return Number.isNaN(date.getTime()) ? null : date.toISOString();
}

const TYPE_PATTERNS = [
  ['internship', /intern/i],
  ['parttime', /part[\s_-]?time/i],
  ['contract', /contract|freelance|temporary|temp\b/i],
  ['fulltime', /full[\s_-]?time/i],
];

// Maps each source's employment type wording onto our filter values.
export function normalizeJobType(value) {
  const values = Array.isArray(value) ? value : [value];
  for (const [type, pattern] of TYPE_PATTERNS) {
    if (values.some((v) => typeof v === 'string' && pattern.test(v))) return type;
  }
  return null;
}

const PERIOD_LABELS = {
  hour: 'hour', hourly: 'hour',
  day: 'day', daily: 'day',
  week: 'week', weekly: 'week',
  month: 'month', monthly: 'month',
  year: 'year', yearly: 'year', annual: 'year', annually: 'year',
};

export function formatSalary({ min, max, currency, period }) {
  const amount = (n) => (Number.isFinite(n) && n > 0 ? Math.round(n).toLocaleString('en-US') : null);
  const low = amount(min);
  const high = amount(max);
  if (!low && !high) return null;
  const range = low && high && low !== high ? `${low}–${high}` : (low ?? high);
  const unit = PERIOD_LABELS[String(period ?? '').toLowerCase()];
  return [currency, range].filter(Boolean).join(' ') + (unit ? ` / ${unit}` : '');
}

// Feeds that are fetched whole are paged through locally.
export function pageOf(items, page) {
  const start = (page - 1) * PAGE_SIZE;
  return { jobs: items.slice(start, start + PAGE_SIZE), hasMore: start + PAGE_SIZE < items.length };
}

// The words a query is made of, for sources that are told what to search for.
// `fallback` stands in for an empty query. Remote mode adds the word "remote".
export function searchKeywords(params, fallback = '') {
  return [params.q || fallback, params.mode === 'remote' ? 'remote' : ''].filter(Boolean).join(' ');
}

const escapeRegExp = (text) => text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

// Local keyword search for sources that have no search of their own: every
// word of the query must appear as a whole word (a plural also counts), so
// "hr" doesn't match "Chrome" and "java" doesn't match "JavaScript".
export function matchesKeywords(fields, query) {
  const words = String(query ?? '').toLowerCase().split(/\s+/).filter(Boolean);
  if (words.length === 0) return true;
  const haystack = fields.flat().filter(Boolean).join(' ').toLowerCase();
  return words.every((word) =>
    new RegExp(`(?<![\\p{L}\\p{N}])${escapeRegExp(word)}(?:e?s)?(?![\\p{L}\\p{N}])`, 'u').test(haystack));
}

const OPEN_REGIONS = /\b((?<!south )africa|middle east|mena|emea)\b/i;
const OPEN_TO_EGYPT = /\b(worldwide|anywhere|global|egypt|cairo|(?<!south )africa|middle east|mena|emea|eet|cet|(gmt|utc) ?\+ ?[23])\b/i;

// Remote boards describe who may apply in free text ("Anywhere in the World",
// "EMEA", "USA only"). An empty value means the board didn't say, so the job is kept.
export function isOpenToEgypt(location) {
  const text = String(location ?? '').trim();
  if (!text || /^remote$/i.test(text)) return true;
  if (/egypt|cairo/i.test(text)) return true;
  // "Anywhere in India" names somewhere else; "Anywhere in EMEA" includes Egypt.
  const anywhereIn = text.match(/anywhere in (?!the world)(.+)/i);
  if (anywhereIn) return OPEN_REGIONS.test(anywhereIn[1]);
  return OPEN_TO_EGYPT.test(text);
}

function unwrapXmlText(content) {
  const cdata = content.match(/^\s*<!\[CDATA\[([\s\S]*?)\]\]>\s*$/);
  return (cdata ? cdata[1] : decodeEntities(content)).trim();
}

// Minimal RSS reader: each <item> becomes an object of its child elements.
// Text elements map to their (unescaped) text. Self-closing elements map to
// their attributes, such as <media:content url="…"/>, or to '' when they
// have none, such as an empty <region/>.
export function parseRssItems(xml) {
  const items = [];
  for (const [, body] of String(xml).matchAll(/<item\b[^>]*>([\s\S]*?)<\/item>/gi)) {
    const item = {};
    for (const [, tag, content] of body.matchAll(/<([\w:-]+)(?:\s[^>]*)?>([\s\S]*?)<\/\1>/g)) {
      item[tag] ??= unwrapXmlText(content);
    }
    // HTML inside CDATA (<br/>, <img/>) is description text, not item fields.
    const outsideCdata = body.replace(/<!\[CDATA\[[\s\S]*?\]\]>/g, '');
    for (const [, tag, attributes] of outsideCdata.matchAll(/<([\w:-]+)([^>]*?)\/>/g)) {
      const pairs = [...attributes.matchAll(/([\w:-]+)="([^"]*)"/g)];
      item[tag] ??= pairs.length
        ? Object.fromEntries(pairs.map(([, name, value]) => [name, decodeEntities(value)]))
        : '';
    }
    items.push(item);
  }
  return items;
}

const RELATIVE_UNITS_MS = {
  minute: 60_000, hour: 3_600_000, day: 86_400_000, week: 604_800_000, month: 2_592_000_000, year: 31_536_000_000,
};

// Google Jobs gives ages, not dates: "17 hours ago", "a day ago", "30+ days ago".
// "30+" means older than 30, so it is counted as one unit more and falls
// outside a "last 30 days" filter.
export function relativeAgeToIso(text, nowMs) {
  const value = String(text ?? '').toLowerCase();
  if (/just posted|today|just now/.test(value)) return new Date(nowMs).toISOString();
  if (/yesterday/.test(value)) return new Date(nowMs - RELATIVE_UNITS_MS.day).toISOString();
  const match = value.match(/(\d+|an?|one)(\+?)\s*(minute|hour|day|week|month|year)s?\s+ago/);
  if (!match) return null;
  const count = (/^\d+$/.test(match[1]) ? Number(match[1]) : 1) + (match[2] ? 1 : 0);
  return new Date(nowMs - count * RELATIVE_UNITS_MS[match[3]]).toISOString();
}

// For short fields (title, location): any mention of remote work counts.
export function looksRemote(...texts) {
  return /\b(remote|work from home|wfh|telecommute)\b/i.test(texts.filter(Boolean).join(' '));
}

// For long descriptions: only clear phrases count, and "not remote" doesn't.
export function describesRemoteWork(text) {
  const value = String(text ?? '');
  if (/\b(not|no|non)[\s-]+remote\b|\bnot (a )?remote\b/i.test(value)) return false;
  return /\b(fully remote|100% remote|remote[\s-](first|friendly|job|role|position|work|working|opportunity)|work(ing)? (from|at) home|wfh)\b/i.test(value);
}
