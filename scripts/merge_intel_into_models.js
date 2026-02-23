#!/usr/bin/env node
const fs = require('fs');
const path = require('path');

const MODELS_FILE = path.resolve(__dirname, '..', 'data', 'models_artificialanalysis.json');
const INTEL_FILE = path.resolve(__dirname, '..', 'data', 'artificialanalysis_intel_metrics.json');

function norm(s){ return (s||'').toString().toLowerCase().replace(/[\s\-_:(),.\/\\]+/g,' ').trim(); }

function findModelIndex(models, name){
  const n = norm(name);
  // try exact title match first
  for (let i=0;i<models.length;i++){ if (norm(models[i].title) === n) return i; }
  // try substring match in title
  for (let i=0;i<models.length;i++){ if (norm(models[i].title).includes(n) || n.includes(norm(models[i].title))) return i; }
  // try url match
  for (let i=0;i<models.length;i++){ if ((models[i].url||'').toLowerCase().includes(n) || n.includes((models[i].url||'').toLowerCase())) return i; }
  return -1;
}

function merge(){
  const modelsJson = JSON.parse(fs.readFileSync(MODELS_FILE,'utf8'));
  const intelJson = JSON.parse(fs.readFileSync(INTEL_FILE,'utf8'));
  const pages = intelJson.pages || [];
  for (const p of pages){
    if (!p.result || !p.result.metrics) continue;
    for (const metric of p.result.metrics){
      const metricName = metric.metric || 'intelligence';
      for (const pair of metric.pairs || []){
        if (!pair.model) continue;
        const idx = findModelIndex(modelsJson.models, pair.model);
        if (idx === -1) continue;
        const m = modelsJson.models[idx];
        m.metrics = m.metrics || {};
        m.metrics.intelligence = m.metrics.intelligence || {};
        m.metrics.intelligence[metricName] = pair.value;
      }
    }
  }
  fs.writeFileSync(MODELS_FILE, JSON.stringify(modelsJson, null, 2));
  console.log('merged intel into', MODELS_FILE);
}

merge();
