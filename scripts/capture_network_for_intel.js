#!/usr/bin/env node
const puppeteer = require('puppeteer');
const fs = require('fs');
const url = process.env.SINGLE_URL || process.argv[2];
if (!url) { console.error('Usage: SINGLE_URL=https://... node scripts/capture_network_for_intel.js'); process.exit(2); }
(async () => {
  let browser;
  const remoteUrl = process.env.CHROME_REMOTE_URL || process.env.CHROME_REMOTE || 'http://127.0.0.1:9222';
  try {
    browser = await puppeteer.connect({ browserURL: remoteUrl, defaultViewport: null });
  } catch (e) {
    browser = await puppeteer.launch({ headless: 'new', args: ['--no-sandbox'] });
  }
  const page = await browser.newPage();
  const matches = [];
  page.on('response', async resp => {
    try {
      const ct = resp.headers()['content-type'] || '';
      if (ct.indexOf('application/json') !== -1 || ct.indexOf('application/ld+json') !== -1 || resp.url().indexOf('/api/') !== -1) {
        const txt = await resp.text();
        if (txt && (txt.indexOf('Artificial Analysis Intelligence Index') !== -1 || txt.indexOf('Model') !== -1 || txt.indexOf('Artificial Analysis') !== -1)) {
          matches.push({ url: resp.url(), status: resp.status(), bodySnippet: txt.slice(0,2000) });
        }
      }
    } catch (e) {}
  });
  await page.goto(url, { waitUntil: 'networkidle2', timeout: 60000 });
  await page.waitForTimeout(5000);
  fs.writeFileSync('data/network_matches.json', JSON.stringify(matches, null, 2));
  console.log('Wrote data/network_matches.json with', matches.length, 'entries');
  await browser.close();
})();
