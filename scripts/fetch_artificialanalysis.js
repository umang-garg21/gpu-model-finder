#!/usr/bin/env node
const axios = require('axios');
const cheerio = require('cheerio');
const fs = require('fs');
const path = require('path');

const BASE = 'https://artificialanalysis.ai';
const INDEX_URL = `${BASE}/models/`;

// Headless extraction using Puppeteer — used as a fallback when static parsing fails
async function fetchModelDetailsHeadless(url) {
  let browser = null;
  try {
    const puppeteer = require('puppeteer');
    // Use the newer headless mode and add common safe flags; increase timeouts below
    browser = await puppeteer.launch({
      headless: 'new',
      args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-dev-shm-usage'],
      defaultViewport: { width: 1200, height: 900 },
      ignoreHTTPSErrors: true,
    });
    const page = await browser.newPage();
    await page.setUserAgent('gpu-model-finder/1.0 (+https://github.com)');
    await page.goto(url, { waitUntil: 'networkidle2', timeout: 60000 });
    // evaluate page to capture any hydrated data structures and Chart.js instances
    const snapshot = await page.evaluate(() => {
      const out = {};
      try { out.nextData = window.__NEXT_DATA__ || null; } catch(e) { out.nextData = null; }
      try { out.apollo = window.__APOLLO_STATE__ || null; } catch(e) { out.apollo = null; }
      // try to capture Chart.js chart instances (Chart.getChart is v3+)
      out.charts = [];
      try {
        const canvases = Array.from(document.querySelectorAll('canvas'));
        canvases.forEach(c => {
          try {
            const maybeChart = (window.Chart && typeof window.Chart.getChart === 'function') ? window.Chart.getChart(c) : (c.__chartjs || null);
            if (maybeChart && maybeChart.data) {
              const labels = maybeChart.data.labels || [];
              const datasets = (maybeChart.data.datasets || []).map(d => ({ label: d.label || null, data: d.data || [] }));
              out.charts.push({ labels, datasets });
            }
          } catch (e) {}
        });
      } catch (e) {}
      // visible section text under headings
      out.visible = [];
      try {
        const heads = Array.from(document.querySelectorAll('h1,h2,h3,h4,h5'));
        heads.forEach(h => {
          if (/Intelligence Evaluations|Intelligence Index|Artificial Analysis Intelligence/i.test(h.innerText)) {
            let node = h.nextElementSibling;
            const parts = [];
            while (node) {
              if (/^H[1-5]$/.test(node.tagName)) break;
              parts.push(node.innerText || '');
              node = node.nextElementSibling;
            }
            if (parts.length) out.visible.push({ heading: h.innerText, text: parts.join('\n') });
          }
        });
      } catch (e) {}
      return out;
    });
    await page.close();
    return snapshot;
  } catch (e) {
    if (browser) try { await browser.close(); } catch (_) {}
    throw e;
  } finally {
    if (browser) try { await browser.close(); } catch (_) {}
  }
}

// Wrapper to call headless fetch with retries/backoff — helps transient Chromium launch/navigation issues
async function fetchModelDetailsHeadlessSafe(url, maxAttempts = 2) {
  let attempt = 0;
  let lastErr = null;
  const baseDelay = 500;
  while (attempt < maxAttempts) {
    try {
      return await fetchModelDetailsHeadless(url);
    } catch (e) {
      lastErr = e;
      attempt += 1;
      const backoff = baseDelay * Math.pow(2, attempt);
      await new Promise(r => setTimeout(r, backoff));
    }
  }
  throw lastErr;
}

async function fetchUrl(url, timeout = 15000) {
  const maxAttempts = 3;
  let attempt = 0;
  let lastErr = null;
  while (attempt < maxAttempts) {
    try {
      const resp = await axios.get(url, {
        timeout,
        headers: { 'User-Agent': 'gpu-model-finder/1.0 (+https://github.com)' },
      });
      return resp.data;
    } catch (err) {
      lastErr = err;
      attempt += 1;
      const backoff = 250 * Math.pow(2, attempt);
      await new Promise(r => setTimeout(r, backoff));
    }
  }
  throw lastErr;
}

function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

function findModelArray(obj) {
  const seen = new Set();
  function walk(v) {
    if (!v || typeof v !== 'object') return null;
    if (seen.has(v)) return null;
    seen.add(v);
    if (Array.isArray(v) && v.length > 0 && typeof v[0] === 'object') {
      const keys = Object.keys(v[0]).join(' ').toLowerCase();
      if (/name|model|title|score|accuracy|metrics|rank|url|author|id/.test(keys)) return v;
    }
    for (const k of Object.keys(v)) {
      const res = walk(v[k]);
      if (res) return res;
    }
    return null;
  }
  return walk(obj);
}

function extractMetricsFromJson(obj) {
  const metrics = {};
  function walk(o) {
    if (!o || typeof o !== 'object') return;
    for (const [k, v] of Object.entries(o)) {
      const key = k.toLowerCase();
      if (typeof v === 'number') {
        if (/mmlu/.test(key)) metrics.mmlu = v;
        else if (/humaneval|human_eval/.test(key)) metrics.humaneval = v;
        else if (/math(?!.*score)/.test(key)) metrics.math = v;
        else if (/gsm8k/.test(key)) metrics.gsm8k = v;
        else if (/wer/.test(key)) metrics.wer = v;
        else if (/mteb/.test(key)) metrics.mteb = v;
        else if (/imagenet.*top.?1/.test(key)) metrics.imagenet_top1 = v;
        else if (/clip.?score/.test(key)) metrics.clip_score = v;
        else if (/image_quality|imagequality/.test(key)) metrics.image_quality = v;
      } else if (typeof v === 'object') walk(v);
    }
  }
  walk(obj);
  return Object.keys(metrics).length ? metrics : null;
}

function extractTitleFromJson(obj) {
  let found = null;
  const seen = new Set();
  function walk(o) {
    if (!o || typeof o !== 'object') return;
    if (seen.has(o)) return;
    seen.add(o);
    for (const [k, v] of Object.entries(o)) {
      const key = k.toLowerCase();
      if (!found && (key === 'title' || key === 'name' || key === 'model' || key === 'id') && typeof v === 'string' && v.trim()) {
        found = v.trim();
        return;
      }
      if (typeof v === 'object') walk(v);
    }
  }
  walk(obj);
  return found;
}

function extractMetricsFromText(text) {
  const metrics = {};
  const patterns = [
    [/\bmmlu\b[^0-9\n%:\-]*([0-9]+(?:\.[0-9]+)?)/i, 'mmlu'],
    [/\bhumaneval\b[^0-9\n%:\-]*([0-9]+(?:\.[0-9]+)?)/i, 'humaneval'],
    [/\bmath\b[^0-9\n%:\-]*([0-9]+(?:\.[0-9]+)?)/i, 'math'],
    [/\bgsm8k\b[^0-9\n%:\-]*([0-9]+(?:\.[0-9]+)?)/i, 'gsm8k'],
    [/\bwer\b[^0-9\n%:\-]*([0-9]+(?:\.[0-9]+)?)/i, 'wer'],
    [/\bmteb\b[^0-9\n%:\-]*([0-9]+(?:\.[0-9]+)?)/i, 'mteb'],
    [/imagenet[^0-9]*top.?1[^0-9\n%:\-]*([0-9]+(?:\.[0-9]+)?)/i, 'imagenet_top1'],
    [/clip[^0-9]*score[^0-9\n%:\-]*([0-9]+(?:\.[0-9]+)?)/i, 'clip_score'],
    [/image[_\s-]*quality[^0-9\n%:\-]*([0-9]+(?:\.[0-9]+)?)/i, 'image_quality'],
  ];
  for (const [re, name] of patterns) {
    const m = text.match(re);
    if (m) metrics[name] = parseFloat(m[1]);
  }
  // Additional text heuristics
  const mIntl = text.match(/(?:scores|score|scored)\s*([0-9]{1,3}(?:\.[0-9])?)/i);
  if (mIntl && !metrics.intelligence) metrics.intelligence = parseFloat(mIntl[1]);
  const mSpeed = text.match(/(?:Output Speed|Output tokens per second|generates output at)\D*([0-9]+(?:\.[0-9]+)?)/i);
  if (mSpeed && !metrics.speed) metrics.speed = parseFloat(mSpeed[1]);
  const mInPrice = text.match(/Input Price[^\$\d\n\-\:]*\$?([0-9]+(?:\.[0-9]+)?)/i);
  if (mInPrice && !metrics.input_price) metrics.input_price = parseFloat(mInPrice[1]);
  const mOutPrice = text.match(/Output Price[^\$\d\n\-\:]*\$?([0-9]+(?:\.[0-9]+)?)/i);
  if (mOutPrice && !metrics.output_price) metrics.output_price = parseFloat(mOutPrice[1]);
  return Object.keys(metrics).length ? metrics : null;
}

function normalizeLabel(s) {
  if (!s) return '';
  let out = s.toString();
  // remove parenthetical qualifiers and common quality tokens
  out = out.replace(/\(.*?\)/g, ' ');
  out = out.replace(/\b(high|low|medium|xhigh|minimal|minimal|preview|chatgpt|codex|non-reasoning|reasoning|providers|api)\b/gi, ' ');
  // replace dots/slashes/underscores with spaces
  out = out.replace(/[._\/]/g, ' ');
  out = out.replace(/[\s\u00A0]+/g, ' ').trim();
  out = out.replace(/[^a-z0-9 ]/gi, '').toLowerCase();
  return out;
}

function extractMetricFromSection($, headingRegex) {
  const headingSelector = 'h1,h2,h3,h4,h5';
  let node = null;
  $(headingSelector).each((i, h) => {
    const txt = $(h).text() || '';
    if (headingRegex.test(txt) && !node) node = h;
  });
  if (!node) return null;

  // collect bucket
  const bucket = [];
  let cur = node.nextSibling;
  while (cur) {
    if (cur.type === 'tag' && /^h[1-5]$/i.test(cur.name)) break;
    bucket.push(cur);
    cur = cur.nextSibling;
  }

  // parse tables/lists
  let items = [];
  for (const n of bucket) {
    if (n.type === 'tag' && n.name === 'table') items.push(...parseEvaluationTable($, n));
    if (n.type === 'tag' && (n.name === 'ul' || n.name === 'ol')) items.push(...parseEvaluationList($, n));
    // scripts inside bucket
    if (n.type === 'tag') {
      $(n).find('script').each((i, s) => {
        const txt = $(s).html() || '';
        const chart = extractChartDataFromScriptText(txt);
        if (chart) items.push(...chart);
      });
    }
  }

  // also scan direct following scripts
  let next = node.next;
  if (next) {
    $(node).nextAll('script').each((i, s) => {
      const txt = $(s).html() || '';
      const chart = extractChartDataFromScriptText(txt);
      if (chart) items.push(...chart);
    });
  }

  // section visible text
  const sectionText = bucket.map(n => (n.type === 'tag' ? $(n).text() : '')).join('\n');

  return items.length ? { items, text: sectionText } : null;
}

function extractChartDataFromScriptText(txt) {
  const results = [];
  // Attempt to parse Chart.js-style configs: labels + datasets
  try {
    const labelsMatch = txt.match(/labels\s*:\s*(\[[^\]]+\])/i);
    const datasetsMatch = txt.match(/datasets\s*:\s*(\[[\s\S]*?\])/i);
    if (labelsMatch && datasetsMatch) {
      const labelsRaw = labelsMatch[1];
      const datasetsRaw = datasetsMatch[1];
      const labelsJson = labelsRaw.replace(/(['`])([\s\S]*?)\1/g, '"$2"');
      const datasetsJson = datasetsRaw.replace(/(['`])([\s\S]*?)\1/g, '"$2"');
      const labels = JSON.parse(labelsJson);
      const datasets = JSON.parse(datasetsJson);
      if (Array.isArray(labels) && Array.isArray(datasets)) {
        for (const ds of datasets) {
          const dsLabel = (ds && (ds.label || ds.name)) ? (ds.label || ds.name) : null;
          const dataArr = Array.isArray(ds.data) ? ds.data : (Array.isArray(ds.values) ? ds.values : null);
          if (!Array.isArray(dataArr)) continue;
          for (let i = 0; i < Math.min(labels.length, dataArr.length); i++) {
            const metricLabel = (labels[i] || '').toString().trim();
            const val = parseFloat(dataArr[i]);
            if (metricLabel && !Number.isNaN(val)) results.push({ subject: metricLabel, value: val, context: dsLabel });
            // also add inverted interpretation: dataset label is the metric, label[i] is the model
            if (dsLabel && metricLabel && !Number.isNaN(val)) results.push({ subject: dsLabel, value: val, context: metricLabel });
          }
        }
      }
    } else {
      // fallback: previous simple labels/data pair
      const labelMatch = txt.match(/labels\s*:\s*(\[[^\]]+\])/i);
      const dataMatch = txt.match(/data\s*:\s*(\[[^\]]+\])/i);
      if (labelMatch && dataMatch) {
        const labelsRaw = labelMatch[1];
        const dataRaw = dataMatch[1];
        const labelsJson = labelsRaw.replace(/(['`])([\s\S]*?)\1/g, '"$2"');
        const dataJson = dataRaw.replace(/(['`])([\s\S]*?)\1/g, '"$2"');
        const labels = JSON.parse(labelsJson);
        const data = JSON.parse(dataJson);
        if (Array.isArray(labels) && Array.isArray(data) && labels.length === data.length) {
          for (let j = 0; j < labels.length; j++) {
            const l = (labels[j] || '').toString().trim();
            const v = parseFloat(data[j]);
            if (l && !Number.isNaN(v)) results.push({ subject: l, value: v });
          }
        }
      }
    }
  } catch (err) {
    // ignore parse errors
  }
  return results.length ? results : null;
}

function parseEvaluationTable($, table) {
  const rows = [];
  $(table).find('tr').each((i, tr) => {
    const cells = $(tr).find('th,td').map((j, td) => $(td).text().trim()).get();
    if (cells.length >= 2) {
      const last = cells[cells.length - 1];
      const num = last.match(/([0-9]+(?:\.[0-9]+)?)/);
      if (num) {
        const first = cells[0];
        rows.push({ rawRow: cells.join(' | '), subject: first, value: parseFloat(num[1]), unit: (/%/.test(last) ? '%' : null) });
      }
    }
  });
  return rows;
}

function parseEvaluationList($, el) {
  const rows = [];
  $(el).find('li').each((i, li) => {
    const txt = $(li).text().trim();
    const m = txt.match(/(.+?)[:\-–]\s*([0-9]+(?:\.[0-9]+)?)/);
    if (m) {
      const subj = m[1].trim();
      if (isPlausibleSubject(subj)) rows.push({ rawRow: txt, subject: subj, value: parseFloat(m[2]) });
    }
  });
  return rows;
}

function extractEvaluationsFromDom($) {
  const sections = [];
  // Find headings that mention Intelligence Evaluations (case-insensitive)
  const headingSelector = 'h1,h2,h3,h4,h5,legend';
  $(headingSelector).each((i, h) => {
    const txt = $(h).text() || '';
    if (/Intelligence Evaluations/i.test(txt) || /Intelligence Evaluation/i.test(txt) || /Evaluations/i.test(txt)) {
      // collect next few sibling nodes until a new heading of same level
      let node = h.nextSibling;
      const bucket = [];
      while (node) {
        if (node.type === 'tag' && /^h[1-5]$/i.test(node.name)) break;
        bucket.push(node);
        node = node.nextSibling;
      }
      // parse tables/lists/text in bucket
      const found = [];
      for (const n of bucket) {
        if (n.type === 'tag' && n.name === 'table') {
          found.push(...parseEvaluationTable($, n));
        }
        if (n.type === 'tag' && (n.name === 'ul' || n.name === 'ol')) {
          found.push(...parseEvaluationList($, n));
        }
        if (n.type === 'tag' && n.name === 'div') {
          const txt = $(n).text();
          const inline = (txt.match(/([A-Za-z0-9_\-./ ]{3,}?)\s*(?:on|vs|—|:-|:|-)\s*([A-Za-z0-9_\-./ ]{3,}?)\s*[:\-–]?\s*([0-9]+(?:\.[0-9]+)?)/g) || []);
          for (const m of inline) {
            const parts = m.match(/([A-Za-z0-9_\-./ ]{3,}?)\s*(?:on|vs|—|:-|:|-)\s*([A-Za-z0-9_\-./ ]{3,}?)\s*[:\-–]?\s*([0-9]+(?:\.[0-9]+)?)/);
            if (parts) {
              const subj = parts[1].trim();
              const ctx = parts[2].trim();
              const val = parseFloat(parts[3]);
              if (isPlausibleSubject(subj) && Math.abs(val) < 1000) {
                found.push({ rawRow: m, subject: subj, context: ctx, value: val });
              }
            }
          }
        }
      }
      if (found.length) sections.push({ heading: txt.trim(), items: found });
    }
  });
  // As a fallback, search body text for lines like "Model on Dataset — 85"
  if (!sections.length) {
    const body = $('body').text();
    const matches = body.match(/([A-Za-z0-9_\-./ ]{3,}?)\s*(?:on|vs|—|:-|:|-)\s*([A-Za-z0-9_\-./ ]{3,}?)\s*[:\-–]?\s*([0-9]+(?:\.[0-9]+)?)/g) || [];
    if (matches.length) {
      const items = [];
      for (const m of matches) {
        const parts = m.match(/([A-Za-z0-9_\-./ ]{3,}?)\s*(?:on|vs|—|:-|:|-)\s*([A-Za-z0-9_\-./ ]{3,}?)\s*[:\-–]?\s*([0-9]+(?:\.[0-9]+)?)/);
        if (parts) items.push({ rawRow: m, subject: parts[1].trim(), context: parts[2].trim(), value: parseFloat(parts[3]) });
      }
      if (items.length) sections.push({ heading: 'body-fallback', items });
    }
  }
  return sections.length ? sections : null;
}

function extractChartDataFromScripts($) {
  const results = [];
  $('script').each((i, el) => {
    const txt = $(el).html() || '';
    // Inspect scripts that look like chart configs (labels + datasets or labels+data)
    if (!/labels\s*:\s*\[|datasets\s*:\s*\[|data\s*:\s*\[/i.test(txt)) return;
    const parsed = extractChartDataFromScriptText(txt);
    if (parsed && parsed.length) results.push(...parsed);
  });
  return results.length ? results : null;
}

function extractQualityMetricDefsFromHtml(html) {
  // find a JSON array for qualityMetrics in the page scripts
  const defs = {};
  try {
    const qmMatch = html.match(/qualityMetrics\s*:\s*(\[[\s\S]*?\])/, 'i');
    const raw = qmMatch ? qmMatch[1] : null;
    if (raw) {
      // try to parse JSON by replacing single quotes with double quotes (best-effort)
      const cleaned = raw.replace(/(['`])([\s\S]*?)\1/g, '"$2"');
      const parsed = JSON.parse(cleaned);
      if (Array.isArray(parsed)) {
        for (const p of parsed) {
          if (p && p.eval) defs[p.eval] = p.label || p.eval;
        }
      }
    }
  } catch (e) {
    // ignore parse errors
  }
  return Object.keys(defs).length ? defs : null;
}

function extractEvalValuesFromHtml(html, keys) {
  const out = {};
  if (!keys || !keys.length) return out;
  for (const k of keys) {
    // look for "key": 123 or "key":123 or 'key':123 within the raw HTML
    const re1 = new RegExp('"' + k.replace(/[-\/\\^$*+?.()|[\]{}]/g, '\\$&') + '"\s*:\s*([0-9]+(?:\\.[0-9]+)?)', 'i');
    const m1 = html.match(re1);
    if (m1) { out[k] = parseFloat(m1[1]); continue; }

    const re2 = new RegExp('"' + k.replace(/[-\/\\^$*+?.()|[\]{}]/g, '\\$&') + '"\s*:\s*\{[\s\S]{0,120}?value\"?\s*:\s*([0-9]+(?:\\.[0-9]+)?)', 'i');
    const m2 = html.match(re2);
    if (m2) { out[k] = parseFloat(m2[1]); continue; }

    // fallback: look for key in unquoted form (rare)
    const re3 = new RegExp(k + '\\s*[:=]\\s*([0-9]+(?:\\.[0-9]+)?)', 'i');
    const m3 = html.match(re3);
    if (m3) { out[k] = parseFloat(m3[1]); }
  }
  return out;
}

function mapEvaluationsToMetrics(evaluations, metrics, pageTitle, pageUrl) {
  if (!evaluations || !evaluations.length) return;
  const normTitle = normalizeLabel(pageTitle || pageUrl || '');
  for (const sec of evaluations) {
    const heading = (sec.heading || '').toLowerCase();
    const items = Array.isArray(sec.items) ? sec.items : (Array.isArray(sec) ? sec : []);
    if (!items || !items.length) continue;

    // detect dataset-like labels (e.g., MMLU, GSM8K, math, ImageNet)
    const datasetLike = items.some(it => /mmlu|gsm8k|\bmath\b|imagenet|wer|mteb|clip|humaneval|human eval/i.test((it.subject||'').toString()));
    if (datasetLike) {
      for (const it of items) {
        const subj = (it.subject || '').toString();
        const sval = parseFloat(it.value);
        if (Number.isNaN(sval)) continue;
        const s = subj.toLowerCase();
        if (/mmlu/.test(s)) metrics.mmlu = sval;
        else if (/humaneval|human eval/.test(s)) metrics.humaneval = sval;
        else if (/\bmath\b/.test(s)) metrics.math = sval;
        else if (/gsm8k/.test(s)) metrics.gsm8k = sval;
        else if (/wer/.test(s)) metrics.wer = sval;
        else if (/mteb/.test(s)) metrics.mteb = sval;
        else if (/imagenet.*top.?1/.test(s)) metrics.imagenet_top1 = sval;
        else if (/clip.?score/.test(s)) metrics.clip_score = sval;
        else if (/intelligence index|artificial analysis intelligence|intelligence/i.test(s)) metrics.intelligence = sval;
      }
      continue;
    }

    // model-comparison charts: look for the row matching this page's model
    const normalizedSubjects = items.map(it => ({ raw: it.subject || '', subj: normalizeLabel(it.subject || ''), ctx: normalizeLabel(it.context || ''), value: parseFloat(it.value) }));
    // exact match first: match metric subject to title or dataset/context to title
    let match = normalizedSubjects.find(it => (it.subj && it.subj === normTitle) || (it.ctx && it.ctx === normTitle));
    // substring/token overlap fallback
    if (!match) {
      const titleTokens = new Set((normTitle || '').split(/\s+/).filter(Boolean));
      let best = null; let bestScore = 0;
      for (const it of normalizedSubjects) {
        const compareStr = it.subj || it.ctx || '';
        if (!compareStr) continue;
        const subjTokens = (compareStr || '').split(/\s+/).filter(Boolean);
        if (!subjTokens.length) continue;
        const shared = subjTokens.filter(t => titleTokens.has(t)).length;
        const score = shared / Math.max(subjTokens.length, titleTokens.size || 1);
        if (score > bestScore) { bestScore = score; best = it; }
      }
      // require reasonable overlap (>=50%) to accept
      if (best && bestScore >= 0.5) match = best;
    }
    if (match && !Number.isNaN(match.value)) {
      const v = match.value;
      if (/intelligence/i.test(heading) || /intelligence index/i.test(heading) || /artificial analysis intelligence/i.test(heading)) {
        metrics.intelligence = v;
      } else {
        metrics.intelligence = metrics.intelligence || v;
      }
      continue;
    }

    // last-resort: if heading mentions intelligence and a single scalar value present
    if (/intelligence/i.test(heading) && items.length === 1) {
      const v = parseFloat(items[0].value);
      if (!Number.isNaN(v)) metrics.intelligence = v;
    }
  }
}

async function fetchModelDetails(url) {
  try {
    const html = await fetchUrl(url);
    const $ = cheerio.load(html);
    // Extract a canonical title from common locations
    let pageTitle = ($('meta[property="og:title"]').attr('content') || $('meta[name="title"]').attr('content') || $('title').text() || $('h1').first().text() || '').trim() || null;

    // 1) JSON data containers: try to extract metrics and possibly title
    const nextData = $('#__NEXT_DATA__').html() || $('script#__NEXT_DATA__').html();
    let metrics = null;
    if (nextData) {
      try {
        const parsed = JSON.parse(nextData);
        if (!pageTitle) pageTitle = extractTitleFromJson(parsed) || pageTitle;
        const found = extractMetricsFromJson(parsed);
        if (found) metrics = Object.assign(metrics || {}, found);
      } catch (e) {}
    }

    // 2) application/ld+json
    $('script[type="application/ld+json"]').each((i, el) => {
      try {
        const j = JSON.parse($(el).html());
        if (!pageTitle) pageTitle = extractTitleFromJson(j) || pageTitle;
        const found = extractMetricsFromJson(j);
        if (found) metrics = Object.assign(metrics || {}, found);
      } catch (e) {}
    });

    // Also check for FAQPage JSON-LD that contains human-readable answers (e.g., "scores 51...")
    $('script[type="application/ld+json"]').each((i, el) => {
      try {
        const j = JSON.parse($(el).html());
        if (j && j.mainEntity && Array.isArray(j.mainEntity)) {
          for (const q of j.mainEntity) {
            const name = (q && q.name) ? q.name.toString() : '';
            const ans = (q && q.acceptedAnswer && q.acceptedAnswer.text) ? q.acceptedAnswer.text.toString() : '';
            if (ans) {
              const fromAns = extractMetricsFromText(ans);
              if (fromAns) metrics = Object.assign(metrics || {}, fromAns);
              if (/how intelligent/i.test(name) || /how intelligent/i.test(ans)) {
                const mIntl = ans.match(/(?:scores|score|scored)\s*([0-9]{1,3}(?:\.[0-9])?)/i);
                if (mIntl) {
                  metrics = metrics || {};
                  metrics.intelligence = parseFloat(mIntl[1]);
                }
              }
            }
          }
        }
      } catch (e) {}
    });
    // Extract Intelligence Evaluations section(s)
    const evaluations = extractEvaluationsFromDom($) || [];
    // Also try to extract chart label/data pairs from inline scripts
    const chartPairs = extractChartDataFromScripts($);
    if (chartPairs) {
      evaluations.push({ heading: 'chart-data', items: chartPairs });
    }

    // Optionally use headless rendering to hydrate client-side data (more reliable)
    if (process.env.USE_HEADLESS === '1' || (!chartPairs && (!evaluations || !evaluations.length))) {
      try {
        const tries = parseInt(process.env.HEADLESS_TRIES || '2', 10) || 2;
        const snap = await fetchModelDetailsHeadlessSafe(url, tries);
        // If snapshot contains nextData/apollo with metrics, try to extract
        if (snap && snap.nextData) {
          try {
            const found = extractMetricsFromJson(snap.nextData);
            if (found) metrics = Object.assign(metrics || {}, found);
          } catch (e) {}
        }
        if (snap && snap.apollo) {
          try {
            const found = extractMetricsFromJson(snap.apollo);
            if (found) metrics = Object.assign(metrics || {}, found);
          } catch (e) {}
        }
        // Pull chart objects captured after hydration
        if (snap && Array.isArray(snap.charts) && snap.charts.length) {
          for (const ch of snap.charts) {
            const labels = Array.isArray(ch.labels) ? ch.labels : [];
            const datasets = Array.isArray(ch.datasets) ? ch.datasets : [];
            const items = [];
            for (const ds of datasets) {
              const dsLabel = ds && ds.label ? ds.label : null;
              const dataArr = Array.isArray(ds.data) ? ds.data : [];
              for (let i = 0; i < Math.min(labels.length, dataArr.length); i++) {
                const metricLabel = (labels[i] || '').toString().trim();
                const val = parseFloat(dataArr[i]);
                if (metricLabel && !Number.isNaN(val)) items.push({ subject: metricLabel, value: val, context: dsLabel });
                if (dsLabel && metricLabel && !Number.isNaN(val)) items.push({ subject: dsLabel, value: val, context: metricLabel });
              }
            }
            if (items.length) evaluations.push({ heading: 'chart-data-headless', items });
          }
        }
        // also include visible text found post-hydration as fallback
        if (snap && Array.isArray(snap.visible) && snap.visible.length) {
          for (const v of snap.visible) {
            // try to parse numbers out of visible text
            const m = (v.text || '').match(/([A-Za-z0-9_\- ]{3,}?)[:\-–]\s*([0-9]+(?:\.[0-9]+)?)/g) || [];
            const items = [];
            for (const mm of m) {
              const p = mm.match(/([A-Za-z0-9_\- ]{3,}?)[:\-–]\s*([0-9]+(?:\.[0-9]+)?)/);
              if (p) items.push({ rawRow: mm, subject: p[1].trim(), value: parseFloat(p[2]) });
            }
            if (items.length) evaluations.push({ heading: v.heading || 'visible-headless', items });
          }
        }
      } catch (e) {
        // ignore headless errors — we still keep best-effort static parsed results
      }
    }

    // Final fallback: try to extract explicit Intelligence Index mentions from raw HTML (covers inlined script content)
    try {
      const raw = (html || '').toString();
      const m = raw.match(/scores\s*([0-9]{1,3}(?:\.[0-9])?)[\s\S]{0,80}?Artificial Analysis Intelligence Index/i);
      if (m) {
        metrics = metrics || {};
        metrics.intelligence = parseFloat(m[1]);
      }
    } catch (e) {}

    // Also try to extract per-evaluation values from inline script data (qualityMetrics defs + numeric values)
    try {
      const qualityDefs = extractQualityMetricDefsFromHtml(html || '');
      if (qualityDefs) {
        const evalKeys = Object.keys(qualityDefs);
        const foundVals = extractEvalValuesFromHtml(html || '', evalKeys);
        for (const k of Object.keys(foundVals)) {
          const label = qualityDefs[k] || k;
          const v = foundVals[k];
          if (!Number.isNaN(v)) {
            // map common keys to friendly metric names where possible
            const lk = k.toLowerCase();
            if (lk.includes('intelligence') || lk === 'intelligence_index' || lk === 'intelligenceindex') {
              metrics.intelligence = metrics.intelligence || v;
            } else if (lk.includes('speed') && (!metrics.speed || metrics.speed === 1)) {
              metrics.speed = metrics.speed || v;
            } else {
              // attach under the eval key
              metrics[k] = v;
            }
          }
        }
      }
    } catch (e) {}

    // Map any evaluation/chart data into metrics (prefer Intelligence Evaluations)
    metrics = metrics || {};
    try {
      mapEvaluationsToMetrics(evaluations, metrics, pageTitle, url);
    } catch (e) {}

    // 3) look at visible content for metrics and title fallback
    const text = $('body').text();
    const foundText = extractMetricsFromText(text);

    // merge found text metrics (fallback) into metrics
    return { metrics: Object.assign(metrics || {}, foundText || {} ) || null, title: pageTitle, evaluations: evaluations.length ? evaluations : null };
  } catch (e) {
    return { metrics: null, title: null };
  }
}

async function run() {
  try {
    const html = await fetchUrl(INDEX_URL);
    const $ = cheerio.load(html);

    // Gather candidate model links
    const candidates = [];
    $('a').each((i, el) => {
      const href = ($(el).attr('href') || '').trim();
      const text = ($(el).text() || '').trim();
      if (!href || !text) return;
      if (/\/models?\//i.test(href) || /\/model\//i.test(href) || /artificialanalysis\.ai/.test(href)) {
        const full = href.startsWith('http') ? href : new URL(href, BASE).toString();
        candidates.push({ title: text, url: full });
      }
    });

    // De-duplicate by URL
    const seen = new Set();
    const uniq = [];
    for (const c of candidates) {
      if (seen.has(c.url)) continue;
      seen.add(c.url);
      uniq.push(c);
    }

    // Limit — default to ALL (use MAX_FETCH>0 to cap). Set MAX_FETCH=0 or unset to fetch all.
    const configuredMax = parseInt(process.env.MAX_FETCH || '0', 10) || 0;
    const maxFetch = configuredMax > 0 ? Math.min(configuredMax, uniq.length) : uniq.length;
    // If NEW_ONLY is set, skip models already present in local data file
    if ((process.env.NEW_ONLY || '').toString().toLowerCase() === '1' || (process.env.NEW_ONLY || '').toString().toLowerCase() === 'true') {
      try {
        const existingPath = path.join(__dirname, '..', 'data', 'models_artificialanalysis.json');
        if (fs.existsSync(existingPath)) {
          const existingRaw = fs.readFileSync(existingPath, 'utf8');
          const existingObj = JSON.parse(existingRaw || '{}');
          const existingUrls = new Set((existingObj.models || []).map(m => m.url).filter(Boolean));
          const before = uniq.length;
          uniq = uniq.filter(c => !existingUrls.has(c.url));
          console.log(`NEW_ONLY: filtered ${before - uniq.length} already-present models; ${uniq.length} remaining to fetch.`);
        } else {
          console.log('NEW_ONLY set but no existing data file found; fetching all models');
        }
      } catch (e) {
        console.warn('NEW_ONLY filter failed, proceeding to fetch all:', e.message || e);
      }
    }

    const toFetch = uniq.slice(0, maxFetch);

    // Fetch details with concurrency
    const concurrency = 6;
    const results = [];
    const failures = [];
    const successes = [];
    async function worker(queue, id) {
      while (queue.length) {
        const item = queue.shift();
        try {
          const details = await fetchModelDetails(item.url);
          const metrics = details && details.metrics ? details.metrics : null;
          const title = (details && details.title) || item.title || null;
          results.push({ title, url: item.url, metrics, status: 'ok' });
          successes.push(item.url);
        } catch (err) {
          const reason = err && err.message ? err.message : String(err);
          failures.push({ url: item.url, reason });
          results.push({ title: item.title || null, url: item.url, metrics: null, status: 'error', reason });
        }
        // polite delay between requests per worker
        await sleep(100 + Math.floor(Math.random() * 200));
      }
    }

    const queue = toFetch.slice();
    console.log(`Starting fetch of ${toFetch.length} model pages with concurrency ${concurrency}...`);
    const workers = Array.from({ length: concurrency }, (_, i) => worker(queue, i));
    await Promise.all(workers);
    console.log(`Fetch complete: ${results.length} attempted, ${successes.length} success, ${failures.length} failed.`);

    const out = {
      fetchedAt: new Date().toISOString(),
      source: INDEX_URL,
      scanned: uniq.length,
      toFetch: toFetch.length,
      fetched: results.length,
      successCount: successes.length,
      failureCount: failures.length,
      failures: failures.slice(0, 200),
      models: results,
    };

    const outDir = path.join(__dirname, '..', 'data');
    if (!fs.existsSync(outDir)) fs.mkdirSync(outDir, { recursive: true });
    const outPath = path.join(outDir, 'models_artificialanalysis.json');
    fs.writeFileSync(outPath, JSON.stringify(out, null, 2), 'utf8');
    console.log(`Wrote ${out.models.length} entries to ${outPath}`);
  } catch (err) {
    console.error('Failed to fetch or parse artificialanalysis:', err.message || err);
    process.exitCode = 2;
  }
}

if (require.main === module) {
  if (process.env.SINGLE_URL) {
    (async () => {
      const res = await fetchModelDetails(process.env.SINGLE_URL);
      console.log(JSON.stringify(res, null, 2));
    })();
  } else run();
}
