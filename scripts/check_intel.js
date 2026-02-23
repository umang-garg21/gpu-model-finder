#!/usr/bin/env node
const axios = require('axios');
const cheerio = require('cheerio');
const url = process.argv[2] || 'https://artificialanalysis.ai/models/gpt-5-2';
(async ()=>{
  try {
    const r = await axios.get(url, { headers: { 'User-Agent': 'gpu-model-finder-debug' }, timeout: 20000 });
    const $ = cheerio.load(r.data);
    const bodyText = ($('body').text() || '').slice(0, 5000);
    const bodyMatch = (bodyText.match(/scores\s*([0-9]{1,3}(?:\.[0-9])?)/i) || [])[1];
    console.log('bodyText scores:', bodyMatch || 'none');
    const rawMatch = (r.data.match(/scores\s*([0-9]{1,3}(?:\.[0-9])?)[\s\S]{0,80}?Artificial Analysis Intelligence Index/i) || [])[1];
    console.log('raw HTML match:', rawMatch || 'none');
  } catch (e) {
    console.error('error', e.message || e);
    process.exitCode = 2;
  }
})();
