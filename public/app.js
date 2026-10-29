const DEFAULTS = { q: '', area: 'all', mode: 'any', type: 'any', posted: 'any' };
const TYPE_LABELS = {
  fulltime: 'Full-time',
  parttime: 'Part-time',
  contract: 'Contract / freelance',
  internship: 'Internship',
};
const SAVED_KEY = 'cairo-job-finder:saved';

const $ = (selector) => document.querySelector(selector);
const form = $('#search-form');
const resultsList = $('#results');
const savedList = $('#saved');
const statusEl = $('#status');
const sourcesEl = $('#sources');
const loadMoreBtn = $('#load-more');
const template = $('#job-template');

const state = {
  params: { ...DEFAULTS },
  page: 1,
  jobs: [],
  seen: new Set(),
  // Sources that said they have more results for the current search.
  moreFrom: [],
  sourceCounts: {},
  sources: [],
  areas: [],
  requestId: 0,
};

// ---------- Saved jobs (kept in this browser only) ----------

function readSaved() {
  try {
    const parsed = JSON.parse(localStorage.getItem(SAVED_KEY) ?? '[]');
    return new Map(Array.isArray(parsed) ? parsed.map((job) => [job.id, job]) : []);
  } catch {
    return new Map();
  }
}

const saved = readSaved();

function writeSaved() {
  try {
    localStorage.setItem(SAVED_KEY, JSON.stringify([...saved.values()]));
  } catch {
    // Storage can be full or blocked (private mode); saving then lasts for this visit only.
  }
}

function toggleSaved(job) {
  if (saved.has(job.id)) saved.delete(job.id);
  else saved.set(job.id, { ...job, savedAt: new Date().toISOString() });
  writeSaved();
  syncSaveButtons();
  renderSaved();
}

function syncSaveButtons() {
  for (const button of document.querySelectorAll('.save-btn')) {
    const isSaved = saved.has(button.dataset.jobId);
    button.setAttribute('aria-pressed', String(isSaved));
    button.setAttribute('aria-label', isSaved ? 'Remove from saved jobs' : 'Save this job');
    button.title = isSaved ? 'Saved' : 'Save';
  }
  $('#saved-count').textContent = String(saved.size);
}

// ---------- Rendering ----------

const relativeTime = new Intl.RelativeTimeFormat('en', { numeric: 'auto' });

function postedLabel(iso) {
  const time = Date.parse(iso ?? '');
  if (Number.isNaN(time)) return null;
  const days = Math.floor((Date.now() - time) / 86_400_000);
  if (days < 1) return 'Posted today';
  if (days < 7) return `Posted ${relativeTime.format(-days, 'day')}`;
  if (days < 30) return `Posted ${relativeTime.format(-Math.floor(days / 7), 'week')}`;
  return `Posted ${relativeTime.format(-Math.floor(days / 30), 'month')}`;
}

function initials(text) {
  const words = (text ?? '').trim().split(/\s+/).filter(Boolean);
  return (words.slice(0, 2).map((word) => [...word][0]).join('') || '?').toUpperCase();
}

function sourceName(id) {
  return state.sources.find((source) => source.id === id)?.name ?? id;
}

function renderSourceCredit(container, job) {
  const source = state.sources.find((s) => s.id === job.source);
  const link = document.createElement('a');
  link.href = job.sourceUrl ?? source?.homepage ?? '#';
  link.target = '_blank';
  link.rel = 'noopener';
  link.textContent = source?.name ?? job.source;
  if (job.publisher) {
    container.append(`via ${job.publisher} · found by `, link);
  } else {
    container.append('via ', link);
  }
}

function renderJob(job) {
  const node = template.content.firstElementChild.cloneNode(true);

  const logo = node.querySelector('.logo');
  logo.querySelector('.logo-initials').textContent = initials(job.company ?? job.title);
  if (job.companyLogo) {
    const img = document.createElement('img');
    img.alt = '';
    img.loading = 'lazy';
    img.referrerPolicy = 'no-referrer';
    img.addEventListener('error', () => img.remove());
    img.src = job.companyLogo;
    logo.append(img);
  }

  node.querySelector('.job-title').textContent = job.title;
  node.querySelector('.job-company').textContent = job.company ?? '';
  node.querySelector('.job-location').textContent = job.location ?? '';

  const tags = node.querySelector('.tags');
  const addTag = (text, className = '') => {
    if (!text) return;
    const li = document.createElement('li');
    li.className = `tag ${className}`.trim();
    li.textContent = text;
    tags.append(li);
  };
  addTag(job.remote ? 'Remote' : 'On-site', job.remote ? 'remote' : 'onsite');
  addTag(TYPE_LABELS[job.type]);
  addTag(job.salary, 'salary');
  addTag(postedLabel(job.postedAt));

  node.querySelector('.job-summary').textContent = job.summary ?? '';
  const details = node.querySelector('.job-details');
  if (job.description && job.description !== job.summary) {
    details.querySelector('.job-description').textContent = job.description;
  } else {
    details.remove();
  }

  renderSourceCredit(node.querySelector('.job-source'), job);

  const apply = node.querySelector('.apply-btn');
  apply.href = job.url;
  apply.setAttribute('aria-label', `Apply for ${job.title}${job.company ? ` at ${job.company}` : ''} (opens in a new tab)`);

  const saveBtn = node.querySelector('.save-btn');
  saveBtn.dataset.jobId = job.id;
  saveBtn.addEventListener('click', () => toggleSaved(job));

  return node;
}

function renderEmpty(list, title, text) {
  const li = document.createElement('li');
  li.className = 'empty';
  const strong = document.createElement('strong');
  strong.textContent = title;
  li.append(strong, text);
  list.replaceChildren(li);
}

function renderSkeletons() {
  const items = Array.from({ length: 4 }, () => {
    const li = document.createElement('li');
    li.className = 'job skeleton';
    li.setAttribute('aria-hidden', 'true');
    li.append(document.createElement('article'));
    return li;
  });
  resultsList.replaceChildren(...items);
}

function renderSaved() {
  const jobs = [...saved.values()].sort((a, b) => (b.savedAt ?? '').localeCompare(a.savedAt ?? ''));
  $('#saved-status').textContent = jobs.length
    ? `${jobs.length} saved ${jobs.length === 1 ? 'job' : 'jobs'}, kept in this browser.`
    : '';
  if (jobs.length === 0) {
    renderEmpty(savedList, 'No saved jobs yet', 'Tap the bookmark on any job to keep it here.');
  } else {
    savedList.replaceChildren(...jobs.map(renderJob));
  }
  syncSaveButtons();
}

function renderSources() {
  const connected = state.sources.filter((source) => source.status !== 'not_configured');
  const chips = connected.map((source) => {
    const li = document.createElement('li');
    li.className = 'source';
    let label = source.name;
    if (source.status === 'ok') {
      li.classList.add('ok');
      label += ` · ${state.sourceCounts[source.id] ?? 0}`;
    } else if (source.status === 'error') {
      li.classList.add('error');
      label += ` · ${source.message ?? 'unavailable'}`;
    } else if (source.status === 'skipped') {
      li.classList.add('off');
      label += ' · not used';
      li.title = 'This source has no jobs matching the work mode you picked.';
    } else {
      li.classList.add('off');
    }
    li.textContent = label;
    return li;
  });

  const notConnected = state.sources.length - connected.length;
  if (notConnected > 0) {
    const li = document.createElement('li');
    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'source source-more';
    button.textContent = `+${notConnected} not connected`;
    button.addEventListener('click', () => showTab('sources'));
    li.append(button);
    chips.push(li);
  }
  sourcesEl.replaceChildren(...chips);
}

function describeSearch(params) {
  const area = state.areas.find((a) => a.id === params.area);
  const parts = [];
  if (params.q) parts.push(`for “${params.q}”`);
  if (params.mode === 'remote') parts.push('(remote)');
  else if (area && params.area !== 'all') parts.push(`in ${area.label}`);
  return parts.join(' ');
}

function renderResults() {
  const count = state.jobs.length;
  statusEl.classList.remove('error');

  if (count === 0) {
    const allFailed = state.sources.every((s) => s.status === 'error' || s.status === 'not_configured' || s.status === 'skipped')
      && state.sources.some((s) => s.status === 'error');
    statusEl.textContent = 'No jobs found.';
    if (allFailed) {
      statusEl.classList.add('error');
      renderEmpty(resultsList, 'Job sources could not be reached', 'Check your internet connection and try again in a minute.');
    } else if (state.params.mode === 'onsite' && !hasOnsiteSource()) {
      renderEmpty(resultsList, 'On-site jobs need an API key', 'Connect one of the on-site sources (see the Sources tab), or switch the work mode to “Any” to see remote jobs.');
    } else {
      renderEmpty(resultsList, 'No jobs match this search', 'Try a broader job title, another area, or fewer filters.');
    }
  } else {
    statusEl.textContent = `${count} ${count === 1 ? 'job' : 'jobs'} ${describeSearch(state.params)}`.trim();
  }
  renderSources();
  loadMoreBtn.hidden = state.moreFrom.length === 0 || count === 0;
  syncSaveButtons();
}

// ---------- Searching ----------

function readForm() {
  return {
    q: $('#q').value.trim(),
    area: $('#area').value,
    mode: $('#mode [aria-pressed="true"]')?.dataset.mode ?? 'any',
    type: $('#type').value,
    posted: $('#posted').value,
  };
}

function writeForm(params) {
  $('#q').value = params.q;
  for (const key of ['area', 'type', 'posted']) {
    const select = $(`#${key}`);
    select.value = params[key];
    // Unknown values (an old or hand-edited link) fall back to the default.
    if (select.value !== params[key]) select.value = DEFAULTS[key];
  }
  const modes = [...document.querySelectorAll('#mode button')];
  const mode = modes.some((button) => button.dataset.mode === params.mode) ? params.mode : DEFAULTS.mode;
  for (const button of modes) {
    button.setAttribute('aria-pressed', String(button.dataset.mode === mode));
  }
}

function paramsFromUrl() {
  const query = new URLSearchParams(location.search);
  const params = { ...DEFAULTS };
  for (const key of Object.keys(DEFAULTS)) {
    if (query.has(key)) params[key] = query.get(key);
  }
  return params;
}

function syncUrl(params) {
  const query = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) {
    if (value && value !== DEFAULTS[key]) query.set(key, value);
  }
  const search = query.toString();
  history.replaceState(null, '', search ? `?${search}` : location.pathname);
}

async function search({ append = false } = {}) {
  const requestId = ++state.requestId;

  if (!append) {
    state.params = readForm();
    state.page = 1;
    state.jobs = [];
    state.seen = new Set();
    state.sourceCounts = {};
    state.moreFrom = [];
    syncUrl(state.params);
    renderSkeletons();
    statusEl.classList.remove('error');
    statusEl.textContent = 'Searching…';
    loadMoreBtn.hidden = true;
  } else {
    state.page += 1;
    loadMoreBtn.disabled = true;
    loadMoreBtn.textContent = 'Loading…';
  }

  const query = new URLSearchParams({ ...state.params, page: String(state.page) });
  if (append) query.set('sources', state.moreFrom.join(','));

  try {
    const response = await fetch(`/api/search?${query}`);
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    const data = await response.json();
    // A newer search started while this one was loading; its results win.
    if (requestId !== state.requestId) return;

    for (const job of data.jobs) {
      const key = `${job.title}|${job.company}`.toLowerCase();
      if (state.seen.has(job.id) || state.seen.has(key)) continue;
      state.seen.add(job.id);
      state.seen.add(key);
      state.jobs.push(job);
    }
    for (const source of data.sources) {
      state.sourceCounts[source.id] = (state.sourceCounts[source.id] ?? 0) + source.count;
    }
    // When loading more, sources that were skipped keep the status they had.
    state.sources = append
      ? state.sources.map((old) => {
          const fresh = data.sources.find((s) => s.id === old.id);
          return fresh && fresh.status !== 'skipped' ? fresh : old;
        })
      : data.sources;
    state.moreFrom = data.sources.filter((s) => s.status === 'ok' && s.hasMore).map((s) => s.id);

    resultsList.replaceChildren(...state.jobs.map(renderJob));
    renderResults();
  } catch {
    if (requestId !== state.requestId) return;
    if (append) {
      state.page -= 1;
    } else {
      renderEmpty(resultsList, 'Search failed', 'The app could not reach its server. Make sure it is running and try again.');
    }
    statusEl.classList.add('error');
    statusEl.textContent = 'Something went wrong. Please try again.';
  } finally {
    if (requestId === state.requestId) {
      loadMoreBtn.disabled = false;
      loadMoreBtn.textContent = 'Load more jobs';
    }
  }
}

// ---------- Setup ----------

function showTab(name) {
  for (const tab of ['results', 'saved', 'sources']) {
    const active = tab === name;
    $(`#tab-${tab}`).setAttribute('aria-selected', String(active));
    $(`#panel-${tab}`).hidden = !active;
  }
  if (name === 'saved') renderSaved();
}

function isOnsiteSource(source) {
  return source.modes.includes('onsite');
}

function hasOnsiteSource() {
  return state.sources.some((source) => source.configured && isOnsiteSource(source));
}

function externalLink(href, text) {
  const link = document.createElement('a');
  link.href = href;
  link.target = '_blank';
  link.rel = 'noopener';
  link.textContent = text;
  return link;
}

function listWithOr(names) {
  return names.length > 1 ? `${names.slice(0, -1).join(', ')} or ${names.at(-1)}` : (names[0] ?? '');
}

function renderSourceList(sources) {
  const items = sources.map((source) => {
    const li = document.createElement('li');
    li.className = 'source-card';

    const head = document.createElement('div');
    head.className = 'source-card-head';
    const name = document.createElement('h3');
    name.append(externalLink(source.homepage, source.name));
    const badge = document.createElement('span');
    badge.className = `badge ${source.configured ? 'badge-on' : 'badge-off'}`;
    badge.textContent = source.configured ? 'Connected' : 'Not connected';
    head.append(name, badge);

    const kind = document.createElement('p');
    kind.className = 'source-kind';
    kind.textContent = isOnsiteSource(source) ? 'On-site jobs in Cairo' : 'Remote jobs';

    const description = document.createElement('p');
    description.textContent = source.description;
    li.append(head, kind, description);

    if (!source.configured) {
      const setup = document.createElement('p');
      setup.className = 'source-setup';
      setup.append(source.setupHint ?? '');
      if (source.signupUrl) setup.append(' ', externalLink(source.signupUrl, 'Get a free key'));
      li.append(setup);
    }
    return li;
  });
  $('#source-list').replaceChildren(...items);
  $('#sources-count').textContent = `${sources.filter((s) => s.configured).length}/${sources.length}`;
}

async function loadMeta() {
  try {
    const response = await fetch('/api/meta');
    const meta = await response.json();
    state.areas = meta.areas;
    state.sources = meta.sources;
    $('#area').replaceChildren(...meta.areas.map((area) => new Option(area.label, area.id)));

    const missing = meta.sources.filter((source) => isOnsiteSource(source) && !source.configured);
    $('#setup-sources').textContent = listWithOr(missing.map((source) => source.name));
    $('#setup-notice').hidden = hasOnsiteSource() || missing.length === 0;

    const footer = $('#footer-sources');
    footer.replaceChildren();
    meta.sources.forEach((source, index) => {
      if (index > 0) footer.append(index === meta.sources.length - 1 ? ' and ' : ', ');
      footer.append(externalLink(source.homepage, source.name));
    });

    renderSourceList(meta.sources);
  } catch {
    // The search itself reports connection problems.
  }
}

function bindEvents() {
  form.addEventListener('submit', (event) => {
    event.preventDefault();
    showTab('results');
    search();
  });

  for (const select of ['#area', '#type', '#posted']) {
    $(select).addEventListener('change', () => search());
  }

  $('#mode').addEventListener('click', (event) => {
    const button = event.target.closest('button[data-mode]');
    if (!button) return;
    for (const other of document.querySelectorAll('#mode button')) {
      other.setAttribute('aria-pressed', String(other === button));
    }
    search();
  });

  for (const chip of document.querySelectorAll('.chip[data-q]')) {
    chip.addEventListener('click', () => {
      $('#q').value = chip.dataset.q;
      showTab('results');
      search();
    });
  }

  loadMoreBtn.addEventListener('click', () => search({ append: true }));
  $('#tab-results').addEventListener('click', () => showTab('results'));
  $('#tab-saved').addEventListener('click', () => showTab('saved'));
  $('#tab-sources').addEventListener('click', () => showTab('sources'));
  $('#show-sources').addEventListener('click', () => showTab('sources'));
}

async function init() {
  bindEvents();
  syncSaveButtons();
  await loadMeta();
  writeForm(paramsFromUrl());
  search();
}

init();
