#!/usr/bin/env node
const fs = require('fs');
const path = require('path');
const file = process.argv[2] || path.join(__dirname, '..', 'data', 'single_gpt5.json');
const target = (process.env.TARGET_MODEL || process.argv[3] || 'GPT-5.2');
const txt = fs.readFileSync(file,'utf8');

function extractAfter(keyword, chars=8000){
  const idx = txt.indexOf(keyword);
  if(idx===-1) return null;
  return txt.slice(idx, idx+chars);
}

const block = extractAfter('Intelligence Evaluations') || extractAfter('Intelligence evaluation') || extractAfter('Artificial Analysis Intelligence');
if(!block){
  console.error('Could not find Intelligence Evaluations block in saved file.');
  process.exit(2);
}

// Normalize and split into plausible lines by punctuation/newlines
const cleaned = block.replace(/\\\"/g,'"').replace(/\\n/g,'\n').replace(/\\r/g,'\n');
const lines = cleaned.split(/\n|\\n|\r|\r\n/).map(l=>l.trim()).filter(Boolean);

// Find model lists (lines that contain words, digits, and not just short tokens)
const modelLines = [];
const percentLines = [];
for(const l of lines){
  // percent line like '57%' or '57 %' or '57'
  if(/^[0-9]{1,3}%?$/.test(l) || /^[0-9]{1,3}([.,][0-9]+)?%?$/.test(l)){
    percentLines.push(l.replace('%','').replace(',','.'));
    continue;
  }
  // lines with many model names often contain spaces and capital letters or numbers
  if(/[A-Za-z].*[0-9A-Za-z]/.test(l) && l.length>2){
    // skip short css-like lines
    if(/static\/chunks|props:children|lucide|text-gray|hover:bg|__className/.test(l)) continue;
    modelLines.push(l);
  }
}

// Heuristic: models are listed across several consecutive modelLines; percentages come grouped later.
// Try to find first group of model names where next lines contain only percents of same count

function splitModelsAndPercs(modelLines, percentLines){
  // models may be combined in one line separated by commas or newlines; split tokens by multiple spaces and by '  '
  // Flatten model tokens from modelLines by splitting on 2+ spaces or commas
  const tokens = modelLines.flatMap(l => l.split(/\s{2,}|,\s*|\s+\(?/).map(t=>t.trim()).filter(Boolean));
  const perc = percentLines.map(p=>parseFloat(p))
    .filter(n=>!Number.isNaN(n) && n>=0 && n<=100);
  // Try to align by taking first N tokens and first N perc
  const N = Math.min(tokens.length, perc.length);
  const mapping = {};
  for(let i=0;i<N;i++) mapping[tokens[i]] = perc[i];
  return { tokens: tokens.slice(0,N), perc: perc.slice(0,N), mapping };
}

const result = splitModelsAndPercs(modelLines.slice(0,200), percentLines.slice(0,200));

// Attempt to find target in tokens
let targetScore = null;
for(const t of Object.keys(result.mapping)){
  if(t.toLowerCase().includes(target.toLowerCase().replace(/-/g,' ')) || target.toLowerCase().includes(t.toLowerCase().replace(/[-_.]/g,' '))){
    targetScore = { model: t, score: result.mapping[t] };
    break;
  }
}

console.log(JSON.stringify({ tokens: result.tokens.slice(0,30), perc: result.perc.slice(0,30), targetScore }, null, 2));
