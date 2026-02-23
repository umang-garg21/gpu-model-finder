#!/usr/bin/env node
const puppeteer = require('puppeteer');
const url = process.env.SINGLE_URL || process.argv[2];
if (!url) {
  console.error('Usage: SINGLE_URL=https://... node scripts/diagnose_intel.js');
  process.exit(2);
}
(async () => {
  let browser = null;
  try {
    browser = await puppeteer.launch({ headless: 'new' });
  } catch (e) {
    const execPath = process.env.CHROME_PATH || '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
    browser = await puppeteer.launch({ headless: 'new', executablePath: execPath });
  }
  const page = await browser.newPage();
  await page.setViewport({ width: 1200, height: 1000 });
  await page.goto(url, { waitUntil: 'networkidle2', timeout: 60000 });
  await page.waitForTimeout(3000);
  const report = await page.evaluate(() => {
    const canvases = Array.from(document.querySelectorAll('canvas'));
    const canvasSamples = canvases.slice(0,10).map(c => ({ id: c.id||null, class: c.className||null, width: c.width, height: c.height, html: (c.outerHTML||'').slice(0,500) }));
    const scripts = Array.from(document.querySelectorAll('script'));
    const inlineScripts = scripts.filter(s => !s.src).map(s => (s.innerText||'').slice(0,2000));
    const externalScripts = scripts.filter(s => s.src).map(s => s.src).slice(0,20);
    const intelNodes = Array.from(document.querySelectorAll('body *')).filter(n => n.innerText && /Intelligence/i.test(n.innerText)).slice(0,20).map(n => ({ tag: n.tagName, text: (n.innerText||'').slice(0,400) }));
    const hasChart = !!(window.Chart || window.getChart || window.Chart && window.Chart.instances);
    const nextData = !!window.__NEXT_DATA__;
    return { canvasCount: canvases.length, canvasSamples, inlineCount: inlineScripts.length, externalCount: externalScripts.length, externalScripts, inlineSamples: inlineScripts.slice(0,5), intelNodes, hasChart, hasNextData: nextData };
  });
  console.log(JSON.stringify(report, null, 2));
  await browser.close();
})();
