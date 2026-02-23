#!/usr/bin/env node
const puppeteer = require('puppeteer');
const fs = require('fs');
const url = process.env.SINGLE_URL || process.argv[2];
if (!url) {
  console.error('Usage: SINGLE_URL=https://... node scripts/extract_intelligence_from_page.js');
  process.exit(2);
}
(async () => {
  let browser = null;
  // Prefer connecting to a running Chrome with remote debugging (avoid launching bundled Chromium)
  const remoteUrl = process.env.CHROME_REMOTE_URL || process.env.CHROME_REMOTE || 'http://127.0.0.1:9222';
  try {
    browser = await puppeteer.connect({ browserURL: remoteUrl, defaultViewport: null });
  } catch (e) {
    try { browser = await puppeteer.launch({ headless: 'new' }); }
    catch (e2) {
      const execPath = process.env.CHROME_PATH || '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
      browser = await puppeteer.launch({ headless: 'new', executablePath: execPath });
    }
  }
  const page = await browser.newPage();
  await page.setViewport({ width: 1200, height: 1000 });
  await page.goto(url, { waitUntil: 'networkidle2', timeout: 60000 });
  await page.waitForTimeout(2500);

  const intel = await page.evaluate(() => {
    const out = { found: false, datasets: [] };
    const scripts = Array.from(document.querySelectorAll('script:not([src])')).map(s => s.innerText || '').filter(Boolean);
    function tryParseJsonFrom(text) {
      const results = [];
      // find JSON objects by searching for '{"@context"' or '"@type"\s*:\s*"Dataset"'
      const markers = ['"@context"', '"@type"'];
      for (const m of markers) {
        let idx = 0;
        while (true) {
          const pos = text.indexOf(m, idx);
          if (pos === -1) break;
          // find previous '{'
          const start = text.lastIndexOf('{', pos);
          if (start === -1) { idx = pos + m.length; continue; }
          // find matching '}'
          let depth = 0; let i = start;
          for (; i < text.length; i++) {
            if (text[i] === '{') depth++;
            else if (text[i] === '}') {
              depth--;
              if (depth === 0) {
                const candidate = text.slice(start, i+1);
                try { results.push(JSON.parse(candidate)); } catch (e) {
                  // try to sanitize by removing newlines and trailing commas
                  try {
                    const cleaned = candidate.replace(/,\s*([}\]])/g, '$1');
                    results.push(JSON.parse(cleaned));
                  } catch (e2) {}
                }
                idx = i + 1;
                break;
              }
            }
          }
          if (i >= text.length) break;
        }
      }
      return results;
    }

    for (const s of scripts) {
      try {
        const js = s;
        if (js.indexOf('Artificial Analysis Intelligence Index') !== -1 || js.indexOf('"@type":"Dataset"') !== -1) {
          const parsed = tryParseJsonFrom(js);
          parsed.forEach(p => {
            if (p && (p['@type'] === 'Dataset' || p['@type'] === 'dataset' || p['@type'] === 'schema:Dataset' || p.name)) {
              out.datasets.push(p);
              out.found = true;
            }
          });
        }
      } catch (e) {}
    }

    // also check for window.__NEXT_DATA__ if present
    try {
      if (window.__NEXT_DATA__) {
        const nd = window.__NEXT_DATA__;
        // search for props that include dataset arrays
        function collect(obj) {
          if (!obj || typeof obj !== 'object') return [];
          const acc = [];
          for (const k of Object.keys(obj)) {
            try {
              const v = obj[k];
              if (v && typeof v === 'object') {
                if (Array.isArray(v)) {
                  // array of objects with Model keys?
                  if (v.length && typeof v[0] === 'object' && (v[0].Model || v[0].model)) acc.push({ name: k, data: v });
                } else {
                  acc.push(...collect(v));
                }
              }
            } catch (e) {}
          }
          return acc;
        }
        const found = collect(nd.props || nd);
        found.forEach(f => out.datasets.push(f));
      }
    } catch (e) {}

    return out;
  });

  await browser.close();

  // collect candidates and also any inline arrays of objects
  const candidates = intel.datasets || [];
  // Also attempt to extract Chart config objects from inline scripts (labels + datasets)
  try {
    const extra = await (async () => {
      const res = await (async function(){
        const out = [];
        const scripts = Array.from(document.querySelectorAll('script:not([src])')).map(s=>s.innerText||'');
        const objRe = /\{[\s\S]*?labels\s*:\s*\[[\s\S]*?\]\s*,[\s\S]*?datasets\s*:\s*\[[\s\S]*?\][\s\S]*?\}/g;
        for (const s of scripts) {
          let m;
          while ((m = objRe.exec(s)) !== null) {
            const snippet = m[0];
            try {
              // try to evaluate snippet as JS object
              const cfg = (0, eval)('(' + snippet + ')');
              if (cfg && Array.isArray(cfg.labels) && Array.isArray(cfg.datasets)) {
                out.push({ labels: cfg.labels.slice(0,200), datasets: cfg.datasets.map(d => ({ label: d.label||null, data: d.data||[] })) });
              }
            } catch (e) {}
          }
        }
        return out;
      })();
      return res;
    })();
    if (extra && extra.length) {
      // append these as candidate arrays for further processing
      extra.forEach(e => candidates.push({ name: 'inline-chart-snippet', data: e }));
    }
  } catch (e) {}
  // gather any arrays of objects parsed earlier
  const arrays = [];
  for (const c of candidates) {
    try {
      if (Array.isArray(c.data)) arrays.push({ name: c.name || c.title || '', data: c.data });
      else if (Array.isArray(c)) arrays.push({ name: '', data: c });
      else if (Array.isArray(c.props || c.items)) arrays.push({ name: c.name || '', data: c.props || c.items });
    } catch (e) {}
  }

  // Heuristic: find an array where one row's Model contains 'gpt-5.2' (case-insensitive)
  let foundArray = null;
  const targetModelRegex = /gpt[-\s]*5\.2/i;
  for (const a of arrays) {
    try {
      const rows = a.data || [];
      if (!rows || !rows.length) continue;
      if (rows.some(r => Object.values(r).some(v => typeof v === 'string' && targetModelRegex.test(v)))) {
        foundArray = a; break;
      }
    } catch (e) {}
  }

  const outFile = 'data/intel_extracted.json';
  const out = { url, found: !!foundArray, sourceName: foundArray ? foundArray.name : null, mapping: [] };
  if (foundArray && Array.isArray(foundArray.data)) {
    // determine score column: prefer numeric values in 0-100, or match 51 for GPT-5.2
    const rows = foundArray.data;
    // find sample row for GPT-5.2
    const sample = rows.find(r => Object.values(r).some(v => typeof v === 'string' && targetModelRegex.test(v))) || rows[0];
    const candidateKeys = Object.keys(sample).filter(k => k.toLowerCase() !== 'model' && k.toLowerCase() !== 'name');
    let chosenKey = null;
    for (const k of candidateKeys) {
      const vals = rows.map(r => r[k]);
      const numericCount = vals.filter(v => typeof v === 'number' || (typeof v === 'string' && v.replace(/[^0-9.\-]/g, '').length)).length;
      if (numericCount > rows.length/3) {
        // check if values are in 0-100 range
        const nums = vals.map(v => (typeof v === 'number' ? v : (typeof v === 'string' ? parseFloat(v.replace(/[^0-9.\-]/g, '')) : NaN))).filter(n => !isNaN(n));
        const inRange = nums.filter(n => n >= 0 && n <= 100).length > nums.length/2;
        if (inRange) { chosenKey = k; break; }
        if (!chosenKey) chosenKey = k;
      }
    }
    // fallback: second column
    if (!chosenKey) chosenKey = Object.keys(sample)[1];

    rows.forEach(r => {
      const model = r.Model || r.model || r.name || r['Model Name'] || r['model'];
      const raw = r[chosenKey];
      let val = null;
      if (typeof raw === 'number') val = raw;
      else if (typeof raw === 'string') {
        const cleaned = raw.replace(/[^0-9.\-]/g, '');
        val = cleaned.length ? parseFloat(cleaned) : null;
      }
      out.mapping.push({ model: model || null, scoreKey: chosenKey, value: val, raw });
    });
  }

  fs.writeFileSync(outFile, JSON.stringify(out, null, 2));
  console.log('Wrote', outFile);
})();
