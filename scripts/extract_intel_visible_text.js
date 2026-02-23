#!/usr/bin/env node
const puppeteer = require('puppeteer');
const fs = require('fs');
const url = process.env.SINGLE_URL || process.argv[2];
if (!url) { console.error('Usage: SINGLE_URL=https://... node scripts/extract_intel_visible_text.js'); process.exit(2); }
(async () => {
  const remoteUrl = process.env.CHROME_REMOTE_URL || process.env.CHROME_REMOTE || 'http://127.0.0.1:9222';
  let browser;
  try { browser = await puppeteer.connect({ browserURL: remoteUrl, defaultViewport: null }); }
  catch (e) { browser = await puppeteer.launch({ headless: 'new' }); }
  const page = await browser.newPage();
  await page.setViewport({ width: 1200, height: 1400 });
  await page.goto(url, { waitUntil: 'networkidle2', timeout: 60000 });
  await page.waitForTimeout(2500);

  const result = await page.evaluate(() => {
    function findHeading() {
      const heads = Array.from(document.querySelectorAll('h1,h2,h3,h4,h5'));
      return heads.find(h => /Intelligence Evaluations|Intelligence Index|Artificial Analysis Intelligence/i.test(h.innerText));
    }
    const heading = findHeading();
    let container = heading ? heading.parentElement : document.body;
    // climb for a container with many children
    let anc = container; let steps = 0;
    while (anc && steps < 6) {
      if ((anc.querySelectorAll && anc.querySelectorAll('div,li,table,section').length) > 6) break;
      anc = anc.parentElement; steps++;
    }
    if (anc) container = anc;
    // gather visible text blocks
    const nodes = Array.from(container.querySelectorAll('*')).filter(n => n.innerText && n.offsetParent !== null).slice(0,500);
    const texts = nodes.map(n => ({ tag: n.tagName, text: (n.innerText||'').trim().replace(/\s+/g,' ') }));
    // heuristic: find lines containing numbers (0-100) or percentages
    const lines = [];
    texts.forEach(t => {
      const parts = t.text.split(/\n|---|·|•/).map(p=>p.trim()).filter(Boolean);
      parts.forEach(p => lines.push(p));
    });

    // find candidate lines with patterns like "BenchmarkName 87" or "BenchmarkName - 87" or "BenchmarkName: 87"
    const candidates = [];
    const re = /(.*?)\s(?:[:\-–]\s*)?(?:#?\d+\s*\/\s*\d+\s*)?([0-9]{1,3}(?:\.[0-9]+)?)(?:\s?%|\b)/;
    for (const l of lines) {
      const m = l.match(re);
      if (m) candidates.push({ line: l, name: m[1].trim(), value: parseFloat(m[2]) });
    }

    // also try adjacent-line pairing (name line followed by numeric line)
    for (let i=0;i<lines.length-1;i++) {
      const a = lines[i], b = lines[i+1];
      const ma = a.match(/^[A-Za-z0-9 \-\/:]{2,80}$/);
      const mb = b.match(/^([0-9]{1,3}(?:\.[0-9]+)?)(?:\s?%|\b)/);
      if (ma && mb) candidates.push({ line: a + ' / ' + b, name: a.trim(), value: parseFloat(mb[1]) });
    }

    return { heading: heading ? heading.innerText : null, candidates: candidates.slice(0,200) };
  });

  await browser.close();
  fs.writeFileSync('data/visible_intel.json', JSON.stringify(result, null, 2));
  console.log('Wrote data/visible_intel.json');
})();
