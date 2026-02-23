#!/usr/bin/env node
const axios = require('axios');
const cheerio = require('cheerio');

const url = process.env.DEBUG_URL || process.argv[2];
if (!url) {
  console.error('Usage: DEBUG_URL=https://... node scripts/debug_fetch_page.js');
  process.exit(2);
}

(async () => {
  try {
    const resp = await axios.get(url, { headers: { 'User-Agent': 'gpu-model-finder-debug/1.0' }, timeout: 20000 });
    const $ = cheerio.load(resp.data);
    console.log('Title:', ($('meta[property="og:title"]').attr('content') || $('title').text() || $('h1').first().text()).trim());

    console.log('\n--- Headings (h1..h4) ---');
    $('h1,h2,h3,h4').each((i, h) => console.log(i, $(h).text().trim()));

    console.log('\n--- Sections mentioning "Intelligence" ---');
    $('h1,h2,h3,h4,h5').each((i, h) => {
      const txt = $(h).text() || '';
      if (/Intelligence/i.test(txt)) {
        console.log('\nHEADING:', txt.trim());
        // print next 5 sibling elements HTML
        let node = h.nextSibling;
        let cnt = 0;
        while (node && cnt < 12) {
          if (node.type === 'tag') console.log('->', node.name, $(node).text().trim().slice(0, 300));
          node = node.nextSibling;
          cnt++;
        }
      }
    });

    console.log('\n--- Scripts with labels/data ---');
    $('script').each((i, s) => {
      const txt = $(s).html() || '';
      if (/labels\s*:\s*\[|data\s*:\s*\[|Artificial Analysis Intelligence|Intelligence Evaluations/i.test(txt)) {
        console.log('\n--- script', i, '---');
        console.log(txt.slice(0, 2000));
      }
    });

    // print any application/ld+json blocks
    $('script[type="application/ld+json"]').each((i, s) => {
      try {
        const j = JSON.parse($(s).html());
        console.log('\n--- ld+json block', i, 'keys:', Object.keys(j));
      } catch (e) {}
    });

  } catch (e) {
    console.error('fetch error', e.message || e);
    process.exitCode = 2;
  }
})();
