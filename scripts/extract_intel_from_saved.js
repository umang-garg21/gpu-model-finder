#!/usr/bin/env node
const fs = require('fs');
const path = require('path');

const file = process.argv[2] || path.join(__dirname, '..', 'data', 'single_gpt5.json');
const target = (process.env.TARGET_MODEL || process.argv[3] || 'gpt-5.2').toLowerCase();

function norm(s){ return (s||'').toString().toLowerCase(); }
function findToken(s,tokens){ const x = norm(s); for(const t of tokens) if(x.includes(t)) return t; return null; }

const benchmarkTokens = ['mmlu','gsm8k','math','imagenet','wer','humaneval','mteb','clip','coding','code','truthfulqa','hellaswag','winogrande','piqa','arc','vqa','commonsense','qa','squad','rte','cola','anli','cot','bbh','scifact','boolq'];

const raw = JSON.parse(fs.readFileSync(file,'utf8'));
const evals = raw.evaluations || [];
const candidates = [];
for(const sec of evals){
  const items = sec.items || [];
  for(const it of items){
    const sub = norm(it.subject||'');
    const ctx = norm(it.context||'');
    const rawRow = norm(it.rawRow||'');
    const val = Number(it.value);
    if(Number.isNaN(val)) continue;
    // focus on plausible evaluation scores: 0-100
    if(val < 0 || val > 100) continue;
    // look for benchmark token in subject/context/rawRow
    const bs = findToken(sub, benchmarkTokens) || findToken(ctx, benchmarkTokens) || findToken(rawRow, benchmarkTokens);
    const modelMention = norm(raw.title||'');
    // also check subject/context for model tokens
    const modelToken = target;
    const subjectHasModel = sub.includes(modelToken) || ctx.includes(modelToken) || rawRow.includes(modelToken) || (it.subject && it.subject.toString().toLowerCase().includes(modelToken));

    if(bs){
      // if subject looks like dataset, and context/model contains target, accept
      if(sub.includes(bs) && (subjectHasModel || ctx.includes(bs) || ctx.length < 30)){
        candidates.push({ dataset: bs, score: val, subject: it.subject, context: it.context, rawRow: it.rawRow });
        continue;
      }
      // if context contains bs and subject mentions model
      if(ctx.includes(bs) && subjectHasModel){
        candidates.push({ dataset: bs, score: val, subject: it.subject, context: it.context, rawRow: it.rawRow });
        continue;
      }
      // otherwise if rawRow contains bs and modelToken, accept
      if(rawRow.includes(bs) && rawRow.includes(modelToken)){
        candidates.push({ dataset: bs, score: val, subject: it.subject, context: it.context, rawRow: it.rawRow });
        continue;
      }
      // otherwise accept as possible dataset score
      candidates.push({ dataset: bs, score: val, subject: it.subject, context: it.context, rawRow: it.rawRow });
    }
    // also accept lines like "DatasetName: 51"
    const kv = rawRow.match(/([a-z0-9 _-]{2,40})[:\-–]\s*([0-9]{1,3}(?:\.[0-9]+)?)/);
    if(kv){
      const key = kv[1].trim();
      const token = findToken(key, benchmarkTokens);
      if(token) candidates.push({ dataset: token, score: val, subject: it.subject, context: it.context, rawRow: it.rawRow });
    }
  }
}

// dedupe by dataset, prefer highest confidence (first occurrence)
const out = {};
for(const c of candidates){
  const k = c.dataset;
  if(!out[k]) out[k] = c;
}

console.log(JSON.stringify({ model: target, extracted: out }, null, 2));
