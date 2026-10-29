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
  if (!html) return '';
  const text = String(html)
    .replace(/<(script|style)[\s\S]*?<\/\1>/gi, '')
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<li[^>]*>/gi, '\n• ')
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
  // Numbers are Unix timestamps; anything below 1e12 is in seconds.
  const date = typeof value === 'number'
    ? new Date(value < 1e12 ? value * 1000 : value)
    : new Date(value);
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

// Local keyword search for sources that have no search of their own:
// every word of the query must appear somewhere in the given fields.
export function matchesKeywords(fields, query) {
  const words = String(query ?? '').toLowerCase().split(/\s+/).filter(Boolean);
  if (words.length === 0) return true;
  const haystack = fields.flat().filter(Boolean).join(' ').toLowerCase();
  return words.every((word) => haystack.includes(word));
}

const OPEN_TO_EGYPT = /\b(worldwide|anywhere|global|egypt|cairo|(?<!south )africa|middle east|mena|emea|eet|cet|(gmt|utc) ?\+ ?[23])\b/i;

// Remote boards describe who may apply in free text ("Anywhere in the World",
// "EMEA", "USA only"). An empty value means the board didn't say, so the job is kept.
export function isOpenToEgypt(location) {
  const text = String(location ?? '').trim();
  if (!text || /^remote$/i.test(text)) return true;
  if (/egypt|cairo/i.test(text)) return true;
  if (/anywhere in (?!the world)/i.test(text)) return false;
  return OPEN_TO_EGYPT.test(text);
}

function unwrapXmlText(content) {
  const cdata = content.match(/^\s*<!\[CDATA\[([\s\S]*?)\]\]>\s*$/);
  return (cdata ? cdata[1] : decodeEntities(content)).trim();
}

// Minimal RSS reader: each <item> becomes an object of its child elements.
// Text elements map to their (unescaped) text; self-closing elements such as
// <media:content url="…"/> map to their attributes.
export function parseRssItems(xml) {
  const items = [];
  for (const [, body] of String(xml).matchAll(/<item\b[^>]*>([\s\S]*?)<\/item>/gi)) {
    const item = {};
    for (const [, tag, attributes] of body.matchAll(/<([\w:-]+)([^>]*?)\/>/g)) {
      item[tag] ??= Object.fromEntries(
        [...attributes.matchAll(/([\w:-]+)="([^"]*)"/g)].map(([, name, value]) => [name, decodeEntities(value)]),
      );
    }
    for (const [, tag, content] of body.matchAll(/<([\w:-]+)(?:\s[^>]*)?>([\s\S]*?)<\/\1>/g)) {
      item[tag] ??= unwrapXmlText(content);
    }
    items.push(item);
  }
  return items;
}

const RELATIVE_UNITS_MS = {
  minute: 60_000, hour: 3_600_000, day: 86_400_000, week: 604_800_000, month: 2_592_000_000,
};

// Google Jobs gives ages, not dates: "17 hours ago", "3 days ago", "30+ days ago".
export function relativeAgeToIso(text, nowMs) {
  const value = String(text ?? '').toLowerCase();
  if (/just posted|today|just now/.test(value)) return new Date(nowMs).toISOString();
  if (/yesterday/.test(value)) return new Date(nowMs - RELATIVE_UNITS_MS.day).toISOString();
  const match = value.match(/(\d+)\+?\s*(minute|hour|day|week|month)s?\s+ago/);
  if (!match) return null;
  return new Date(nowMs - Number(match[1]) * RELATIVE_UNITS_MS[match[2]]).toISOString();
}

export function looksRemote(...texts) {
  return /\b(remote|work from home|wfh|telecommute)\b/i.test(texts.filter(Boolean).join(' '));
}
