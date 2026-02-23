#!/usr/bin/env node
const fs = require('fs');
const path = require('path');

const q = process.argv[2] || process.env.Q;
if (!q) {
  console.error('Usage: node scripts/search_models.js <query>');
  process.exit(2);
}

const dataPath = path.join(__dirname, '..', 'data', 'models_artificialanalysis.json');
if (!fs.existsSync(dataPath)) {
  console.error('Data file not found:', dataPath);
  process.exit(3);
}

const raw = fs.readFileSync(dataPath, 'utf8');
const obj = JSON.parse(raw);
const models = Array.isArray(obj.models) ? obj.models : (Array.isArray(obj) ? obj : []);
const ql = q.toLowerCase();
const results = models.filter(m => {
  const name = (m.name || m.model || m.title || m.id || m.url || '').toString().toLowerCase();
  return name.includes(ql);
});

console.log(JSON.stringify({ total: results.length, results }, null, 2));
