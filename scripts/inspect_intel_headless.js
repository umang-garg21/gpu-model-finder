#!/usr/bin/env node
const puppeteer = require('puppeteer');

const url = process.env.SINGLE_URL || process.argv[2];
const targetModel = (process.env.TARGET_MODEL || process.argv[3] || '').toLowerCase();
if (!url) {
  console.error('Usage: SINGLE_URL=https://... TARGET_MODEL="GPT-5.2" node scripts/inspect_intel_headless.js');
  process.exit(2);
}

(async () => {
  let browser = null;
  // First, if a remote Chrome debugging URL is provided (or default localhost:9222), try to connect
  const remoteUrl = process.env.CHROME_REMOTE_URL || process.env.CHROME_REMOTE || '';
  const connectOnly = (process.env.CHROME_CONNECT_ONLY === '1' || process.env.PUPPETEER_CONNECT_ONLY === '1');

  async function tryConnectWithRetries(url, attempts = 5, delayMs = 1000) {
    let lastErr = null;
    for (let i = 0; i < attempts; i++) {
      try {
        const opts = { browserURL: url, defaultViewport: null };
        return await puppeteer.connect(opts);
      } catch (err) {
        lastErr = err;
        await new Promise(r => setTimeout(r, delayMs * (i + 1)));
      }
    }
    throw lastErr;
  }

  if (remoteUrl) {
    try {
      browser = await tryConnectWithRetries(remoteUrl, 6, 1000);
    } catch (e) {
      if (connectOnly) {
        console.error('Failed to connect to remote Chrome at', remoteUrl, '- connect-only mode enabled.');
        console.error(e && e.message ? e.message : e);
        process.exit(3);
      }
      // if not connect-only, fall through to attempting to launch locally
      console.warn('Could not connect to remote Chrome at', remoteUrl, '- falling back to launch:', e && e.message ? e.message : e);
    }
  }

  if (!browser) {
    // Try to launch a browser locally (bundled or system Chrome)
    try {
      browser = await puppeteer.launch({ headless: 'new', args: ['--no-sandbox','--disable-setuid-sandbox','--disable-dev-shm-usage'] });
    } catch (e) {
      const execPath = process.env.CHROME_PATH || '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
      try {
        browser = await puppeteer.launch({ headless: 'new', executablePath: execPath, args: ['--no-sandbox','--disable-setuid-sandbox','--disable-dev-shm-usage'] });
      } catch (e2) {
        // last resort: try without sandbox flags
        browser = await puppeteer.launch({ headless: 'new' });
      }
    }
  }
  const page = await browser.newPage();
  await page.setViewport({ width: 1200, height: 900 });
  await page.goto(url, { waitUntil: 'networkidle2', timeout: 60000 });
  // wait for hydration and animations; perform progressive scrolling to render lazy components
  await page.waitForTimeout(2000);
  await page.evaluate(() => { window.scrollTo(0, 0); });
  // progressive scrolls
  for (let i = 0; i < 4; i++) {
    await page.evaluate((i) => { window.scrollTo(0, document.body.scrollHeight * (i+1) / 4); }, i);
    await page.waitForTimeout(1200);
  }
  // give additional time for client scripts to hydrate charts
  await page.waitForTimeout(2500);

  const snap = await page.evaluate((targetModelLower) => {
    function findHeading() {
      const heads = Array.from(document.querySelectorAll('h1,h2,h3,h4,h5'));
      return heads.find(h => /Intelligence Evaluations|Intelligence Index|Artificial Analysis Intelligence/i.test(h.innerText));
    }
    const heading = findHeading();
    const out = { heading: heading ? heading.innerText : null, datasets: [], charts: [] };
    if (!heading) {
      // as a fallback, search for visible text blocks containing "Intelligence"
      const nodes = Array.from(document.querySelectorAll('body *')).filter(n => n.innerText && /Intelligence/i.test(n.innerText));
      if (nodes.length) out.heading = nodes[0].innerText.slice(0,200);
    }

    // collect section container around heading (climb to a meaningful ancestor)
    let sectionRoot = null;
    try {
      if (heading) {
        let anc = heading.parentElement;
        let climb = 0;
        while (anc && climb < 6) {
          const textLen = (anc.innerText || '').trim().length;
          if (textLen > 100) break;
          anc = anc.parentElement;
          climb++;
        }
        if (anc) {
          // gather direct children of this container
          sectionRoot = Array.from(anc.querySelectorAll('*')).slice(0, 800);
        }
      }
    } catch (e) { sectionRoot = null; }

    // parse any tables in sectionRoot
    if (sectionRoot && sectionRoot.length) {
      sectionRoot.forEach(n => {
        if (n.tagName === 'TABLE') {
          const rows = Array.from(n.querySelectorAll('tr'));
          const headers = rows[0] ? Array.from(rows[0].querySelectorAll('th,td')).map(h => h.innerText.trim()) : [];
          const table = [];
          for (let i = 1; i < rows.length; i++) {
            const cols = Array.from(rows[i].querySelectorAll('td')).map(c => c.innerText.trim());
            table.push(cols);
          }
          out.datasets.push({ type: 'table', headers, table });
        }
      });
    }

    // try to capture Chart.js instances from canvases inside the section or page-wide
    try {
      const canvases = [];
      function collectFrom(root) {
        try {
          if (!root) return;
          if (root.querySelectorAll) canvases.push(...Array.from(root.querySelectorAll('canvas')));
          // recurse into any shadow roots we find
          if (root.querySelectorAll) {
            const els = Array.from(root.querySelectorAll('*'));
            els.forEach(el => {
              try { if (el.shadowRoot) collectFrom(el.shadowRoot); } catch (e) {}
            });
          }
        } catch (e) {}
      }
      if (Array.isArray(sectionRoot) && sectionRoot.length) {
        sectionRoot.forEach(n => collectFrom(n));
      } else {
        collectFrom(document);
      }
      // fallback: document canvases
      if (canvases.length === 0) canvases.push(...Array.from(document.querySelectorAll('canvas')));
      // dedupe
      const uniq = Array.from(new Set(canvases));
      uniq.forEach(c => {
        try {
          let maybeChart = null;
          if (window.Chart && typeof window.Chart.getChart === 'function') {
            maybeChart = window.Chart.getChart(c);
          } else if (window.Chart && window.Chart.instances) {
            const vals = Object.values(window.Chart.instances || {});
            maybeChart = vals.find(v => v && v.canvas === c) || null;
          } else if (c.__chartjs) {
            maybeChart = c.__chartjs;
          }
          if (!maybeChart && typeof window.getChart === 'function') {
            try { maybeChart = window.getChart(c); } catch (e) {}
          }
          if (maybeChart && maybeChart.data) {
            const labels = maybeChart.data.labels || [];
            const datasets = (maybeChart.data.datasets || []).map(d => ({ label: d.label || null, data: d.data || [] }));
            out.charts.push({ labels, datasets });
          }
        } catch (e) {}
      });
    } catch (e) {}

    // also inspect inline JSON-LD script blocks and inline scripts for Dataset objects
    try {
      // explicit JSON-LD <script type="application/ld+json">
      const ld = Array.from(document.querySelectorAll('script[type="application/ld+json"]')).map(s => s.innerText || '').filter(Boolean);
      ld.forEach(text => {
        try {
          const parsed = JSON.parse(text);
          const objs = Array.isArray(parsed) ? parsed : [parsed];
          objs.forEach(obj => {
            if (obj && obj['@type'] === 'Dataset' && /intelligence/i.test((obj.name||''))) {
              const rows = obj.data || obj.dataset || [];
              if (Array.isArray(rows) && rows.length) {
                const labels = rows.map(r => r.Model || r.model || r['Model Name'] || JSON.stringify(r).slice(0,40));
                const sample = rows[0] || {};
                const valueKey = Object.keys(sample).find(k => /intell/i.test(k)) || Object.keys(sample).find(k => /score|percent|%|value|rating|AI/i.test(k)) || Object.keys(sample)[1];
                const values = rows.map(r => { const v = r[valueKey]; if (typeof v === 'number') return v; if (typeof v === 'string') { const n = parseFloat(v.replace(/[^0-9.\-]/g, '')); return isFinite(n) ? n : null; } return null; });
                out.charts.push({ labels, datasets: [{ label: obj.name || 'Artificial Analysis Intelligence', data: values }] });
              }
            }
          });
        } catch (e) {}
      });

      // also scan inline scripts for JSON-like Dataset objects (fallback)
      const inline = Array.from(document.querySelectorAll('script:not([src])')).map(s => s.innerText || '').filter(Boolean);
      inline.forEach(s => {
        if (/"@type"\s*:\s*"Dataset"|Artificial Analysis Intelligence/i.test(s)) {
          // attempt to find JSON object snippets and parse
          const braces = s.match(/\{[\s\S]*?\}/g) || [];
          braces.forEach(b => {
            try {
              const obj = JSON.parse(b);
              if (obj && obj['@type'] === 'Dataset' && /intelligence/i.test((obj.name||''))) {
                const rows = obj.data || obj.dataset || [];
                if (Array.isArray(rows) && rows.length) {
                  const labels = rows.map(r => r.Model || r.model || r['Model Name'] || JSON.stringify(r).slice(0,40));
                  const sample = rows[0] || {};
                  const valueKey = Object.keys(sample).find(k => /intell/i.test(k)) || Object.keys(sample).find(k => /score|percent|%|value|rating|AI/i.test(k)) || Object.keys(sample)[1];
                  const values = rows.map(r => { const v = r[valueKey]; if (typeof v === 'number') return v; if (typeof v === 'string') { const n = parseFloat(v.replace(/[^0-9.\-]/g, '')); return isFinite(n) ? n : null; } return null; });
                  out.charts.push({ labels, datasets: [{ label: obj.name || 'Artificial Analysis Intelligence', data: values }] });
                }
              }
            } catch (e) {}
          });
        }
      });
    } catch (e) {}

    try {
      if (window.__NEXT_DATA__) {
        out.__NEXT_DATA__ = JSON.stringify(window.__NEXT_DATA__).slice(0, 20000);
      }
    } catch (e) {}

    // also extract visible text lines within the section to parse model lists + percent rows
    try {
      if (sectionRoot && sectionRoot.length) {
        const texts = [];
        sectionRoot.forEach(n => {
          try {
            const t = (n.innerText || '').trim();
            if (t) texts.push(t);
          } catch (e) {}
        });
        out.sectionText = texts.join('\n---\n');
      }
    } catch (e) {}

    // Also parse any visible key:value lines in the section
    if (sectionRoot && sectionRoot.length) {
      sectionRoot.forEach(n => {
        const txt = n.innerText || '';
        const lines = txt.split(/\n+/).map(l => l.trim()).filter(Boolean);
        lines.forEach(line => {
          const m = line.match(/([A-Za-z0-9 _\-]{2,50})[:\-–]\s*([0-9]{1,3}(?:\.[0-9]+)?)/);
          if (m) out.datasets.push({ type: 'kv', key: m[1].trim(), value: parseFloat(m[2]) });
        });
      });
    }

    return out;
  }, targetModel.toLowerCase());

  // Attempt to interpret charts: find dataset entry for target model
  const results = [];
  for (const ch of snap.charts || []) {
    // two interpretations:
    // 1) labels = datasets (i.e., labels are dataset names and datasets are models)
    // 2) labels = dataset names and datasets = series per model
    const labels = ch.labels.map(l => (l||'').toString().trim());
    const ds = ch.datasets;
    // try interpretation 2 first: labels are datasets, each dataset has data array where one entry corresponds to model
    for (const series of ds) {
      const seriesLabel = (series.label||'').toString().trim();
      // if seriesLabel matches target model, map labels->values
      if (seriesLabel && seriesLabel.toLowerCase().includes(targetModel.toLowerCase())) {
        for (let i=0;i<labels.length;i++) {
          const v = series.data[i];
          results.push({ dataset: labels[i], model: seriesLabel, value: v });
        }
      }
    }
    // interpretation 1: each dataset label is a model; datasets may have label=metric
    for (let i=0;i<labels.length;i++) {
      const label = labels[i];
      if (label && label.toLowerCase().includes(targetModel.toLowerCase())) {
        // find value across datasets (take first dataset's data[i])
        for (const series of ds) {
          const val = series.data[i];
          results.push({ dataset: series.label || 'series', model: label, value: val });
        }
      }
    }
  }

  // If we found table or kv pairs, also include kvs
  const kvs = (snap.datasets || []).filter(x => x.type === 'kv');
  kvs.forEach(k => results.push({ dataset: k.key, model: targetModel, value: k.value }));

  console.log(JSON.stringify({ heading: snap.heading, charts: snap.charts, extracted: results }, null, 2));
  await browser.close();
})();
