#!/usr/bin/env node
const fs = require('fs');
const path = require('path');
const puppeteer = require('puppeteer');

const MODELS_FILE = path.resolve(__dirname, '..', 'data', 'models_artificialanalysis.json');
const OUT_FILE = path.resolve(__dirname, '..', 'data', 'artificialanalysis_intel_metrics.json');

function norm(s){ return (s||'').toString().toLowerCase().replace(/[\s\-_:(),.\/\\]+/g,' ').trim(); }

async function connectOrLaunch(){
  const remote = process.env.CHROME_REMOTE_URL || '';
  const connectOnly = process.env.CHROME_CONNECT_ONLY === '1';
  if (remote) {
    try {
      return await puppeteer.connect({ browserURL: remote, defaultViewport: null });
    } catch (e) {
      if (connectOnly) throw e;
      console.warn('Could not connect to remote Chrome, falling back to launch');
    }
  }
  const execPath = process.env.CHROME_PATH || process.env.PUPPETEER_EXECUTABLE_PATH;
  const launchOpts = execPath ? { headless: 'new', executablePath: execPath, args: ['--no-sandbox','--disable-setuid-sandbox'] } : { headless: 'new', args: ['--no-sandbox','--disable-setuid-sandbox'] };
  return await puppeteer.launch(launchOpts);
}

async function extractFromPage(page, url){
  await page.goto(url, { waitUntil: 'networkidle2', timeout: 60000 });
  await page.waitForTimeout(2000);
  // progressive scroll
  for (let i=0;i<3;i++){ await page.evaluate(i=>window.scrollTo(0, document.body.scrollHeight*(i+1)/3), i); await page.waitForTimeout(800); }

  const res = await page.evaluate(()=>{
    const container = document.querySelector('#intelligence-evaluations');
    if(!container) return { error: 'no container' };
    const row = container.querySelector('div.mt-2.flex.w-full.flex-wrap.justify-center.lg\\:flex-row');
    if(!row) return { error: 'no row' };
    const metrics = Array.from(row.children).map((col, colIdx)=>{
      const metricLabel = (col.querySelector(':scope > span') || col.querySelector('span'))?.textContent?.trim() || `metric_${colIdx+1}`;
      const svg = col.querySelector('svg');
      const labelRow = svg ? (svg.querySelector('g:nth-child(30)') || svg.querySelector('g.labels') || svg) : null;
      const valueRow = svg ? (svg.querySelector('g:nth-child(31)') || svg.querySelector('g.values') || svg) : null;
      const modelTexts = labelRow ? Array.from(labelRow.querySelectorAll('text')).map(t=> (t.textContent||t.innerText||'').trim()).filter(Boolean) : [];
      const valueTexts = valueRow ? Array.from(valueRow.querySelectorAll('text')).map(t=> (t.textContent||t.innerText||'').trim()).filter(Boolean) : [];
      const max = Math.max(modelTexts.length, valueTexts.length);
      const pairs = [];
      for(let i=0;i<max;i++){
        const m = modelTexts[i] || null;
        const raw = valueTexts[i] || null;
        const n = raw ? parseFloat(String(raw).replace(/[^0-9.\-]/g,'')) : null;
        pairs.push({ model: m, raw: raw, value: Number.isFinite(n) ? n : raw });
      }
      return { metric: metricLabel, pairs };
    });
    return { heading: document.querySelector('h1,h2,h3')?.innerText || null, metrics };
  });
  return res;
}

async function main(){
  const modelsJson = JSON.parse(fs.readFileSync(MODELS_FILE,'utf8'));
  const browser = await connectOrLaunch();
  const page = await browser.newPage();
  const results = [];
  for (const m of (modelsJson.models||[])){
    try{
      const r = await extractFromPage(page, m.url);
      results.push({ page: m.url, title: m.title, extractedAt: (new Date()).toISOString(), result: r });
    }catch(e){ results.push({ page: m.url, title: m.title, error: e && e.message ? e.message : String(e) }); }
  }
  fs.writeFileSync(OUT_FILE, JSON.stringify({ fetchedAt: (new Date()).toISOString(), pages: results }, null, 2));
  try{ await browser.close(); }catch(e){}
  console.log('wrote', OUT_FILE);
}

main().catch(e=>{ console.error(e); process.exit(1); });
