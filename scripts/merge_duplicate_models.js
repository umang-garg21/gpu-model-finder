const fs = require('fs');
const path = require('path');
const { URL } = require('url');

const DATA_PATH = path.join(__dirname, '..', 'data', 'models_artificialanalysis.json');

function safeParse(jsonStr) {
  try { return JSON.parse(jsonStr); } catch (e) { return null; }
}

function getSlugFromUrl(u) {
  try {
    const p = new URL(u).pathname.split('/').filter(Boolean);
    const idx = p.indexOf('models');
    if (idx >= 0 && p.length > idx + 1) return p[idx + 1];
    // fallback: last segment
    return p[p.length - 1] || u;
  } catch (e) {
    return u;
  }
}

function mergeMetrics(base = {}, other = {}) {
  const merged = Object.assign({}, base);
  for (const k of Object.keys(other)) {
    if (k === 'intelligence') {
      const a = merged.intelligence;
      const b = other.intelligence;
      if (typeof b === 'object' && b !== null) {
        if (typeof a === 'object' && a !== null) {
          merged.intelligence = Object.assign({}, a, b);
        } else {
          merged.intelligence = b;
        }
      } else if (typeof b === 'number') {
        if (merged.intelligence === undefined) merged.intelligence = b;
      } else if (merged.intelligence === undefined) {
        merged.intelligence = b;
      }
    } else {
      if (merged[k] === undefined || merged[k] === null) merged[k] = other[k];
    }
  }
  return merged;
}

function choosePrimary(entries, slug) {
  // prefer the canonical page `/models/<slug>` (no extra path segments)
  for (const e of entries) {
    try {
      const p = new URL(e.url).pathname.replace(/\/+$/, '');
      if (p.endsWith(`/models/${slug}`)) return e;
    } catch (err) { }
  }
  // prefer the entry with shortest pathname
  let best = entries[0];
  let bestLen = Infinity;
  for (const e of entries) {
    try {
      const len = new URL(e.url).pathname.split('/').length;
      if (len < bestLen) { bestLen = len; best = e; }
    } catch (err) { }
  }
  return best;
}

function run() {
  if (!fs.existsSync(DATA_PATH)) {
    console.error('data file not found:', DATA_PATH);
    process.exit(2);
  }
  const raw = fs.readFileSync(DATA_PATH, 'utf8');
  const top = safeParse(raw);
  if (!top || !Array.isArray(top.models)) {
    console.error('unexpected JSON structure in', DATA_PATH);
    process.exit(3);
  }

  const bySlug = new Map();
  for (const m of top.models) {
    const slug = getSlugFromUrl(m.url || (m.title || '').toLowerCase());
    if (!bySlug.has(slug)) bySlug.set(slug, []);
    bySlug.get(slug).push(m);
  }

  const merged = [];
  for (const [slug, entries] of bySlug.entries()) {
    if (entries.length === 1) { merged.push(entries[0]); continue; }
    const primary = choosePrimary(entries, slug);
    const others = entries.filter(e => e !== primary);
    const result = JSON.parse(JSON.stringify(primary));
    result.metrics = result.metrics || {};
    for (const o of others) {
      result.metrics = mergeMetrics(result.metrics, o.metrics || {});
      if (!result.title && o.title) result.title = o.title;
      if (result.status !== 'ok' && o.status === 'ok') result.status = 'ok';
    }
    merged.push(result);
  }

  const out = Object.assign({}, top, { models: merged });

  // backup
  const bak = DATA_PATH + '.bak.' + Date.now();
  fs.copyFileSync(DATA_PATH, bak);
  fs.writeFileSync(DATA_PATH, JSON.stringify(out, null, 2));

  console.log('merged', top.models.length, '->', merged.length, 'models. backup:', bak);
}

run();
