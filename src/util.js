const ENTITIES = {
  amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' ',
  lsquo: '‘', rsquo: '’', ldquo: '“', rdquo: '”', ndash: '–', mdash: '—',
  hellip: '…', bull: '•', middot: '·', euro: '€', pound: '£', copy: '©', reg: '®', trade: '™',
};

function decodeEntities(text) {
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
