#!/usr/bin/env node
const fs = require('fs');
const path = require('path');

const file = process.argv[2] || path.join(__dirname, '..', 'data', 'single_gpt5.json');
const target = (process.env.TARGET_MODEL || process.argv[3] || 'gpt-5.2').toLowerCase();
const raw = JSON.parse(fs.readFileSync(file,'utf8'));
const evals = raw.evaluations || [];

function cleanText(s){ if(!s) return ''; return s.toString().replace(/\s+/g,' ').trim(); }
function looksLikeModelName(s){ if(!s) return false; // heuristic: contains letters and digits and not too long
  const t = s.replace(/[^a-zA-Z0-9 \-\._()]/g,'');
  if(/static\/chunks|props:children|__className|lucide|http:|https:|svg|M18\s/.test(t)) return false;
  const letters = (t.match(/[a-zA-Z]/g)||[]).length;
  return letters >= 3 && t.length <= 120;
}
function looksLikePercentNumber(n){ if(typeof n !== 'number') return false; if(Number.isNaN(n)) return false; return n >= 0 && n <= 100; }

const blocks = [];
for(const sec of evals){
  const items = (sec.items||[]).map(it => ({
    text: cleanText(it.subject || it.rawRow || it.context || ''),
    rawRow: cleanText(it.rawRow || ''),
    value: (typeof it.value === 'number') ? it.value : (it.value ? Number(it.value) : NaN)
  }));

  // sliding scan
  for(let i=0;i<items.length;i++){
    // require at least 3 model names in a row
    if(!looksLikeModelName(items[i].text)) continue;
    // find run of model-like texts
    let j = i;
    while(j < items.length && looksLikeModelName(items[j].text) && (items[j].text.length > 0)) j++;
    const textRunLen = j - i;
    if(textRunLen < 3) continue;
    // look for a following run of numeric percentages of same length within next 8 items
    let numStart = j;
    // skip short non-numeric separators
    while(numStart < items.length && (!looksLikePercentNumber(items[numStart].value)) && numStart < j+8) numStart++;
    if(numStart >= items.length) continue;
    // check numeric run length
    let k = numStart;
    while(k < items.length && looksLikePercentNumber(items[k].value) && (k - numStart) < textRunLen*2) k++;
    const numRunLen = k - numStart;
    if(numRunLen < Math.min(2, textRunLen)) continue;
    // take min(textRunLen, numRunLen)
    const L = Math.min(textRunLen, numRunLen);
    const models = items.slice(i, i+L).map(x=>x.text);
    const scores = items.slice(numStart, numStart+L).map(x=>x.value);
    // store block
    const mapping = {};
    for(let u=0;u<L;u++) mapping[models[u]] = scores[u];
    blocks.push({ heading: sec.heading || null, models, scores, mapping, startIndex: i, numStartIndex: numStart });
    // advance i
    i = numStart + numRunLen;
  }
}

// dedupe blocks by heading+startIndex
const unique = [];
const seen = new Set();
for(const b of blocks){
  const k = JSON.stringify([b.heading,b.startIndex,b.numStartIndex]);
  if(seen.has(k)) continue;
  seen.add(k);
  unique.push(b);
}

// try to find target in blocks
const results = [];
for(const b of unique){
  for(const m of Object.keys(b.mapping)){
    if(m.toLowerCase().includes(target) || target.includes(m.toLowerCase()) || m.toLowerCase().includes(target.replace(/gpt-|openai_|-/g,''))){
      results.push({ heading: b.heading, model: m, score: b.mapping[m], mapping: b.mapping });
      break;
    }
  }
}

// If none found, also attempt fuzzy match across all models
if(results.length === 0){
  for(const b of unique){
    for(const m of Object.keys(b.mapping)){
      if(m.toLowerCase().includes('gpt') && m.toLowerCase().includes('5')){
        results.push({ heading: b.heading, model: m, score: b.mapping[m], mapping: b.mapping });
        break;
      }
    }
  }
}

console.log(JSON.stringify({ target, found: results, blocks: unique.slice(0,10) }, null, 2));
