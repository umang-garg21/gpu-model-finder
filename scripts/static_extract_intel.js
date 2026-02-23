#!/usr/bin/env node
const axios = require('axios');
const fs = require('fs');
const url = process.env.SINGLE_URL || process.argv[2];
if (!url) { console.error('Usage: SINGLE_URL=https://... node scripts/static_extract_intel.js'); process.exit(2); }
(async () => {
  const resp = await axios.get(url, { headers: { 'User-Agent': 'Mozilla/5.0' } });
  const html = resp.data;
  const scripts = [];
  // extract inline script contents
  const scriptRe = /<script[^>]*>([\s\S]*?)<\/script>/gi;
  let m;
  while ((m = scriptRe.exec(html)) !== null) scripts.push(m[1]);

  const charts = [];
  const objRe = /\{[\s\S]*?labels\s*:\s*\[[\s\S]*?\]\s*,[\s\S]*?datasets\s*:\s*\[[\s\S]*?\][\s\S]*?\}/g;
  for (const s of scripts) {
    let mm;
    while ((mm = objRe.exec(s)) !== null) {
      const snippet = mm[0];
      try {
        // try to convert to valid JSON by quoting keys where missing
        const js = snippet;
        const cfg = Function('return (' + js + ')')();
        if (cfg && Array.isArray(cfg.labels) && Array.isArray(cfg.datasets)) charts.push({ labels: cfg.labels, datasets: cfg.datasets.map(d => ({ label: d.label||null, data: d.data||[] })) });
      } catch (e) {}
    }
  }

  // also extract JSON-LD datasets
  const ldRe = /<script[^>]+type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi;
  const ld = [];
  while ((m = ldRe.exec(html)) !== null) {
    try { const parsed = JSON.parse(m[1]); ld.push(parsed); } catch (e) {}
  }

  // search ld for Dataset name
  const intelDatasets = [];
  for (const item of ld) {
    try {
      if (item && (item['@type'] === 'Dataset' || (item.name && /Artificial Analysis Intelligence Index/i.test(item.name)))) {
        intelDatasets.push(item);
      }
      // arrays
      if (Array.isArray(item)) item.forEach(it => { if (it && it.name && /Artificial Analysis Intelligence Index/i.test(it.name)) intelDatasets.push(it); });
    } catch (e) {}
  }

  const out = { chartsFound: charts.length, charts, intelDatasetsCount: intelDatasets.length, intelDatasets: intelDatasets.slice(0,5) };
  fs.writeFileSync('data/static_intel.json', JSON.stringify(out, null, 2));
  console.log('Wrote data/static_intel.json');
})();
