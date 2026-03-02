const express = require('express');
const axios   = require('axios');
const NodeCache = require('node-cache');
const fs = require('fs');
const path    = require('path');
const nodemailer = require('nodemailer');

const app   = express();
const cache = new NodeCache({ stdTTL: 600 }); // 10-minute cache

app.use(express.static(path.join(__dirname, 'public'), { index: false }));
app.use(express.json());

// ── Page routes ────────────────────────────────────────────────
// Landing page at root; the tool at /tool; reverse search at /reverse
app.get('/', (_req, res) => res.sendFile(path.join(__dirname, 'public', 'landing.html')));
app.get('/tool', (_req, res) => res.sendFile(path.join(__dirname, 'public', 'index.html')));
app.get('/reverse', (_req, res) => res.sendFile(path.join(__dirname, 'public', 'reverse.html')));

// ── Google Search Console HTML file verification ───────────────
app.get('/googlek7zHklOtdojWKO-XlHJ8A0UwuKaDZRb3fq5LEdW2gAA.html', (_req, res) => {
  res.type('text/html').send('google-site-verification: googlek7zHklOtdojWKO-XlHJ8A0UwuKaDZRb3fq5LEdW2gAA.html');
});

// ── SEO: robots.txt + sitemap.xml ──────────────────────────────
app.get('/robots.txt', (req, res) => {
  const host = `${req.protocol}://${req.get('host')}`;
  res.type('text/plain').send(
`User-agent: *
Allow: /
Disallow: /api/

Sitemap: ${host}/sitemap.xml`
  );
});

app.get('/sitemap.xml', (req, res) => {
  const host = `${req.protocol}://${req.get('host')}`;
  const now = new Date().toISOString().split('T')[0];
  let featuredModels = [];
  try { featuredModels = JSON.parse(fs.readFileSync(path.join(__dirname, 'data', 'featured_models.json'), 'utf8')); } catch (_) {}
  const modelUrls = featuredModels.map(m =>
    `  <url>\n    <loc>${host}/models/${m.slug}</loc>\n    <lastmod>${now}</lastmod>\n    <changefreq>monthly</changefreq>\n    <priority>0.8</priority>\n  </url>`
  ).join('\n');
  res.type('application/xml').send(
`<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
  <url>
    <loc>${host}/</loc>
    <lastmod>${now}</lastmod>
    <changefreq>weekly</changefreq>
    <priority>1.0</priority>
  </url>
  <url>
    <loc>${host}/tool</loc>
    <lastmod>${now}</lastmod>
    <changefreq>weekly</changefreq>
    <priority>0.9</priority>
  </url>
  <url>
    <loc>${host}/reverse</loc>
    <lastmod>${now}</lastmod>
    <changefreq>monthly</changefreq>
    <priority>0.8</priority>
  </url>
${modelUrls}
</urlset>`
  );
});

// ── Constants ──────────────────────────────────────────────────
const DTYPE_BYTES = { fp32: 4, fp16: 2, bf16: 2, int8: 1, int4: 0.5, gguf_q4: 0.5, gguf_q8: 1 };

const PIPELINE_LABELS = {
  'text-generation':             'LLM / Text Generation',
  'text2text-generation':        'LLM / Seq2Seq',
  'text-to-image':               'Text to Image',
  'image-to-image':              'Image to Image',
  'automatic-speech-recognition':'Speech Recognition',
  'text-to-speech':              'Text to Speech',
  'audio-to-audio':              'Audio Processing',
  'image-classification':        'Image Classification',
  'object-detection':            'Object Detection',
  'image-segmentation':          'Image Segmentation',
  'text-to-video':               'Text to Video',
  'video-classification':        'Video Classification',
  'feature-extraction':          'Embeddings',
  'sentence-similarity':         'Embeddings / Similarity',
  'depth-estimation':            'Depth Estimation',
  'image-to-text':               'Image to Text',
};

// ── Benchmark data ─────────────────────────────────────────────
// Curated scores for popular models. All values are percentages (0–100).
// wer (Word Error Rate) is the exception — lower is better.
// Sources: model cards, Open LLM Leaderboard, published papers.
const BENCHMARK_DATA = {
  // ── LLMs: mmlu, humaneval, math, gsm8k, arc, ifeval, swebench, gaia ──
  // swebench = SWE-bench Verified (% GitHub issues resolved by model-as-agent)
  // gaia     = GAIA benchmark (% correct on agentic web/tool-use tasks, avg all levels)
  'meta-llama/Llama-3.1-8B-Instruct':           { mmlu:68.4, humaneval:72.6, math:51.9, gsm8k:84.5, arc:60.1, ifeval:71.2 },
  'meta-llama/Llama-3.1-70B-Instruct':          { mmlu:83.6, humaneval:80.5, math:68.0, gsm8k:95.1, arc:67.7, ifeval:84.6, swebench:6.1,  gaia:20.0 },
  'meta-llama/Llama-3.1-405B-Instruct':         { mmlu:87.3, humaneval:89.0, math:73.8, gsm8k:96.8, arc:70.2, ifeval:88.6 },
  'meta-llama/Llama-3.2-1B-Instruct':           { mmlu:49.3, humaneval:38.4, math:25.0, gsm8k:44.4, arc:47.3, ifeval:53.2 },
  'meta-llama/Llama-3.2-3B-Instruct':           { mmlu:63.4, humaneval:58.0, math:41.6, gsm8k:77.7, arc:54.8, ifeval:67.4 },
  'meta-llama/Llama-3.3-70B-Instruct':          { mmlu:86.0, humaneval:88.4, math:77.0, gsm8k:95.6, arc:68.5, ifeval:85.0, swebench:11.0, gaia:26.0 },
  // Qwen 2.5 instruct series
  'Qwen/Qwen2.5-0.5B-Instruct':                 { mmlu:47.0, humaneval:36.6, math:41.1, gsm8k:41.2, arc:40.3, ifeval:35.2 },
  'Qwen/Qwen2.5-1.5B-Instruct':                 { mmlu:60.9, humaneval:61.0, math:55.2, gsm8k:68.5, arc:52.1, ifeval:47.4 },
  'Qwen/Qwen2.5-3B-Instruct':                   { mmlu:65.0, humaneval:65.9, math:65.6, gsm8k:79.1, arc:55.2, ifeval:57.0 },
  'Qwen/Qwen2.5-7B-Instruct':                   { mmlu:74.2, humaneval:84.1, math:75.5, gsm8k:91.6, arc:62.0, ifeval:71.1 },
  'Qwen/Qwen2.5-14B-Instruct':                  { mmlu:79.7, humaneval:78.7, math:79.9, gsm8k:93.3, arc:66.4, ifeval:75.9 },
  'Qwen/Qwen2.5-32B-Instruct':                  { mmlu:83.0, humaneval:85.4, math:83.1, gsm8k:95.3, arc:68.2, ifeval:83.4, swebench:17.2 },
  'Qwen/Qwen2.5-72B-Instruct':                  { mmlu:85.3, humaneval:86.0, math:83.1, gsm8k:95.2, arc:70.4, ifeval:84.8, swebench:23.3, gaia:35.0 },
  // Qwen 2.5 Coder series
  'Qwen/Qwen2.5-Coder-1.5B-Instruct':           { mmlu:58.0, humaneval:78.2, math:62.5, gsm8k:74.8, arc:51.0, ifeval:45.0 },
  'Qwen/Qwen2.5-Coder-7B-Instruct':             { mmlu:72.0, humaneval:88.4, math:83.9, gsm8k:91.6, arc:61.0, ifeval:69.8 },
  'Qwen/Qwen2.5-Coder-14B-Instruct':            { mmlu:78.8, humaneval:90.2, math:85.0, gsm8k:93.0, arc:65.5, ifeval:75.0 },
  'Qwen/Qwen2.5-Coder-32B-Instruct':            { mmlu:82.5, humaneval:92.7, math:88.2, gsm8k:93.5, arc:68.0, ifeval:80.2, swebench:30.0 },
  // Qwen 3 series (non-thinking mode; thinking mode scores significantly higher on math/coding)
  'Qwen/Qwen3-0.6B':                            { mmlu:55.5, humaneval:49.4, math:60.2, gsm8k:72.5, arc:49.1, ifeval:51.0 },
  'Qwen/Qwen3-1.7B':                            { mmlu:63.8, humaneval:65.9, math:72.6, gsm8k:81.8, arc:54.6, ifeval:59.6 },
  'Qwen/Qwen3-4B':                              { mmlu:74.8, humaneval:78.6, math:84.9, gsm8k:90.4, arc:62.5, ifeval:67.5 },
  'Qwen/Qwen3-8B':                              { mmlu:79.4, humaneval:83.5, math:88.8, gsm8k:92.0, arc:65.2, ifeval:72.0 },
  'Qwen/Qwen3-14B':                             { mmlu:83.2, humaneval:86.5, math:92.0, gsm8k:94.4, arc:68.1, ifeval:77.8 },
  'Qwen/Qwen3-32B':                             { mmlu:85.4, humaneval:90.1, math:94.1, gsm8k:95.8, arc:70.2, ifeval:82.3, swebench:28.0 },
  'Qwen/Qwen3-30B-A3B':                         { mmlu:80.0, humaneval:83.0, math:86.5, gsm8k:91.5, arc:64.0, ifeval:74.0 },
  'Qwen/Qwen3-235B-A22B':                       { mmlu:87.5, humaneval:91.8, math:95.4, gsm8k:96.9, arc:72.0, ifeval:85.0, swebench:38.0 },
  // QwQ reasoning
  'Qwen/QwQ-32B':                               { mmlu:82.5, humaneval:91.5, math:95.8, gsm8k:95.8, arc:67.4, ifeval:78.6, gaia:42.0 },
  // Mistral / Mixtral
  'mistralai/Mistral-7B-Instruct-v0.3':         { mmlu:62.5, humaneval:40.2, math:13.1, gsm8k:52.2, arc:54.0, ifeval:49.6 },
  'mistralai/Mistral-7B-Instruct-v0.2':         { mmlu:62.5, humaneval:40.2, math:13.1, gsm8k:52.2, arc:54.0, ifeval:49.6 },
  'mistralai/Mistral-Nemo-Instruct-2407':       { mmlu:68.0, humaneval:62.4, math:40.4, gsm8k:82.0, arc:60.4, ifeval:58.0 },
  'mistralai/Mistral-Small-Instruct-2409':      { mmlu:72.0, humaneval:68.0, math:48.0, gsm8k:85.0, arc:62.0, ifeval:62.0 },
  'mistralai/Mistral-Large-Instruct-2411':      { mmlu:84.0, humaneval:83.0, math:70.0, gsm8k:93.0, arc:69.0, ifeval:80.0 },
  'mistralai/Mixtral-8x7B-Instruct-v0.1':       { mmlu:71.2, humaneval:45.1, math:28.4, gsm8k:74.4, arc:61.3, ifeval:47.9 },
  'mistralai/Mixtral-8x22B-Instruct-v0.1':      { mmlu:77.7, humaneval:51.3, math:41.8, gsm8k:88.2, arc:66.0, ifeval:72.7 },
  // Google Gemma 2
  'google/gemma-2-2b-it':                       { mmlu:55.7, humaneval:40.2, math:20.0, gsm8k:61.0, arc:52.2, ifeval:52.0 },
  'google/gemma-2-9b-it':                       { mmlu:72.3, humaneval:68.3, math:44.4, gsm8k:90.8, arc:63.7, ifeval:71.5 },
  'google/gemma-2-27b-it':                      { mmlu:78.7, humaneval:74.4, math:55.2, gsm8k:90.7, arc:67.5, ifeval:77.9 },
  // Microsoft Phi
  'microsoft/Phi-3-mini-4k-instruct':           { mmlu:69.9, humaneval:59.1, math:41.6, gsm8k:86.4, arc:62.0, ifeval:45.8 },
  'microsoft/Phi-3-mini-128k-instruct':         { mmlu:69.9, humaneval:59.1, math:41.6, gsm8k:86.4, arc:62.0, ifeval:45.8 },
  'microsoft/Phi-3.5-mini-instruct':            { mmlu:69.0, humaneval:62.8, math:46.4, gsm8k:88.6, arc:61.6, ifeval:49.2 },
  'microsoft/Phi-3-medium-4k-instruct':         { mmlu:78.0, humaneval:70.6, math:51.4, gsm8k:90.9, arc:65.0, ifeval:55.0 },
  'microsoft/Phi-3-medium-128k-instruct':       { mmlu:78.0, humaneval:70.6, math:51.4, gsm8k:90.9, arc:65.0, ifeval:55.0 },
  'microsoft/Phi-3.5-MoE-instruct':            { mmlu:77.8, humaneval:68.4, math:59.2, gsm8k:90.9, arc:64.0, ifeval:56.0 },
  'microsoft/Phi-4':                            { mmlu:84.8, humaneval:82.6, math:80.4, gsm8k:95.6, arc:72.0, ifeval:72.0 },
  // DeepSeek R1 distills
  'deepseek-ai/DeepSeek-R1-Distill-Qwen-1.5B': { mmlu:44.0, humaneval:72.8, math:83.9, gsm8k:83.9, arc:48.0, ifeval:36.0 },
  'deepseek-ai/DeepSeek-R1-Distill-Qwen-7B':   { mmlu:55.5, humaneval:86.0, math:92.8, gsm8k:92.8, arc:59.0, ifeval:51.2 },
  'deepseek-ai/DeepSeek-R1-Distill-Qwen-14B':  { mmlu:69.5, humaneval:91.5, math:93.9, gsm8k:93.9, arc:65.0, ifeval:66.4 },
  'deepseek-ai/DeepSeek-R1-Distill-Qwen-32B':  { mmlu:72.6, humaneval:92.7, math:94.3, gsm8k:93.3, arc:68.0, ifeval:72.8, swebench:32.0 },
  'deepseek-ai/DeepSeek-R1-Distill-Llama-8B':  { mmlu:50.0, humaneval:73.8, math:89.1, gsm8k:89.1, arc:56.0, ifeval:44.0 },
  'deepseek-ai/DeepSeek-R1-Distill-Llama-70B': { mmlu:77.6, humaneval:95.1, math:94.5, gsm8k:95.0, arc:70.0, ifeval:76.0 },
  'deepseek-ai/DeepSeek-R1':                   { mmlu:90.8, humaneval:96.3, math:97.3, gsm8k:97.3, arc:75.0, ifeval:83.3, swebench:49.2, gaia:45.0 },
  'deepseek-ai/DeepSeek-V3':                   { mmlu:88.5, humaneval:91.6, math:90.2, gsm8k:95.8, arc:72.2, ifeval:84.8, swebench:42.0 },
  'deepseek-ai/DeepSeek-V2.5':                 { mmlu:80.5, humaneval:89.0, math:70.5, gsm8k:92.0, arc:67.0, ifeval:76.0, swebench:22.0 },
  // CohereForAI
  'CohereForAI/c4ai-command-r-plus-08-2024':   { mmlu:75.7, humaneval:60.4, math:56.0, gsm8k:90.5, arc:66.0, ifeval:73.2 },
  'CohereForAI/c4ai-command-r7b-12-2024':      { mmlu:69.5, humaneval:56.0, math:44.0, gsm8k:82.0, arc:60.0, ifeval:64.0 },
  // Falcon
  'tiiuae/falcon-7b-instruct':                 { mmlu:27.8, humaneval:16.5, math:2.5,  gsm8k:6.8,  arc:39.4, ifeval:24.0 },
  // SmolLM / HuggingFaceTB
  'HuggingFaceTB/SmolLM2-1.7B-Instruct':       { mmlu:51.0, humaneval:38.0, math:30.0, gsm8k:47.0, arc:46.0, ifeval:40.0 },
  'HuggingFaceTB/SmolLM2-360M-Instruct':       { mmlu:40.0, humaneval:25.0, math:18.0, gsm8k:30.0, arc:38.0, ifeval:30.0 },
  // Zhipu AI — GLM-4 / GLM-Z1
  'THUDM/glm-4-9b-chat':                       { mmlu:72.4, humaneval:71.8, math:50.6, gsm8k:79.6, arc:61.5, ifeval:64.5 },
  'THUDM/glm-4-9b-chat-1m':                    { mmlu:72.4, humaneval:71.8, math:50.6, gsm8k:79.6, arc:61.5, ifeval:64.5 },
  'THUDM/GLM-4-32B-0414':                      { mmlu:83.0, humaneval:85.0, math:82.0, gsm8k:94.0, arc:68.0, ifeval:80.0, swebench:20.0 },
  'THUDM/GLM-Z1-32B-0414':                     { mmlu:80.0, humaneval:90.0, math:92.0, gsm8k:94.5, arc:66.0, ifeval:74.0, swebench:30.0 },
  'THUDM/GLM-Z1-9B-0414':                      { mmlu:75.0, humaneval:82.0, math:85.0, gsm8k:91.0, arc:63.0, ifeval:68.0 },
  'THUDM/GLM-Z1-Rumination-32B-0414':          { mmlu:81.0, humaneval:91.0, math:93.5, gsm8k:95.0, arc:67.0, ifeval:75.0 },
  // 01-ai — Yi
  '01-ai/Yi-1.5-6B-Chat':                      { mmlu:62.0, humaneval:42.0, math:36.0, gsm8k:66.0, arc:55.0, ifeval:49.0 },
  '01-ai/Yi-1.5-9B-Chat':                      { mmlu:70.0, humaneval:55.5, math:47.6, gsm8k:79.0, arc:63.4, ifeval:57.0 },
  '01-ai/Yi-1.5-34B-Chat':                     { mmlu:76.8, humaneval:65.4, math:53.3, gsm8k:88.0, arc:67.0, ifeval:66.0 },
  // Shanghai AI Lab — InternLM 2.5
  'internlm/internlm2_5-7b-chat':              { mmlu:72.8, humaneval:72.0, math:57.0, gsm8k:86.0, arc:62.0, ifeval:68.0 },
  'internlm/internlm2_5-20b-chat':             { mmlu:77.6, humaneval:78.9, math:62.0, gsm8k:90.0, arc:65.0, ifeval:74.0 },
  'internlm/internlm3-8b-instruct':            { mmlu:76.0, humaneval:73.0, math:72.0, gsm8k:88.0, arc:64.0, ifeval:70.0 },
  // Databricks — DBRX
  'databricks/dbrx-instruct':                  { mmlu:73.7, humaneval:70.1, math:45.9, gsm8k:72.8, arc:62.3, ifeval:57.2 },
  // TII — Falcon 3
  'tiiuae/Falcon3-1B-Instruct':                { mmlu:44.0, humaneval:35.0, math:18.0, gsm8k:45.0, arc:41.0, ifeval:36.0 },
  'tiiuae/Falcon3-3B-Instruct':                { mmlu:59.0, humaneval:49.0, math:33.0, gsm8k:64.0, arc:53.0, ifeval:48.0 },
  'tiiuae/Falcon3-7B-Instruct':                { mmlu:70.4, humaneval:62.0, math:46.0, gsm8k:78.0, arc:61.0, ifeval:57.0 },
  'tiiuae/Falcon3-10B-Instruct':               { mmlu:72.0, humaneval:64.0, math:50.0, gsm8k:81.0, arc:63.0, ifeval:60.0 },
  // DeepSeek Coder V2
  'deepseek-ai/DeepSeek-Coder-V2-Lite-Instruct': { mmlu:60.0, humaneval:81.1, math:72.6, gsm8k:77.0, arc:55.0, ifeval:51.0 },
  'deepseek-ai/DeepSeek-Coder-V2-Instruct':    { mmlu:79.2, humaneval:90.2, math:75.7, gsm8k:94.9, arc:67.0, ifeval:77.0, swebench:29.0 },
  // NousResearch — Hermes
  'NousResearch/Hermes-3-Llama-3.1-8B':        { mmlu:67.8, humaneval:70.0, math:46.0, gsm8k:83.0, arc:59.0, ifeval:68.0 },
  'NousResearch/Hermes-3-Llama-3.1-70B':       { mmlu:82.0, humaneval:78.0, math:65.0, gsm8k:93.0, arc:66.0, ifeval:82.0 },
  // MiniCPM (openbmb)
  'openbmb/MiniCPM3-4B':                       { mmlu:67.2, humaneval:74.4, math:52.6, gsm8k:81.1, arc:60.0, ifeval:56.0 },
  // OLMo (AI2)
  'allenai/OLMo-2-7B-Instruct':                { mmlu:57.0, humaneval:43.0, math:28.0, gsm8k:61.0, arc:52.0, ifeval:48.0 },
  'allenai/OLMo-2-13B-Instruct':               { mmlu:63.0, humaneval:53.0, math:36.0, gsm8k:72.0, arc:57.0, ifeval:55.0 },
  // WizardLM
  'WizardLMTeam/WizardLM-2-7B':                { mmlu:62.0, humaneval:50.0, math:22.0, gsm8k:61.0, arc:55.0, ifeval:46.0 },
  'WizardLMTeam/WizardLM-2-8x22B':             { mmlu:77.2, humaneval:62.0, math:43.0, gsm8k:87.0, arc:65.0, ifeval:70.0 },
  // HuggingFace — Zephyr
  'HuggingFaceH4/zephyr-7b-beta':              { mmlu:61.4, humaneval:22.0, math:5.9,  gsm8k:52.1, arc:55.8, ifeval:43.8 },
  // Aya Expanse (CohereForAI multilingual)
  'CohereForAI/aya-expanse-8b':                 { mmlu:57.0, humaneval:40.0, math:28.0, gsm8k:60.0, arc:53.0, ifeval:50.0 },
  'CohereForAI/aya-expanse-32b':                { mmlu:70.0, humaneval:56.0, math:42.0, gsm8k:78.0, arc:62.0, ifeval:63.0 },
  // TinyLlama
  'TinyLlama/TinyLlama-1.1B-Chat-v1.0':        { mmlu:26.0, humaneval:12.0, math:1.7,  gsm8k:2.3,  arc:34.0, ifeval:20.0 },
  // NVIDIA — Nemotron
  'nvidia/Llama-3.1-Nemotron-70B-Instruct-HF': { mmlu:85.1, humaneval:84.1, math:76.0, gsm8k:94.5, arc:68.0, ifeval:86.0 },
  'nvidia/Llama-3.1-Nemotron-51B-Instruct':    { mmlu:80.2, humaneval:72.0, math:68.0, gsm8k:90.0, arc:65.0, ifeval:78.0 },
  // Apple — OpenELM
  'apple/OpenELM-3B-Instruct':                 { mmlu:28.0, humaneval:16.0, math:4.0,  gsm8k:8.0,  arc:36.0, ifeval:24.0 },
  // Google — Gemma 3 (March 2025)
  'google/gemma-3-1b-it':                      { mmlu:45.2, humaneval:35.4, math:39.6, gsm8k:49.8, arc:42.1, ifeval:41.8 },
  'google/gemma-3-4b-it':                      { mmlu:59.6, humaneval:60.4, math:62.1, gsm8k:68.0, arc:54.3, ifeval:52.2 },
  'google/gemma-3-12b-it':                     { mmlu:74.5, humaneval:79.2, math:79.5, gsm8k:89.2, arc:64.5, ifeval:73.0 },
  'google/gemma-3-27b-it':                     { mmlu:83.2, humaneval:82.0, math:89.2, gsm8k:93.0, arc:70.4, ifeval:76.5 },
  // Mistral — Small 3.1 (March 2025)
  'mistralai/Mistral-Small-3.1-24B-Instruct-2503': { mmlu:81.5, humaneval:71.2, math:57.8, gsm8k:92.5, arc:66.2, ifeval:74.8 },
  // Microsoft — Phi-4-mini (April 2025, 3.8B) — note: HF id uses lowercase 'phi'
  'microsoft/phi-4-mini-instruct':             { mmlu:67.1, humaneval:75.4, math:71.3, gsm8k:83.0, arc:60.2, ifeval:67.5 },
  // DeepSeek — V3.2 (2025 thinking/reasoning model; official model card benchmarks)
  'deepseek-ai/DeepSeek-V3.2':          { swebench: 73.1, gpqa: 82.4, hle: 25.1 },
  'deepseek-ai/DeepSeek-V3.2-Speciale': { swebench: 73.1, gpqa: 82.4, hle: 25.1 },
  // Cohere — Command A (March 2025, 111B MoE — benchmarks only in tech report PDF)
  // Zhipu AI / ZAI — GLM series (2025 thinking/reasoning models; official model card benchmarks)
  'zai-org/GLM-5':                      { swebench: 77.8, gpqa: 86.0, hle: 30.5 },
  'zai-org/GLM-4.7':                    { swebench: 73.8, gpqa: 85.7, hle: 24.8 },
  'zai-org/GLM-4.7-Flash':              { swebench: 59.2, gpqa: 75.2, hle: 14.4 },
  // ── Embeddings: mteb ──────────────────────────────────────────
  'BAAI/bge-large-en-v1.5':                     { mteb: 64.2 },
  'BAAI/bge-m3':                                { mteb: 62.8 },
  'BAAI/bge-base-en-v1.5':                      { mteb: 63.6 },
  'sentence-transformers/all-MiniLM-L6-v2':     { mteb: 56.3 },
  'sentence-transformers/all-mpnet-base-v2':    { mteb: 57.8 },
  'thenlper/gte-large':                         { mteb: 63.1 },
  'intfloat/multilingual-e5-large-instruct':    { mteb: 65.4 },
  'intfloat/e5-mistral-7b-instruct':            { mteb: 66.6 },
  'Alibaba-NLP/gte-Qwen2-7B-instruct':          { mteb: 70.2 },
  'Alibaba-NLP/gte-large-en-v1.5':              { mteb: 65.4 },
  // ── Audio: wer (lower is better, %) ──────────────────────────
  'openai/whisper-tiny':                         { wer: 18.1 },
  'openai/whisper-base':                         { wer: 13.7 },
  'openai/whisper-small':                        { wer: 9.9  },
  'openai/whisper-medium':                       { wer: 6.7  },
  'openai/whisper-large-v2':                     { wer: 5.5  },
  'openai/whisper-large-v3':                     { wer: 4.2  },
  'openai/whisper-large-v3-turbo':               { wer: 4.8  },
  'distil-whisper/distil-large-v3':              { wer: 5.8  },
  'distil-whisper/distil-medium.en':             { wer: 7.8  },
  // ── Image Gen: image_quality (0-100 preference), clip_score ──
  'CompVis/stable-diffusion-v1-4':              { image_quality: 42, clip_score: 28.5 },
  'runwayml/stable-diffusion-v1-5':             { image_quality: 45, clip_score: 29.0 },
  'stabilityai/stable-diffusion-2-1':           { image_quality: 50, clip_score: 29.5 },
  'stabilityai/stable-diffusion-xl-base-1.0':  { image_quality: 65, clip_score: 31.2 },
  'stabilityai/sdxl-turbo':                    { image_quality: 60, clip_score: 30.5 },
  'black-forest-labs/FLUX.1-schnell':           { image_quality: 78, clip_score: 33.2 },
  'black-forest-labs/FLUX.1-dev':               { image_quality: 84, clip_score: 34.1 },
  // ── Vision: imagenet_top1 ─────────────────────────────────────
  'google/vit-base-patch16-224':                { imagenet_top1: 81.8 },
  'google/vit-large-patch16-224':               { imagenet_top1: 86.7 },
  'openai/clip-vit-base-patch32':               { imagenet_top1: 63.3 },
  'openai/clip-vit-large-patch14':              { imagenet_top1: 75.5 },
  'microsoft/resnet-50':                        { imagenet_top1: 80.9 },
  'facebook/deit-base-distilled-patch16-224':   { imagenet_top1: 83.4 },
};

// ── Benchmark difficulty calibration ──────────────────────────
// floor:      score a random/weak model achieves (normalization lower bound)
// ceiling:    best known frontier score as of early 2026 (normalization upper bound)
// difficulty: 1–5 scale; scores are weighted by difficulty² so harder benchmarks dominate
const BENCHMARK_CALIBRATION = {
  hle:       { floor:  2.0, ceiling:  35.4, difficulty: 5.0 },
  gpqa:      { floor: 25.0, ceiling:  90.0, difficulty: 4.5 },
  swebench:  { floor:  0.0, ceiling:  77.0, difficulty: 4.0 },
  gaia:      { floor:  0.0, ceiling:  75.0, difficulty: 4.0 },
  gdpval:    { floor:  0.0, ceiling:  60.0, difficulty: 4.0 },
  math:      { floor:  5.0, ceiling:  90.0, difficulty: 3.5 },
  humaneval: { floor: 20.0, ceiling:  95.0, difficulty: 3.0 },
  gsm8k:     { floor:  5.0, ceiling:  98.0, difficulty: 2.5 },
  mmlu:      { floor: 25.0, ceiling:  92.0, difficulty: 2.5 },
  arc:       { floor: 25.0, ceiling:  96.0, difficulty: 2.0 },
  ifeval:    { floor: 30.0, ceiling:  95.0, difficulty: 2.0 },
};

// Per capability domain only the hardest available benchmark is used,
// preventing easy benchmarks from diluting harder ones in score computation.
const BENCHMARK_DOMAIN = {
  hle: 'reasoning', gpqa: 'reasoning', mmlu: 'reasoning', arc: 'reasoning',
  gaia: 'agentic',  gdpval: 'agentic',
  swebench: 'coding', humaneval: 'coding',
  math: 'math',     gsm8k: 'math',
  ifeval: 'instruction_following',
};

/**
 * Normalize a raw benchmark score to 0–100 using floor/ceiling calibration.
 * Returns null for unknown benchmarks or scraper outliers (> ceiling × 10).
 */
function normalizeBenchmarkScore(benchmarkKey, rawScore) {
  const cal = BENCHMARK_CALIBRATION[benchmarkKey];
  if (!cal || typeof rawScore !== 'number') return null;
  if (rawScore > cal.ceiling * 10) return null; // sanitize scraper outliers
  const clamped = Math.max(cal.floor, Math.min(cal.ceiling, rawScore));
  return (clamped - cal.floor) / (cal.ceiling - cal.floor) * 100;
}

/**
 * Keep only the highest-difficulty benchmark per capability domain.
 * e.g. if a model has both mmlu (diff 2.5) and gpqa (diff 4.5) for 'reasoning',
 * only gpqa is used — this prevents easy benchmarks from diluting harder ones.
 */
function deduplicateByCapabilityDomain(benchmarks) {
  const domainBest = {};
  for (const key of Object.keys(benchmarks)) {
    const domain = BENCHMARK_DOMAIN[key];
    if (!domain) continue;
    const diff = BENCHMARK_CALIBRATION[key]?.difficulty ?? 0;
    const prevDiff = BENCHMARK_CALIBRATION[domainBest[domain]]?.difficulty ?? 0;
    if (diff > prevDiff) domainBest[domain] = key;
  }
  const result = {};
  for (const key of Object.values(domainBest)) result[key] = benchmarks[key];
  return result;
}

/**
 * Return benchmark tier for a model based on its hardest available benchmark.
 * Tier 3 = frontier (diff ≥ 4.0): HLE, GPQA, SWE-bench, GAIA, GDPval
 * Tier 2 = hard     (diff ≥ 3.0): MATH, HumanEval
 * Tier 1 = standard (diff ≥ 2.5): GSM8K, MMLU
 * Tier 0 = weak / no data
 * Tier sorting ensures frontier models always rank above models with only easy benchmarks.
 */
function benchmarkTier(benchmarks) {
  if (!benchmarks) return 0;
  let maxDiff = 0;
  for (const key of Object.keys(benchmarks)) {
    const d = BENCHMARK_CALIBRATION[key]?.difficulty ?? 0;
    if (d > maxDiff) maxDiff = d;
  }
  return maxDiff >= 4.0 ? 3 : maxDiff >= 3.0 ? 2 : maxDiff >= 2.5 ? 1 : 0;
}

// ── Flagship model VRAM map (fp16 GB) ─────────────────────────
// For models whose names don't embed a size token — ensures they surface
// when the user has enough VRAM, regardless of download rank.
const FLAGSHIP_VRAM_FP16 = {
  // ── 700B+ MoE ─────────────────────────────────────────────────
  'zai-org/GLM-5':                              1700,  // ~700B MoE (282 shards); fp8 fits 8×H200
  // ── 600B+ ──────────────────────────────────────────────────────
  'deepseek-ai/DeepSeek-R1':                    1342,  // 671B dense
  'deepseek-ai/DeepSeek-V3':                    1342,
  'deepseek-ai/DeepSeek-V2.5':                  1342,
  'deepseek-ai/DeepSeek-V3.2':                  1342,  // ~671B, successor to V3
  'deepseek-ai/DeepSeek-V3.2-Speciale':         1342,
  // ── 400B ──────────────────────────────────────────────────────
  'meta-llama/Llama-3.1-405B-Instruct':          810,
  // ── 200-500B MoE ──────────────────────────────────────────────
  'zai-org/GLM-4.7':                             558,  // ~232B MoE (93 shards)
  'zai-org/GLM-4.7-Flash':                       290,  // ~120B MoE (48 shards)
  'Qwen/Qwen3-235B-A22B':                        470,  // all weights loaded; ~22B active
  'Qwen/Qwen3-Coder-Next':                       240,  // ~100B MoE (40 shards × ~5 GB)
  'mistralai/Mixtral-8x22B-Instruct-v0.1':       281,
  'databricks/dbrx-instruct':                    281,  // 132B MoE
  'mistralai/Mistral-Large-Instruct-2411':        250,  // 123B
  'mistralai/Mistral-Small-3.1-24B-Instruct-2503': 49, // 24B
  'WizardLMTeam/WizardLM-2-8x22B':              281,
  // ── 100B ──────────────────────────────────────────────────────
  'CohereForAI/c4ai-command-r-plus-08-2024':     210,  // 104B
  'CohereForAI/c4ai-command-a-03-2025':          210,  // 111B MoE
  'meta-llama/Llama-3.2-90B-Vision-Instruct':    181,
  // ── 70B ───────────────────────────────────────────────────────
  'meta-llama/Llama-3.3-70B-Instruct':           141,
  'meta-llama/Llama-3.1-70B-Instruct':           141,
  'meta-llama/Llama-3.2-11B-Vision-Instruct':     22,
  'deepseek-ai/DeepSeek-R1-Distill-Llama-70B':   141,
  'nvidia/Llama-3.1-Nemotron-70B-Instruct-HF':   141,
  'Qwen/Qwen2.5-72B-Instruct':                   145,
  '01-ai/Yi-1.5-34B-Chat':                        68,
  // ── 20-32B ────────────────────────────────────────────────────
  'Qwen/Qwen3-32B':                               65,
  'Qwen/Qwen3-30B-A3B':                           32,  // MoE: 30B total, 3B active
  'Qwen/Qwen2.5-32B-Instruct':                    65,
  'Qwen/Qwen2.5-Coder-32B-Instruct':              65,
  'Qwen/QwQ-32B':                                 65,
  'THUDM/GLM-4-32B-0414':                         65,
  'THUDM/GLM-Z1-32B-0414':                        65,
  'THUDM/GLM-Z1-Rumination-32B-0414':             65,
  'deepseek-ai/DeepSeek-R1-Distill-Qwen-32B':     65,
  'deepseek-ai/DeepSeek-Coder-V2-Instruct':      140,  // 236B MoE
  'internlm/internlm2_5-20b-chat':                41,
  'internlm/internlm3-8b-instruct':               16,
  'google/gemma-2-27b-it':                        55,
  'google/gemma-3-27b-it':                        55,
  'google/gemma-3-12b-it':                        24,
  'microsoft/Phi-4':                              16,
  'microsoft/phi-4-mini-instruct':                 8,  // 3.8B
  'nvidia/Llama-3.1-Nemotron-51B-Instruct':      102,
};

// Known parameter counts for models whose names don't embed a size token.
// Used to show correct paramLabel when safetensors metadata is missing.
const FLAGSHIP_PARAMS = {
  'deepseek-ai/DeepSeek-R1':                   671e9,
  'deepseek-ai/DeepSeek-V3':                   671e9,
  'deepseek-ai/DeepSeek-V2.5':                 236e9,
  'deepseek-ai/DeepSeek-V3.2':                 671e9,
  'deepseek-ai/DeepSeek-V3.2-Speciale':        671e9,
  'Qwen/Qwen3-Coder-Next':                     100e9,  // ~100B MoE (estimated)
  'mistralai/Mistral-Large-Instruct-2411':      123e9,
  'mistralai/Mistral-Small-3.1-24B-Instruct-2503': 24e9,
  'CohereForAI/c4ai-command-r-plus-08-2024':   104e9,
  'CohereForAI/c4ai-command-a-03-2025':        111e9,
  'nvidia/Llama-3.1-Nemotron-51B-Instruct':     51e9,
  'deepseek-ai/DeepSeek-Coder-V2-Instruct':    236e9,
  'databricks/dbrx-instruct':                  132e9,
  'zai-org/GLM-5':                             700e9,  // ~700B MoE
  'zai-org/GLM-4.7':                           232e9,  // ~232B MoE
  'zai-org/GLM-4.7-Flash':                     120e9,  // ~120B MoE
};

const USECASE_PIPELINES = {
  llm:    ['text-generation', 'text2text-generation'],
  image:  ['text-to-image', 'image-to-image'],
  audio:  ['automatic-speech-recognition', 'text-to-speech', 'audio-to-audio'],
  vision: ['image-classification', 'object-detection', 'image-segmentation', 'depth-estimation', 'image-to-text'],
  video:  ['text-to-video', 'video-classification'],
  embed:  ['feature-extraction', 'sentence-similarity'],
};

// ── Priority authors per use case ──────────────────────────────
// These orgs consistently release high-quality models. We do an
// author-targeted "newest" fetch for each so brand-new releases
// surface immediately — without waiting for downloads/likes to
// accumulate. Only orgs that respond correctly to HF's author= filter.
// Verified working with HF author= filter. Orgs that return 0 results
// (THUDM, CohereForAI, AI21Labs) are excluded — their flagship models
// are still surfaced via FLAGSHIP_VRAM_FP16 injection and BENCHMARK_DATA.
const PRIORITY_AUTHORS = {
  llm:    ['Qwen', 'deepseek-ai', 'meta-llama', 'mistralai', 'google',
           'microsoft', 'nvidia', 'internlm', 'EleutherAI', 'allenai',
           'tiiuae', 'NousResearch', '01-ai', 'baichuan-inc', 'open-thoughts',
           'HuggingFaceTB', 'bigcode', 'zai-org'],
  image:  ['black-forest-labs', 'stabilityai', 'ByteDance', 'Tencent-Hunyuan', 'shuttleai'],
  audio:  ['openai', 'speechbrain', 'facebook', 'suno-ai'],
  vision: ['google', 'microsoft', 'facebook', 'openai', 'Salesforce'],
  video:  ['Wan-AI', 'ByteDance', 'genmo', 'hpcai-tech'],
  embed:  ['BAAI', 'sentence-transformers', 'Alibaba-NLP', 'mixedbread-ai'],
};

// ── VRAM helpers ───────────────────────────────────────────────

/**
 * Extract parameter count (in units) from safetensors metadata.
 * HF returns: { parameters: { BF16: N }, total: N }
 * total is raw parameter count (not bytes).
 */
function paramsFromSafetensors(safetensors) {
  return safetensors?.total ?? null;
}

/**
 * Heuristic: parse "7B", "70B", "0.5B", "350M" etc. from model name/id.
 * Returns parameter count as a number, or null.
 */
function paramsFromName(name) {
  // Billions: 7B, 7b, 0.5B, 1.5B, 72B, 405B — must be preceded by non-alpha
  const bMatch = name.match(/(?:^|[-_.\s])(\d+(?:\.\d+)?)\s*[Bb](?:$|[-_.\s])/);
  if (bMatch) return parseFloat(bMatch[1]) * 1e9;

  // Millions: 350M, 125M
  const mMatch = name.match(/(?:^|[-_.\s])(\d+)\s*[Mm](?:$|[-_.\s])/);
  if (mMatch) return parseFloat(mMatch[1]) * 1e6;

  return null;
}

/**
 * Estimate total params from safetensors shard count.
 * HF caps shards at ~5 GB each; at 2 bytes/param (fp16/bf16) that's ~2.5B params/shard.
 * Used as a fallback when safetensors.total is missing (common for brand-new models).
 */
function paramsFromShards(siblings) {
  if (!siblings?.length) return null;
  const shards = siblings.filter(s => /\.safetensors$/.test(s.rfilename ?? ''));
  if (!shards.length) return null;
  return shards.length * 2.5e9; // ~2.5B params per 5 GB shard
}

function estimateVRAM(totalParams, quantization) {
  if (!totalParams) return null;
  const bytesPerParam = DTYPE_BYTES[quantization] ?? 2;
  const modelGB  = (totalParams * bytesPerParam) / 1e9;
  const overhead = Math.max(modelGB * 0.2, 0.5);
  return parseFloat((modelGB + overhead).toFixed(2));
}

/** Extract benchmark scores from a model card's model-index YAML block. */
function extractBenchmarks(cardData) {
  const modelIndex = cardData?.['model-index'];
  if (!modelIndex) return null;
  const results = {};
  const entries = Array.isArray(modelIndex) ? modelIndex : [modelIndex];
  for (const entry of entries) {
    for (const result of (entry.results ?? [])) {
      for (const metric of (result.metrics ?? [])) {
        const name = (metric.name ?? metric.type ?? '').toLowerCase();
        let val = typeof metric.value === 'number' ? metric.value : null;
        if (val === null) continue;
        if (val > 0 && val <= 1) val = parseFloat((val * 100).toFixed(1)); // normalise 0-1 → 0-100
        if (/\bmmlu\b/.test(name))                            results.mmlu         = val;
        else if (/humaneval|human_eval/.test(name))           results.humaneval    = val;
        else if (/\bmath\b/.test(name) && !/gsm/.test(name)) results.math         = val;
        else if (/gsm8k/.test(name))                          results.gsm8k        = val;
        else if (/arc.*(challenge|_c\b)/.test(name))          results.arc          = val;
        else if (/hellaswag/.test(name))                      results.hellaswag    = val;
        else if (/ifeval/.test(name))                         results.ifeval       = val;
        else if (/\bwer\b/.test(name))                        results.wer          = val;
        else if (/\bmteb\b/.test(name))                       results.mteb         = val;
        else if (/imagenet.*top.?1/.test(name))               results.imagenet_top1= val;
        else if (/clip.?score/.test(name))                    results.clip_score   = val;
      }
    }
  }
  return Object.keys(results).length ? results : null;
}

/**
 * Map ArtificialAnalysis metric names into one or more canonical benchmark keys.
 * Returns an array of benchmark keys (may be empty).
 */
function aaMetricNameToBenchKeys(name) {
  if (!name) return [];
  const n = name.toString().toLowerCase();
  const out = new Set();

  // Frontier / hard benchmarks
  if (n.includes('hle') || n.includes("humanity's last") || n.includes('humanity')) out.add('hle');
  if (n.includes('gpqa')) out.add('gpqa');
  if (n.includes('swebench') || n.includes('terminal-bench')) out.add('swebench');
  if (n.includes('gaia')) out.add('gaia');

  // GDPval-AA: agentic ELO benchmark (difficulty 4.0) — maps to 'gdpval', NOT 'mmlu'
  // Previously misclassified as mmlu (wrong domain and scale).
  if (n.includes('gdpval')) out.add('gdpval');

  // Medium benchmarks
  if (n.includes('mmlu')) out.add('mmlu');
  // AA-Omniscience Non-Hallucination Rate is an inverted metric — intentionally excluded
  // to avoid inflating mmlu/gpqa scores with hallucination rate data.
  if (n.includes('humaneval') || n.includes('human_eval')) out.add('humaneval');
  if (n.includes('scicode')) out.add('humaneval');
  // Only map generic 'coding'/'code' when it's the sole label (not a substring of model names)
  if (/^(coding|code)(\s|$)/.test(n)) out.add('humaneval');
  if (n.includes('math') && !n.includes('gsm') && !n.includes('gdp')) out.add('math');
  if (n.includes('critpt') || n.includes('physics')) out.add('math');
  if (n.includes('gsm8k') || (n.includes('gsm') && !n.includes('gdp'))) out.add('gsm8k');
  if (n.includes('arc')) out.add('arc');
  if (n.includes('ifeval') || n.includes('ifbench')) out.add('ifeval');

  // tau2-bench Telecom is a telecom-domain tool-use benchmark — NOT a coding/swebench eval.
  // Previously mapped to swebench causing contamination; intentionally excluded now.

  // Non-LLM benchmarks
  if (n.includes('wer')) out.add('wer');
  if (n.includes('imagenet')) out.add('imagenet_top1');
  if (n.includes('clip')) out.add('clip_score');
  if (n.includes('mteb')) out.add('mteb');

  return Array.from(out);
}

/**
 * Compute a normalized overall quality score (0–100) for a model.
 *
 * For LLMs: normalizes each benchmark to 0–100 relative to known frontier performance,
 * deduplicates by capability domain (keeps hardest per domain), then computes a
 * difficulty²-weighted average so harder benchmarks dominate the score.
 *
 * A model with 30% on HLE (frontier ceiling 35.4%) will rank far above one with
 * 90% on MMLU (frontier ceiling 92%), because HLE normalized ≈ 84 vs MMLU ≈ 57,
 * and HLE carries 25× more weight than MMLU (5²=25 vs 2.5²=6.25).
 *
 * Non-LLM usecases retain the original single-metric logic (unchanged).
 */
function computeOverallScore(benchmarks, usecase) {
  if (!benchmarks) return null;

  // Non-LLM usecases: keep original single-metric logic unchanged
  if (usecase !== 'llm') {
    const primary = { embed: 'mteb', vision: 'imagenet_top1', image: 'image_quality', audio: 'wer' };
    const pk = primary[usecase];
    if (!pk || benchmarks[pk] == null) return null;
    return usecase === 'audio' ? 100 - benchmarks[pk] : benchmarks[pk];
  }

  // Deduplicate: keep only the hardest benchmark per capability domain
  const deduped = deduplicateByCapabilityDomain(benchmarks);

  let weightedSum = 0, totalWeight = 0, hasMinDifficulty = false;
  for (const [key, rawScore] of Object.entries(deduped)) {
    const cal = BENCHMARK_CALIBRATION[key];
    if (!cal) continue;
    const normalized = normalizeBenchmarkScore(key, rawScore);
    if (normalized === null) continue;
    const weight = cal.difficulty * cal.difficulty; // difficulty² weighting
    weightedSum += normalized * weight;
    totalWeight += weight;
    if (cal.difficulty >= 2.5) hasMinDifficulty = true;
  }

  // Require at least one benchmark with difficulty ≥ 2.5 for a meaningful score
  if (!hasMinDifficulty || totalWeight === 0) return null;
  return parseFloat((weightedSum / totalWeight).toFixed(1));
}

function paramLabel(total) {
  if (!total) return null;
  const b = total / 1e9;
  if (b >= 1) return `${b >= 10 ? b.toFixed(0) : b.toFixed(1)}B`;
  const m = total / 1e6;
  if (m >= 1) return `${m.toFixed(0)}M`;
  return `${total}`;
}

// ── Concurrency-limited batch fetch of individual model details ─
async function batchFetchDetails(modelIds, concurrency = 8) {
  const results = {};
  const queue = [...modelIds];

  async function worker() {
    while (queue.length) {
      const id = queue.shift();
      try {
        const { data } = await axios.get(`https://huggingface.co/api/models/${id}`, {
          timeout: 8000,
          headers: { 'User-Agent': 'gpu-model-finder/1.0' },
        });
        results[id] = data;
      } catch {
        // silently skip failed fetches
      }
    }
  }

  await Promise.all(Array.from({ length: concurrency }, worker));
  return results;
}

// ── API route ──────────────────────────────────────────────────
app.get('/api/models', async (req, res) => {
  const {
    vram         = '8',
    usecase      = 'llm',
    quantization = 'fp16',
    sort         = 'downloads',
    limit        = '24',
  } = req.query;

  const vramGB     = parseFloat(vram);
  const maxResults = Math.min(parseInt(limit), 150);

  const cacheKey = `${vram}-${usecase}-${quantization}-${sort}-${limit}`;
  const cached   = cache.get(cacheKey);
  if (cached) {
    console.log(`[cache hit] ${cacheKey}`);
    return res.json(cached);
  }

  const pipelines = USECASE_PIPELINES[usecase] ?? USECASE_PIPELINES.llm;

  try {
    // 1. Fetch model lists.
    //
    //    Global fetches (per pipeline, 60 models each):
    //      • downloads — established, battle-tested models
    //      • likes     — community-favourite gems
    //    The global "lastModified" sort is NOT used: it returns thousands of
    //    zero-download community fine-tunes and never surfaces quality new
    //    releases from major labs.
    //
    //    Author-targeted fetches (per priority org, 15 models each):
    //      • newest from each org — directly captures brand-new releases
    //        (e.g. Qwen3-Coder-Next, DeepSeek-V3.2) the moment they appear,
    //        before they accumulate downloads.
    const fetchPipeline = (pipeline, sortBy, extraParams = {}) =>
      axios.get('https://huggingface.co/api/models', {
        params: { filter: pipeline, sort: sortBy, direction: -1, limit: 60, full: true, ...extraParams },
        timeout: 12000,
        headers: { 'User-Agent': 'gpu-model-finder/1.0' },
      }).then(r => r.data).catch(err => {
        console.warn(`Failed "${pipeline}" (${sortBy}):`, err.message);
        return [];
      });

    const fetchAuthor = (author, pipeline, sortBy) =>
      axios.get('https://huggingface.co/api/models', {
        params: { author, filter: pipeline, sort: sortBy, direction: -1, limit: 15, full: true },
        timeout: 10000,
        headers: { 'User-Agent': 'gpu-model-finder/1.0' },
      }).then(r => r.data).catch(() => []);  // silently skip if org doesn't support author= filter

    const priorityAuthors = PRIORITY_AUTHORS[usecase] ?? [];

    const listResults = await Promise.all([
      // Global: popular + liked
      ...pipelines.flatMap(pipeline => [
        fetchPipeline(pipeline, 'downloads'),
        fetchPipeline(pipeline, 'likes'),
      ]),
      // Author-targeted: newest releases from quality labs (primary pipeline only)
      ...priorityAuthors.map(author => fetchAuthor(author, pipelines[0], 'lastModified')),
    ]);

    // De-duplicate (preserve first occurrence, which comes from the downloads sort)
    const seen = new Set();
    const allModels = listResults.flat().filter(m => {
      if (seen.has(m.id)) return false;
      seen.add(m.id);
      return true;
    });

    // 1b. Inject flagship models that fit the VRAM budget but weren't returned by HF.
    //     This guarantees large, important models surface when the user has the hardware,
    //     rather than being hidden behind thousands of smaller, higher-download models.
    const quantScale = (DTYPE_BYTES[quantization] ?? 2) / 2; // scale relative to fp16
    const flagshipStubs = Object.entries(FLAGSHIP_VRAM_FP16)
      .filter(([id, vramFp16]) => !seen.has(id) && vramFp16 * quantScale <= vramGB)
      .map(([id]) => {
        seen.add(id);
        return {
          id,
          pipeline_tag: pipelines[0],
          downloads: 0, likes: 0,
          lastModified: new Date().toISOString(),
          tags: [], gated: false,
        };
      });

    // 2. First pass: estimate VRAM.
    //    For flagships with a curated fp16 VRAM value, use that directly (scales with quant).
    //    The heuristic adds 20% overhead which can push 70B models just over tight budgets.
    const candidates = [...allModels, ...flagshipStubs].map(m => {
      const curatedFp16 = FLAGSHIP_VRAM_FP16[m.id];
      if (curatedFp16 !== undefined) {
        const estimatedVRAM = parseFloat((curatedFp16 * quantScale).toFixed(2));
        const knownParams = FLAGSHIP_PARAMS[m.id] ?? paramsFromName(m.id);
        // curatedVRAM=true prevents batchFetchDetails from overwriting this value
        return { raw: m, totalParams: knownParams, estimatedVRAM, curatedVRAM: true };
      }
      const nameParams = paramsFromName(m.id);
      return {
        raw: m,
        totalParams: nameParams,
        estimatedVRAM: estimateVRAM(nameParams, quantization),
        curatedVRAM: false,
      };
    });

    // 3. Identify models where the name heuristic gave no result —
    //    fetch their individual details to get safetensors param count.
    //    Limit to top 40 by downloads to keep response time reasonable.
    const needsDetail = candidates
      .filter(c => c.totalParams === null)
      .sort((a, b) => (b.raw.downloads ?? 0) - (a.raw.downloads ?? 0))
      .slice(0, 60)
      .map(c => c.raw.id);

    let details = {};
    if (needsDetail.length) {
      console.log(`[detail fetch] ${needsDetail.length} models`);
      details = await batchFetchDetails(needsDetail, 8);
    }

    // No AA over-budget allowlist: strictly enforce VRAM budget here.

    // 4. Merge detail data, build final model objects
    let processed = candidates
      .map(({ raw: m, totalParams: nameParams, estimatedVRAM: nameVRAM, curatedVRAM }) => {
        let totalParams = nameParams;
        let estimatedVRAM = nameVRAM;

        let approxParams = false;
        if (!totalParams && details[m.id]) {
          const detailed = details[m.id];
          // Prefer exact safetensors count; fall back to shard-count heuristic for
          // brand-new models where HF hasn't yet computed the metadata (e.g. Qwen3-Coder-Next).
          const exact = paramsFromSafetensors(detailed.safetensors)
                     ?? FLAGSHIP_PARAMS[m.id];
          if (exact) {
            totalParams = exact;
          } else {
            totalParams = paramsFromShards(detailed.siblings);
            approxParams = !!totalParams;
          }
          // Only update estimatedVRAM if it wasn't set from the curated FLAGSHIP map.
          // Without this guard, shard-count heuristics overwrite the precise curated value.
          if (!curatedVRAM) estimatedVRAM = estimateVRAM(totalParams, quantization);
        }

        // Merge benchmark data: hardcoded lookup + model-card extraction
        const bmLookup = BENCHMARK_DATA[m.id] ?? {};
        const bmCard   = extractBenchmarks(details[m.id]?.cardData) ?? {};
        // Build benchmarks along with provenance (hf vs aa)
        const benchmarks = {};
        const benchmarks_source = {};
        for (const [k,v] of Object.entries(bmLookup)) { if (typeof v === 'number') { benchmarks[k]=v; benchmarks_source[k]={ source: 'hf', url: `https://huggingface.co/${m.id}` }; } }
        for (const [k,v] of Object.entries(bmCard))   { if (typeof v === 'number') { benchmarks[k]=v; benchmarks_source[k]={ source: 'hf', url: `https://huggingface.co/${m.id}` }; } }
        const hasBench = Object.keys(benchmarks).length > 0;

        const overallScore = computeOverallScore(hasBench ? benchmarks : null, usecase);

        return {
          id:           m.id,
          name:         m.id.split('/').pop(),
          author:       m.id.split('/')[0],
          task:         PIPELINE_LABELS[m.pipeline_tag] ?? m.pipeline_tag,
          pipeline:     m.pipeline_tag,
          downloads:    m.downloads ?? 0,
          likes:        m.likes ?? 0,
          lastModified: m.lastModified,
          estimatedVRAM,
          paramLabel:   approxParams ? `~${paramLabel(totalParams)}` : paramLabel(totalParams),
          benchmarks: hasBench ? benchmarks : null,
          benchmarks_source: hasBench ? benchmarks_source : null,
          _hfBenchmarks: hasBench ? { ...benchmarks } : null,
          overallScore,
          tags: (m.tags ?? [])
            .filter(t => !t.startsWith('arxiv:') && !t.startsWith('base_model:') &&
                         !t.startsWith('region:') && !t.startsWith('deploy:') && t.length < 40)
            .slice(0, 8),
          license: (m.tags ?? []).find(t => t.startsWith('license:'))?.slice('license:'.length) ?? null,
          url:   `https://huggingface.co/${m.id}`,
          gated: m.gated ?? false,
        };
      })

      // Keep models that fit (or have unknown VRAM). If `includeAAOverBudget` is
      // enabled, also keep HF models that were matched to ArtificialAnalysis
      // pages (they are added to `aaAllowIds` above).
      .filter(m => m.estimatedVRAM === null || m.estimatedVRAM <= vramGB);

      // Attach ArtificialAnalysis metrics when available (match by slug/title/url)
      // `aaList` is declared here so later sections (AA-only injection) can reuse it.
      let aaList = [];
      try {
        const aaPath = path.join(__dirname, 'data', 'models_artificialanalysis.json');
        if (fs.existsSync(aaPath)) {
          const aaRaw = fs.readFileSync(aaPath, 'utf8');
          const aaObj = JSON.parse(aaRaw || '{}');
          aaList = Array.isArray(aaObj.models) ? aaObj.models : (Array.isArray(aaObj) ? aaObj : []);

          const aaBySlug = new Map();
          const aaByNormTitle = new Map();
          function aaSlugFromUrl(u) {
            try { const p = new URL(u).pathname.split('/').filter(Boolean); const idx = p.indexOf('models'); if (idx >= 0 && p.length > idx+1) return p[idx+1].toString().toLowerCase(); return p[p.length-1]?.toString().toLowerCase() || '';} catch(e){ return '' }
          }
          function normTitle(s) { return (s||'').toString().toLowerCase().replace(/\(.*?\)/g,'').replace(/[^a-z0-9]+/g,' ').trim(); }

          for (const a of aaList) {
            const slug = aaSlugFromUrl(a.url || '');
            if (slug) aaBySlug.set(slug, a);
            const nt = normTitle(a.title || a.url || '');
            if (nt) aaByNormTitle.set(nt, a);
          }
          // Build additional canonical keys for more robust matching
          const aaByCanonical = new Map();
          function canonicalKey(s) { return (s||'').toString().toLowerCase().replace(/[^a-z0-9]/g,''); }
          for (const a of aaList) {
            const slug = aaSlugFromUrl(a.url || '');
            if (slug) {
              aaBySlug.set(slug, a);
              aaByCanonical.set(canonicalKey(slug), a);
            }
            const nt = normTitle(a.title || a.url || '');
            if (nt) {
              aaByNormTitle.set(nt, a);
              aaByCanonical.set(canonicalKey(nt), a);
            }
            // also index raw title key
            if (a.title) aaByCanonical.set(canonicalKey(a.title), a);
          }

          for (const m of processed) {
            try {
              const hfSlug = (m.id || '').toString().split('/').pop().toLowerCase();
              let found = null;

              // 1) exact slug match
              if (hfSlug && aaBySlug.has(hfSlug)) found = aaBySlug.get(hfSlug);

              // 2) canonicalized id/title match (removes punctuation)
              if (!found) {
                const hfCanon = canonicalKey(hfSlug || m.name || m.id || '');
                if (hfCanon && aaByCanonical.has(hfCanon)) found = aaByCanonical.get(hfCanon);
              }

              // 3) normalized title exact match
              if (!found) {
                const n = normTitle(m.name || m.id || m.url || '');
                if (n && aaByNormTitle.has(n)) found = aaByNormTitle.get(n);
              }

              // 4) substring matches between normalized forms
              if (!found) {
                const n = normTitle(m.name || m.id || '');
                for (const [k,a] of aaByNormTitle.entries()) {
                  if (!k || !n) continue;
                  if (k.includes(n) || n.includes(k) || k.replace(/\s+/g,'').includes(n.replace(/\s+/g,'')) || n.replace(/\s+/g,'').includes(k.replace(/\s+/g,''))) {
                    found = a; break;
                  }
                }
              }

              // 5) last-resort: if HF id contains the AA slug as substring
              if (!found) {
                for (const [s,a] of aaBySlug.entries()) {
                  if (s && (m.id || '').toLowerCase().includes(s)) { found = a; break; }
                }
              }

              if (found) {
                m.artificialAnalysis = m.artificialAnalysis || {};
                m.artificialAnalysis.url = found.url;
                // Normalize metrics shape: prefer intelligence object when present
                const intel = found.metrics?.intelligence ?? (typeof found.metrics === 'object' ? found.metrics : null);
                m.artificialAnalysis.metrics = intel ? { intelligence: intel } : (found.metrics || null);
                m.artificialAnalysis.title = found.title || null;
                // Map AA metric names into canonical benchmark keys and merge into
                // the model's `benchmarks` so HF+AA metrics are available uniformly.
                try {
                  // Use shared mapping helper
                  const aaToBenchKeys = aaMetricNameToBenchKeys;

                  const aaMetricsObj = intel;
                  if (aaMetricsObj && typeof aaMetricsObj === 'object') {
                    m.benchmarks = m.benchmarks || {};
                    m.benchmarks_source = m.benchmarks_source || {};
                    for (const [k,v] of Object.entries(aaMetricsObj)) {
                      if (typeof v !== 'number') continue;
                      const bks = aaToBenchKeys(k);
                      if (!bks || !bks.length) continue;
                      for (const bk of bks) {
                          // Prefer AA over HF; if multiple AA metrics map to the same
                          // canonical key, keep the strongest (max) AA signal.
                          const prev = m.benchmarks[bk];
                          const prevSrc = m.benchmarks_source[bk]?.source;
                          if (prev == null) {
                            m.benchmarks[bk] = v;
                            m.benchmarks_source[bk] = { source: 'aa', url: found.url };
                          } else if (prevSrc === 'aa') {
                            m.benchmarks[bk] = Math.max(prev, v);
                            // keep existing AA url (could be same or different); prefer existing
                          } else {
                            // prev was 'hf' — only override if AA score is higher.
                            // This prevents AA from replacing a good BENCHMARK_DATA score
                            // (e.g. humaneval=83%) with a lower hard-benchmark score
                            // (e.g. swebench=2%), which would collapse the domain score.
                            if (v > prev) {
                              m.benchmarks[bk] = v;
                              m.benchmarks_source[bk] = { source: 'aa', url: found.url };
                            }
                          }
                        }
                    }
                    // Recompute overallScore if we added any benchmarks
                    try {
                      m.overallScore = computeOverallScore(m.benchmarks, usecase);
                    } catch (e) { /* ignore */ }
                  }
                } catch (e) { /* ignore mapping errors */ }
              }
            } catch (e) { /* ignore per-model match failures */ }
          }
        }
      } catch (e) {
        console.warn('Failed to attach ArtificialAnalysis metrics:', e.message || e);
      }

      // Compute per-model task scores from benchmarks (AA + HF) and prioritize AA-enabled models for the requested usecase.
      const BENCHMARK_TASK_MAP = [
        // map substrings -> tasks (benchmarks can belong to multiple tasks)
        ['agentic', ['agentic']],
        ['agentic real', ['agentic']],
        ['gdpval', ['agentic']],
        ['terminal-bench', ['coding','agentic']],
        ['𝜏²-bench', ['agentic','telecom']],
        ['tau2-bench', ['agentic','telecom']],
        ['aa-lcr', ['long_context','reasoning']],
        ['lcr', ['long_context','reasoning']],
        ['omniscience', ['knowledge']],
        ['gpqa', ['reasoning','scientific']],
        ['gpqa diamond', ['reasoning','scientific']],
        ['scicode', ['coding']],
        ['ifbench', ['instruction_following']],
        ['critpt', ['physics','reasoning']],
        ['mmmu', ['vision']],
        ['mmlu', ['reasoning']],
        ['humaneval', ['coding']],
        ['math', ['reasoning']],
        ['gsm8k', ['math','reasoning']],
        ['wer', ['speech','audio']],
        ['imagenet', ['vision']],
        ['clip', ['vision']],
        ['instruction', ['instruction_following']],
        ['coding', ['coding','reasoning']],
        ['code', ['coding']],
      ];

      function canonicalTasksForKey(k) {
        if (!k) return [];
        const key = k.toString().toLowerCase();
        const tasks = new Set();
        for (const [sub, tlist] of BENCHMARK_TASK_MAP) if (key.includes(sub)) tlist.forEach(t=>tasks.add(t));
        return Array.from(tasks);
      }

      function avgScoreForUsecase(metricsObj, usecaseTasks) {
        if (metricsObj == null) return null;
        // If AA provided a single numeric intelligence score, use it as-is
        if (typeof metricsObj === 'number') return metricsObj;
        if (typeof metricsObj.intelligence === 'number') return metricsObj.intelligence;

        const entries = Object.entries(metricsObj).filter(([k,v]) => typeof v === 'number');
        if (!entries.length) return null;
        let total = 0, count = 0;
        for (const [k,v] of entries) {
          const tasks = canonicalTasksForKey(k);
          // weight metric if it matches the requested tasks
          const weight = tasks.some(t => usecaseTasks.includes(t)) ? 1.0 : 0.0;
          if (weight > 0) { total += v * weight; count += weight; }
        }
        if (count === 0) return null;
        return total / count;
      }

      // Usecase -> relevant canonical tasks
      const USECASE_TASKS = {
        llm: ['reasoning','coding','instruction_following','long_context','knowledge','agentic','scientific'],
        image: ['vision'],
        audio: ['audio','speech'],
        vision: ['vision'],
        video: ['vision'],
        embed: ['instruction_following','reasoning'],
      };
      // Allow explicit `task` query to focus ranking on a single canonical task
      const taskParam = (req.query.task || '').toString().toLowerCase();
      const usecaseTasks = taskParam ? [taskParam] : (USECASE_TASKS[usecase] || USECASE_TASKS.llm);

      // Compute normalized task score from a canonical benchmark object.
      // Uses the same difficulty²-weighted normalization as computeOverallScore,
      // but filtered to benchmarks relevant to the requested usecase tasks.
      function computeNormalizedTaskScore(benchmarksObj) {
        if (!benchmarksObj || !Object.keys(benchmarksObj).length) return null;
        const deduped = deduplicateByCapabilityDomain(benchmarksObj);
        let wSum = 0, wTotal = 0, hasMin = false;
        for (const [key, rawScore] of Object.entries(deduped)) {
          const cal = BENCHMARK_CALIBRATION[key];
          if (!cal) continue;
          const tasks = canonicalTasksForKey(key);
          if (!tasks.some(t => usecaseTasks.includes(t))) continue;
          const norm = normalizeBenchmarkScore(key, rawScore);
          if (norm === null) continue;
          const w = cal.difficulty * cal.difficulty;
          wSum += norm * w; wTotal += w;
          if (cal.difficulty >= 2.5) hasMin = true;
        }
        if (!hasMin || wTotal === 0) return null;
        return wSum / wTotal;
      }

      // Annotate processed models with normalized task scores and benchmark tier
      processed.forEach(m => {
        try {
          const allBenchmarks = m.benchmarks || {};
          // Single unified task score from ALL available benchmarks (BENCHMARK_DATA + AA merged).
          // Previously aaTaskScore was gated on AA presence, causing every AA-listed model
          // to sort above every BENCHMARK_DATA-only model regardless of actual quality.
          // Collapsed to one score so ranking is purely benchmark-quality driven.
          m.taskScore    = computeNormalizedTaskScore(allBenchmarks);
          m.aaTaskScore  = m.taskScore; // alias kept for frontend compatibility
          m.hfTaskScore  = null;
          m.hasAAmetrics = !!m.artificialAnalysis?.metrics;
          m.benchmarkTier = benchmarkTier(allBenchmarks);
        } catch (e) {
          m.taskScore = null; m.aaTaskScore = null; m.hfTaskScore = null; m.hasAAmetrics = false; m.benchmarkTier = 0;
        }
      });

      // Include AA-only models (those present in AA dataset but not matched to HF)
      try {
        const matchedAAUrls = new Set(processed.filter(m => m.artificialAnalysis?.url).map(m => m.artificialAnalysis.url));
        const aaOnlyToAdd = [];

        const aaMetricToBenchKey = aaMetricNameToBenchKeys;

        for (const a of aaList) {
          if (!a || !a.url) continue;
          if (matchedAAUrls.has(a.url)) continue;
          // build model-like object
          const slug = (() => { try { const p = new URL(a.url).pathname.split('/').filter(Boolean); const idx = p.indexOf('models'); if (idx>=0 && p.length>idx+1) return p[idx+1]; return p[p.length-1]; } catch(e){ return null } })();
          const id = `artificialanalysis/${(slug||(a.title||'unnamed')).toString().toLowerCase().replace(/[^a-z0-9-_]/g,'-')}`;
          const name = (a.title || slug || id).toString().split(' - ')[0];
          const benchmarks = {};
          const benchmarks_source = {};
          const cardIntel = a.metrics?.intelligence ?? (typeof a.metrics === 'object' ? a.metrics : null);
          if (cardIntel && typeof cardIntel === 'object') {
            for (const [k,v] of Object.entries(cardIntel)) {
              const bks = aaMetricToBenchKey(k);
              if (!bks || !bks.length) continue;
              for (const bk of bks) if (typeof v === 'number') {
                const prev = benchmarks[bk];
                if (prev == null) {
                  benchmarks[bk] = v;
                  benchmarks_source[bk] = { source: 'aa', url: a.url };
                } else {
                  // if multiple AA metrics map to same canonical key, keep max
                  benchmarks[bk] = Math.max(prev, v);
                  // preserve benchmarks_source[bk] (same AA page)
                }
              }
            }
          }

            const modelStub = {
            id,
            name,
            author: 'ArtificialAnalysis',
            task: PIPELINE_LABELS[pipelines[0]] || pipelines[0],
            pipeline: pipelines[0],
            downloads: 0,
            likes: 0,
            lastModified: a.fetchedAt || new Date().toISOString(),
            estimatedVRAM: null,
            paramLabel: null,
            benchmarks: Object.keys(benchmarks).length ? benchmarks : null,
            benchmarks_source: Object.keys(benchmarks).length ? benchmarks_source : null,
            overallScore: computeOverallScore(Object.keys(benchmarks).length ? benchmarks : null, usecase),
            tags: ['artificialanalysis'],
            license: null,
            url: a.url,
            gated: false,
            artificialAnalysis: { url: a.url, metrics: a.metrics, title: a.title },
          };

          modelStub.taskScore    = computeNormalizedTaskScore(modelStub.benchmarks || {});
          modelStub.aaTaskScore  = modelStub.taskScore;
          modelStub.hfTaskScore  = null;
          modelStub.hasAAmetrics = true;
          modelStub.benchmarkTier = benchmarkTier(modelStub.benchmarks || {});

          aaOnlyToAdd.push(modelStub);
        }

        // append AA-only models so they participate in sorting and rendering
        if (aaOnlyToAdd.length) processed.push(...aaOnlyToAdd);
      } catch (e) {
        console.warn('Failed to inject AA-only models:', e.message || e);
      }

      // Enforce: only return open-source models. Exclude gated models and
      // any entries without an allowed open-source license.
      function isOpenSourceModel(m) {
        if (m.gated) return false;
        if (m.license && typeof m.license === 'string') {
          const l = m.license.toLowerCase();
          const allow = ['apache', 'mit', 'bsd', 'lgpl', 'gpl', 'mpl', 'epl', 'cc-by', 'cc0', 'unlicense', 'agpl'];
          for (const a of allow) if (l.includes(a)) return true;
        }
        return false;
      }

      processed = processed.filter(isOpenSourceModel);

      // Sort AFTER all enrichment is done (AA merge + task-score annotation).
      // Previously sort ran before annotation, so taskScore/benchmarkTier were
      // always undefined at sort time — effective sort was just overallScore → downloads.
      processed.sort((a, b) => {
        const aK = a.estimatedVRAM !== null;
        const bK = b.estimatedVRAM !== null;
        if (aK !== bK) return aK ? -1 : 1;

        // Unified task score — difficulty²-weighted, benchmark-quality driven.
        const aTS = typeof a.taskScore === 'number' ? a.taskScore : null;
        const bTS = typeof b.taskScore === 'number' ? b.taskScore : null;
        if (aTS !== null && bTS === null) return -1;
        if (aTS === null && bTS !== null) return 1;
        if (aTS !== null && bTS !== null) {
          const diff = bTS - aTS;
          if (Math.abs(diff) > 0.5) return diff;
        }

        // Benchmark tier: frontier models rank above models with only easy benchmarks.
        const aTier = a.benchmarkTier ?? 0;
        const bTier = b.benchmarkTier ?? 0;
        if (bTier !== aTier) return bTier - aTier;

        // Overall score fallback for models without task-aligned benchmarks.
        const aS = a.overallScore;
        const bS = b.overallScore;
        if (aS !== null && bS === null) return -1;
        if (aS === null && bS !== null) return 1;
        if (aS !== null && bS !== null) {
          const diff = bS - aS;
          if (Math.abs(diff) > 1.5) return diff;
        }

        // Size preference: only for very large VRAM budgets (>200 GB).
        if (aK && bK && vramGB > 200) {
          const diff = b.estimatedVRAM - a.estimatedVRAM;
          if (Math.abs(diff) > 20) return diff;
        }

        // Fallback: user's preferred sort signal
        if (sort === 'likes')  return b.likes - a.likes;
        if (sort === 'newest') return new Date(b.lastModified) - new Date(a.lastModified);
        return b.downloads - a.downloads;
      });
      processed = processed.slice(0, maxResults);

    // Remove internal preserved HF benchmarks before returning
    processed.forEach(m => { if (m && m._hfBenchmarks) delete m._hfBenchmarks; });

    const response = {
      models: processed,
      total:  processed.length,
      filters: { vramGB, usecase, quantization, sort },
    };

    cache.set(cacheKey, response);
    res.json(response);

  } catch (err) {
    console.error('Error:', err.message);
    res.status(500).json({ error: 'Failed to fetch model data', details: err.message });
  }
});

// API: Search models from artificialanalysis data (committed by GitHub Action)
app.get('/api/search', (req, res) => {
  const q = (req.query.name || '').trim().toLowerCase();
  if (!q) return res.status(400).json({ error: 'Missing query param: name' });

  const dataPath = path.join(__dirname, 'data', 'models_artificialanalysis.json');
  if (!fs.existsSync(dataPath)) return res.status(404).json({ error: 'Model data not available' });

  try {
    const raw = fs.readFileSync(dataPath, 'utf8');
    const obj = JSON.parse(raw);
    const models = Array.isArray(obj.models) ? obj.models : (Array.isArray(obj) ? obj : []);
    const results = models.filter(m => {
      const name = (m.name || m.model || m.id || m.title || '').toString().toLowerCase();
      return name.includes(q);
    }).slice(0, 100);
    res.json({ total: results.length, results });
  } catch (e) {
    res.status(500).json({ error: 'Failed to read model data', details: e.message });
  }
});

// ── Reference GPUs for model landing pages ─────────────────────
// 10 popular GPUs used to show TPS estimates on /models/:slug pages
const FEATURED_GPUS = [
  { name: 'RTX 4060',       tier: 'consumer', vram: 8,   bw: 272  },
  { name: 'RTX 4070',       tier: 'consumer', vram: 12,  bw: 504  },
  { name: 'RTX 4090',       tier: 'consumer', vram: 24,  bw: 1008 },
  { name: 'RTX 3090',       tier: 'consumer', vram: 24,  bw: 936  },
  { name: 'M3 Max 128G',    tier: 'apple',    vram: 128, bw: 400  },
  { name: 'M4 Ultra 192G',  tier: 'apple',    vram: 192, bw: 819  },
  { name: 'RTX 6000 Ada',   tier: 'workstation', vram: 48, bw: 960 },
  { name: 'A100 40G',       tier: 'datacenter', vram: 40, bw: 1600 },
  { name: 'A100 80G',       tier: 'datacenter', vram: 80, bw: 2000 },
  { name: 'H100 SXM',       tier: 'datacenter', vram: 80, bw: 3350 },
];

// ── All GPUs with approximate retail prices (for reverse search) ─
// Prices are approximate retail/street estimates in USD as of 2025.
// Multi-GPU configs add price * count.
const ALL_GPUS = [
  // 50-series
  { name: 'RTX 5090',    tier: '50-series',  vram: 32,  bw: 1792, price: 2000 },
  { name: 'RTX 5080',    tier: '50-series',  vram: 16,  bw: 960,  price: 1200 },
  { name: 'RTX 5070 Ti', tier: '50-series',  vram: 16,  bw: 896,  price: 800  },
  { name: 'RTX 5070',    tier: '50-series',  vram: 12,  bw: 672,  price: 600  },
  { name: 'RTX 5060 Ti', tier: '50-series',  vram: 16,  bw: 448,  price: 450  },
  // 40-series
  { name: 'RTX 4090',         tier: '40-series',  vram: 24, bw: 1008, price: 1800 },
  { name: 'RTX 4080 Super',   tier: '40-series',  vram: 16, bw: 736,  price: 1000 },
  { name: 'RTX 4080',         tier: '40-series',  vram: 16, bw: 717,  price: 900  },
  { name: 'RTX 4070 Ti Super',tier: '40-series',  vram: 16, bw: 672,  price: 800  },
  { name: 'RTX 4070 Ti',      tier: '40-series',  vram: 12, bw: 504,  price: 750  },
  { name: 'RTX 4070 Super',   tier: '40-series',  vram: 12, bw: 504,  price: 600  },
  { name: 'RTX 4070',         tier: '40-series',  vram: 12, bw: 504,  price: 550  },
  { name: 'RTX 4060 Ti 16G',  tier: '40-series',  vram: 16, bw: 288,  price: 450  },
  { name: 'RTX 4060 Ti',      tier: '40-series',  vram: 8,  bw: 288,  price: 400  },
  { name: 'RTX 4060',         tier: '40-series',  vram: 8,  bw: 272,  price: 300  },
  // 30-series
  { name: 'RTX 3090 Ti', tier: '30-series',  vram: 24, bw: 1008, price: 800  },
  { name: 'RTX 3090',    tier: '30-series',  vram: 24, bw: 936,  price: 700  },
  { name: 'RTX 3080 Ti', tier: '30-series',  vram: 12, bw: 912,  price: 500  },
  { name: 'RTX 3080 12G',tier: '30-series',  vram: 12, bw: 912,  price: 450  },
  { name: 'RTX 3080',    tier: '30-series',  vram: 10, bw: 760,  price: 400  },
  { name: 'RTX 3070 Ti', tier: '30-series',  vram: 8,  bw: 608,  price: 300  },
  { name: 'RTX 3070',    tier: '30-series',  vram: 8,  bw: 448,  price: 250  },
  { name: 'RTX 3060 Ti', tier: '30-series',  vram: 8,  bw: 448,  price: 230  },
  { name: 'RTX 3060',    tier: '30-series',  vram: 12, bw: 360,  price: 200  },
  // AMD
  { name: 'RX 9070 XT',  tier: 'amd',        vram: 16, bw: 640,  price: 600  },
  { name: 'RX 9070',     tier: 'amd',        vram: 16, bw: 576,  price: 500  },
  { name: 'RX 7900 XTX', tier: 'amd',        vram: 24, bw: 960,  price: 850  },
  { name: 'RX 7900 XT',  tier: 'amd',        vram: 20, bw: 800,  price: 700  },
  { name: 'RX 7900 GRE', tier: 'amd',        vram: 16, bw: 576,  price: 500  },
  { name: 'RX 7800 XT',  tier: 'amd',        vram: 16, bw: 624,  price: 450  },
  { name: 'RX 7700 XT',  tier: 'amd',        vram: 12, bw: 432,  price: 350  },
  { name: 'RX 7600',     tier: 'amd',        vram: 8,  bw: 288,  price: 250  },
  { name: 'RX 6950 XT',  tier: 'amd',        vram: 16, bw: 576,  price: 400  },
  { name: 'RX 6900 XT',  tier: 'amd',        vram: 16, bw: 512,  price: 350  },
  { name: 'RX 6800 XT',  tier: 'amd',        vram: 16, bw: 512,  price: 300  },
  // Apple
  { name: 'M4 Ultra 192G',  tier: 'apple', vram: 192, bw: 819,  price: 8000 },
  { name: 'M4 Ultra 96G',   tier: 'apple', vram: 96,  bw: 819,  price: 5000 },
  { name: 'M4 Max 128G',    tier: 'apple', vram: 128, bw: 546,  price: 5000 },
  { name: 'M4 Max 64G',     tier: 'apple', vram: 64,  bw: 546,  price: 3500 },
  { name: 'M4 Pro 48G',     tier: 'apple', vram: 48,  bw: 273,  price: 2500 },
  { name: 'M4 Pro 24G',     tier: 'apple', vram: 24,  bw: 273,  price: 2000 },
  { name: 'M3 Ultra 192G',  tier: 'apple', vram: 192, bw: 800,  price: 7000 },
  { name: 'M3 Max 128G',    tier: 'apple', vram: 128, bw: 400,  price: 4500 },
  { name: 'M3 Max 64G',     tier: 'apple', vram: 64,  bw: 400,  price: 3500 },
  { name: 'M3 Pro 36G',     tier: 'apple', vram: 36,  bw: 150,  price: 2000 },
  { name: 'M2 Ultra 192G',  tier: 'apple', vram: 192, bw: 800,  price: 5000 },
  { name: 'M2 Max 96G',     tier: 'apple', vram: 96,  bw: 400,  price: 2500 },
  // Workstation
  { name: 'RTX 6000 Ada', tier: 'workstation', vram: 48,  bw: 960,  price: 7000  },
  { name: 'RTX 5000 Ada', tier: 'workstation', vram: 32,  bw: 576,  price: 4500  },
  { name: 'RTX 4500 Ada', tier: 'workstation', vram: 24,  bw: 432,  price: 2800  },
  { name: 'RTX 4000 Ada', tier: 'workstation', vram: 20,  bw: 360,  price: 1800  },
  { name: 'A40',           tier: 'workstation', vram: 48,  bw: 696,  price: 5000  },
  { name: 'MI300X',        tier: 'workstation', vram: 192, bw: 5300, price: 15000 },
  { name: 'MI250X',        tier: 'workstation', vram: 128, bw: 3277, price: 8000  },
  // Datacenter
  { name: 'GB200',     tier: 'datacenter', vram: 192, bw: 8000, price: 80000 },
  { name: 'B200',      tier: 'datacenter', vram: 192, bw: 8000, price: 50000 },
  { name: 'B100',      tier: 'datacenter', vram: 192, bw: 7200, price: 40000 },
  { name: 'GH200',     tier: 'datacenter', vram: 96,  bw: 4000, price: 35000 },
  { name: 'H200 SXM',  tier: 'datacenter', vram: 141, bw: 4800, price: 30000 },
  { name: 'H100 SXM',  tier: 'datacenter', vram: 80,  bw: 3350, price: 25000 },
  { name: 'H100 PCIe', tier: 'datacenter', vram: 80,  bw: 2000, price: 18000 },
  { name: 'A100 80G',  tier: 'datacenter', vram: 80,  bw: 2000, price: 12000 },
  { name: 'A100 40G',  tier: 'datacenter', vram: 40,  bw: 1600, price: 8000  },
  { name: 'L40S',      tier: 'datacenter', vram: 48,  bw: 864,  price: 10000 },
];

// ── Model landing pages ────────────────────────────────────────
// Server-side renders a static HTML page for each featured model.
// Uses FLAGSHIP_VRAM_FP16 + BENCHMARK_DATA for accurate data.
const MODEL_PAGE_TEMPLATE = fs.readFileSync(path.join(__dirname, 'public', 'model-page.html'), 'utf8');

function renderModelPage(entry) {
  const fp16 = entry.fp16Vram;

  // VRAM table rows for each quantization
  const quantRows = [
    { fmt: 'FP32',      key: 'fp32',    factor: 2.0,  note: 'Full precision, largest footprint' },
    { fmt: 'FP16/BF16', key: 'fp16',    factor: 1.0,  note: 'Standard inference precision' },
    { fmt: 'INT8',      key: 'int8',    factor: 0.5,  note: '~50% smaller, minimal quality loss' },
    { fmt: 'INT4',      key: 'int4',    factor: 0.25, note: '~75% smaller, slight quality loss' },
    { fmt: 'GGUF Q8',   key: 'gguf_q8', factor: 0.5,  note: 'GGUF 8-bit — great for llama.cpp' },
    { fmt: 'GGUF Q4',   key: 'gguf_q4', factor: 0.25, note: 'GGUF 4-bit — runs on consumer GPUs' },
  ];
  const maxVram = fp16 * 2; // fp32 is the largest
  const vramRows = quantRows.map(q => {
    const gb = Math.ceil(fp16 * q.factor * 10) / 10;
    const barPct = Math.round((gb / maxVram) * 100);
    const fits4090  = gb <= 24 ? '<span class="fits-chip fits-yes">RTX 4090</span>' : '';
    const fits3090  = gb <= 24 && !fits4090 ? '<span class="fits-chip fits-yes">RTX 3090</span>' : '';
    const fitsA100  = gb <= 80 ? '<span class="fits-chip fits-yes">A100</span>' : '';
    const fitsM3Max = gb <= 128 ? '<span class="fits-chip fits-yes">M3 Max 128G</span>' : '';
    let fitsLabel = '';
    if (gb <= 8)   fitsLabel = '<span class="fits-chip fits-yes">Any 8GB+ GPU</span>';
    else if (gb <= 12)  fitsLabel = '<span class="fits-chip fits-yes">Any 12GB+ GPU</span>';
    else if (gb <= 16)  fitsLabel = '<span class="fits-chip fits-yes">Any 16GB+ GPU</span>';
    else if (gb <= 24)  fitsLabel = '<span class="fits-chip fits-yes">RTX 4090 / 3090</span>';
    else if (gb <= 40)  fitsLabel = '<span class="fits-chip fits-yes">A100 40G / M3 Max 64G</span>';
    else if (gb <= 48)  fitsLabel = '<span class="fits-chip fits-yes">A40 / RTX 6000 Ada / M4 Pro 48G</span>';
    else if (gb <= 80)  fitsLabel = '<span class="fits-chip fits-yes">A100 80G / H100</span>';
    else if (gb <= 128) fitsLabel = '<span class="fits-chip fits-yes">M3 Max 128G / MI250X</span>';
    else if (gb <= 192) fitsLabel = '<span class="fits-chip fits-yes">H200 / M4 Ultra / MI300X</span>';
    else                fitsLabel = '<span class="fits-chip fits-no">Multi-node required</span>';
    return `<tr><td><span class="quant-label">${q.fmt}</span></td><td><span class="vram-val">${gb} GB</span><div class="vram-bar-wrap"><div class="vram-bar-fill" style="width:${barPct}%"></div></div></td><td style="color:var(--text-muted);font-size:0.82rem">${q.note}</td><td>${fitsLabel}</td></tr>`;
  }).join('\n');

  // GPU compat cards
  const int4Vram = Math.ceil(fp16 * 0.25 * 10) / 10;
  const gpuCards = FEATURED_GPUS.map(gpu => {
    let config = null;
    let configLabel = '';
    let tps = 0;
    // Try single GPU at FP16
    if (gpu.vram >= fp16) {
      config = { count: 1, eff: 0.85, totalVram: gpu.vram };
      configLabel = `${gpu.name} (FP16)`;
    } else if (gpu.vram * 2 >= fp16) {
      config = { count: 2, eff: 0.80, totalVram: gpu.vram * 2 };
      configLabel = `2× ${gpu.name} (FP16)`;
    } else if (gpu.vram >= int4Vram) {
      // Fits at INT4
      config = { count: 1, eff: 0.85, totalVram: gpu.vram, vramUsed: int4Vram };
      configLabel = `${gpu.name} (INT4/GGUF)`;
    }
    let tier = 'no', badge = 'N/A', sub = 'Does not fit', icon = '💻';
    if (config) {
      const usedVram = config.vramUsed || fp16;
      tps = Math.round((gpu.bw * config.count * config.eff) / usedVram);
      tier = tps >= 50 ? 'fast' : tps >= 15 ? 'medium' : 'slow';
      badge = `~${tps} tok/s`;
      sub = configLabel;
      icon = gpu.tier === 'apple' ? '🍎' : gpu.tier === 'datacenter' ? '🖥️' : '💚';
    }
    const fitsClass = config ? ' fits' : '';
    return `<div class="gpu-compat-card${fitsClass}"><div class="gpu-icon">${icon}</div><div class="gpu-info"><div class="gpu-name">${gpu.name} <span style="color:var(--text-muted);font-weight:400;font-size:0.78rem">${gpu.vram} GB</span></div><div class="gpu-sub">${sub}</div></div><span class="tps-badge tps-${tier}">${badge}</span></div>`;
  }).join('\n');

  // Benchmark cells
  const benchInfo = BENCHMARK_DATA[entry.id] || null;
  let benchmarkSection = '';
  if (benchInfo && Object.keys(benchInfo).length > 0) {
    const BENCH_LABELS = { mmlu: 'MMLU', humaneval: 'HumanEval', math: 'MATH', gsm8k: 'GSM8K', arc: 'ARC', ifeval: 'IFEval', swebench: 'SWE-bench', gaia: 'GAIA', hle: 'HLE', gpqa: 'GPQA' };
    const cells = Object.entries(benchInfo).filter(([k]) => BENCH_LABELS[k]).map(([key, val]) => {
      const label = BENCH_LABELS[key] || key;
      const tier = val >= 75 ? 'high' : val >= 50 ? 'medium' : 'low';
      return `<div class="bench-cell bench-${tier}"><div class="bench-name">${label}</div><div class="bench-val">${val.toFixed(1)}%</div><div class="bench-bar"><div class="bench-bar-fill" style="width:${Math.min(val, 100)}%"></div></div></div>`;
    }).join('\n');
    benchmarkSection = `<div class="section"><h2 class="section-title">Benchmark Scores</h2><div class="bench-grid">${cells}</div></div>`;
  }

  // Related models (same family)
  let relatedSection = '';
  try {
    const all = JSON.parse(fs.readFileSync(path.join(__dirname, 'data', 'featured_models.json'), 'utf8'));
    const related = all.filter(m => m.family === entry.family && m.slug !== entry.slug).slice(0, 4);
    if (related.length > 0) {
      const cards = related.map(r => `<a class="related-card" href="/models/${r.slug}"><div class="family">${r.family}</div><div class="name">${r.name}</div><div class="sub">${r.params} · ${r.fp16Vram} GB FP16</div></a>`).join('');
      relatedSection = `<div class="section"><h2 class="section-title">More ${entry.family} Models</h2><div class="related-grid">${cards}</div></div>`;
    }
  } catch (_) {}

  const int4Gb = Math.ceil(fp16 * 0.25 * 10) / 10;
  const toolUrl = `/tool?vram=${int4Gb}&usecase=llm&quantization=int4`;
  const canonicalUrl = `https://fit-to-metal.up.railway.app/models/${entry.slug}`;
  const seoTitle = `${entry.name} GPU Requirements — VRAM Calculator | Fit to Metal`;
  const seoDesc = `How much VRAM to run ${entry.name} (${entry.params})? FP16: ${fp16} GB · INT8: ${Math.ceil(fp16*0.5)} GB · INT4: ${int4Gb} GB. See GPU compatibility and tokens-per-second estimates.`;
  const seoKeywords = `${entry.name} VRAM, ${entry.name} GPU requirements, how much VRAM for ${entry.name}, ${entry.name} GPU compatibility, ${entry.name} tokens per second, ${entry.family} VRAM requirements`;

  const jsonLd = JSON.stringify({
    '@context': 'https://schema.org',
    '@type': 'TechArticle',
    'name': `${entry.name} GPU Requirements`,
    'description': seoDesc,
    'url': canonicalUrl,
    'about': { '@type': 'SoftwareApplication', 'name': entry.name, 'description': entry.description },
  });

  // BreadcrumbList — helps Google show breadcrumbs in SERPs
  const jsonLdBreadcrumb = JSON.stringify({
    '@context': 'https://schema.org',
    '@type': 'BreadcrumbList',
    'itemListElement': [
      { '@type': 'ListItem', 'position': 1, 'name': 'Home', 'item': 'https://fit-to-metal.up.railway.app/' },
      { '@type': 'ListItem', 'position': 2, 'name': 'Models', 'item': 'https://fit-to-metal.up.railway.app/models' },
      { '@type': 'ListItem', 'position': 3, 'name': entry.name, 'item': canonicalUrl },
    ],
  });

  // FAQPage — unlocks Google FAQ rich results for each model page
  const int8Gb = Math.ceil(fp16 * 0.5 * 10) / 10;
  const singleGpuAnswer = int4Gb <= 8
    ? `Yes. At 4-bit (GGUF Q4/INT4) it only needs ${int4Gb} GB VRAM — fits on any 8 GB+ GPU including the RTX 4060 and RX 6650 XT.`
    : int4Gb <= 16
    ? `Yes at 4-bit quantization (${int4Gb} GB VRAM required). An RTX 4070 Ti (16 GB) or M4 Pro 24G will handle it comfortably.`
    : int4Gb <= 24
    ? `Yes at 4-bit quantization (${int4Gb} GB VRAM). A single RTX 4090 (24 GB) or M3 Max can run it.`
    : int4Gb <= 48
    ? `At 4-bit (${int4Gb} GB VRAM) it fits on an RTX 6000 Ada (48 GB) or M4 Pro 48G. Consumer GPUs require two cards.`
    : `At 4-bit (${int4Gb} GB VRAM) you need a high-end workstation or server GPU, or multiple consumer GPUs combined.`;
  const bestQuantAnswer = fp16 <= 24
    ? `FP16 (${fp16} GB) works on a single RTX 4090 or M3 Max and gives full quality. Use GGUF Q4 (${int4Gb} GB) for 8–12 GB GPUs.`
    : fp16 <= 80
    ? `INT8 (${int8Gb} GB) balances quality and VRAM use. For single-GPU deployment on consumer hardware, GGUF Q4 (${int4Gb} GB) is the practical choice.`
    : `GGUF Q4 (${int4Gb} GB) is the recommended starting point for consumer hardware. INT8 (${int8Gb} GB) is better if you have the VRAM.`;
  const jsonLdFaq = JSON.stringify({
    '@context': 'https://schema.org',
    '@type': 'FAQPage',
    'mainEntity': [
      {
        '@type': 'Question',
        'name': `How much VRAM do I need to run ${entry.name}?`,
        'acceptedAnswer': { '@type': 'Answer', 'text': `${entry.name} (${entry.params}) requires ${fp16} GB VRAM in FP16, ${int8Gb} GB in INT8, and ${int4Gb} GB in 4-bit (INT4/GGUF Q4). FP32 needs ${Math.ceil(fp16*2)} GB.` },
      },
      {
        '@type': 'Question',
        'name': `Can I run ${entry.name} on a single consumer GPU?`,
        'acceptedAnswer': { '@type': 'Answer', 'text': singleGpuAnswer },
      },
      {
        '@type': 'Question',
        'name': `What is the best quantization for ${entry.name} on consumer hardware?`,
        'acceptedAnswer': { '@type': 'Answer', 'text': bestQuantAnswer },
      },
    ],
  });

  return MODEL_PAGE_TEMPLATE
    .replace(/\{\{SEO_TITLE\}\}/g, seoTitle)
    .replace(/\{\{SEO_DESCRIPTION\}\}/g, seoDesc)
    .replace(/\{\{SEO_KEYWORDS\}\}/g, seoKeywords)
    .replace(/\{\{CANONICAL_URL\}\}/g, canonicalUrl)
    .replace(/\{\{JSON_LD\}\}/g, jsonLd)
    .replace('{{JSON_LD_BREADCRUMB}}', jsonLdBreadcrumb)
    .replace('{{JSON_LD_FAQ}}', jsonLdFaq)
    .replace(/\{\{MODEL_NAME\}\}/g, entry.name)
    .replace(/\{\{MODEL_FAMILY\}\}/g, entry.family)
    .replace(/\{\{MODEL_PARAMS\}\}/g, entry.params)
    .replace(/\{\{FP16_VRAM\}\}/g, fp16)
    .replace(/\{\{INT4_VRAM\}\}/g, int4Gb)
    .replace(/\{\{MODEL_DESCRIPTION\}\}/g, entry.description)
    .replace('{{VRAM_TABLE_ROWS}}', vramRows)
    .replace('{{GPU_CARDS}}', gpuCards)
    .replace('{{BENCHMARK_SECTION}}', benchmarkSection)
    .replace('{{RELATED_SECTION}}', relatedSection)
    .replace(/\{\{TOOL_URL\}\}/g, toolUrl);
}

app.get('/models/:slug', (req, res) => {
  let featuredModels = [];
  try { featuredModels = JSON.parse(fs.readFileSync(path.join(__dirname, 'data', 'featured_models.json'), 'utf8')); } catch (_) {}
  const entry = featuredModels.find(m => m.slug === req.params.slug);
  if (!entry) return res.status(404).type('text/html').send('<h1>404 — Model not found</h1><p><a href="/models">Browse all models</a></p>');
  res.type('text/html').send(renderModelPage(entry));
});

// ── Model index page ───────────────────────────────────────────
app.get('/models', (req, res) => {
  let featuredModels = [];
  try { featuredModels = JSON.parse(fs.readFileSync(path.join(__dirname, 'data', 'featured_models.json'), 'utf8')); } catch (_) {}
  const byFamily = {};
  featuredModels.forEach(m => { if (!byFamily[m.family]) byFamily[m.family] = []; byFamily[m.family].push(m); });
  const sections = Object.entries(byFamily).map(([fam, models]) => {
    const cards = models.map(m => `<div style="border:1px solid #1e1e1e;border-radius:8px;padding:1rem;background:#0f0f0f"><div style="font-size:0.72rem;color:#76b900;text-transform:uppercase;font-weight:600;margin-bottom:0.3rem">${m.family}</div><a href="/models/${m.slug}" style="font-size:0.95rem;font-weight:600;color:#e0e0e0">${m.name}</a><div style="font-size:0.8rem;color:#606060;margin-top:0.2rem">${m.params} · FP16 ${m.fp16Vram} GB</div></div>`).join('');
    return `<div style="margin-bottom:2rem"><h2 style="font-size:1rem;font-weight:700;margin-bottom:0.75rem;color:#e0e0e0">${fam}</h2><div style="display:grid;grid-template-columns:repeat(auto-fill,minmax(220px,1fr));gap:0.6rem">${cards}</div></div>`;
  }).join('');
  res.type('text/html').send(`<!DOCTYPE html><html lang="en"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>AI Model GPU Requirements — Fit to Metal</title><meta name="description" content="GPU VRAM requirements for 50+ popular AI models including Llama, Mistral, Qwen, DeepSeek, Gemma and more."><link rel="canonical" href="https://fit-to-metal.up.railway.app/models"><link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;600;700;800&display=swap" rel="stylesheet"></head><body style="background:#0a0a0a;color:#e0e0e0;font-family:Inter,sans-serif;margin:0"><nav style="position:sticky;top:0;z-index:100;display:flex;align-items:center;justify-content:space-between;padding:0 2rem;height:60px;background:rgba(10,10,10,0.85);backdrop-filter:blur(12px);border-bottom:1px solid #1e1e1e"><a href="/" style="font-weight:700;color:#e0e0e0;text-decoration:none"><span style="color:#76b900">◈</span> Fit to Metal</a><a href="/tool" style="background:#76b900;color:#0a0a0a;font-weight:700;font-size:0.85rem;padding:0.45rem 1.1rem;border-radius:6px;text-decoration:none">Launch Tool →</a></nav><div style="max-width:960px;margin:0 auto;padding:2rem 1.5rem"><div style="margin-bottom:0.5rem;font-size:0.82rem;color:#606060"><a href="/" style="color:#606060">Home</a> › Models</div><h1 style="font-size:2rem;font-weight:800;letter-spacing:-0.025em;margin-bottom:0.5rem">AI Model GPU Requirements</h1><p style="color:#606060;margin-bottom:2rem">VRAM requirements, benchmark scores, and GPU compatibility for 50+ popular open-source models.</p>${sections}</div><footer style="padding:2rem;border-top:1px solid #1e1e1e;text-align:center;color:#606060;font-size:0.82rem">Model data from <a href="https://huggingface.co" target="_blank" style="color:#606060">HuggingFace</a> &amp; <a href="https://artificialanalysis.ai" target="_blank" style="color:#606060">ArtificialAnalysis</a>. Fit to Metal is free and open-source.</footer></body></html>`);
});

// ── Reverse search: find hardware for a model ─────────────────
// GET /api/hardware-for-model?model=<hf-id>&targetTps=<n>&quantization=<q>
app.get('/api/hardware-for-model', (req, res) => {
  const modelId = (req.query.model || '').trim();
  const targetTps = parseInt(req.query.targetTps, 10) || 10;
  const quantization = req.query.quantization || 'fp16';

  if (!modelId) return res.status(400).json({ error: 'Missing query param: model' });

  // Look up model's FP16 VRAM
  const fp16Vram = FLAGSHIP_VRAM_FP16[modelId];
  if (!fp16Vram) {
    // Try case-insensitive match
    const lc = modelId.toLowerCase();
    const match = Object.keys(FLAGSHIP_VRAM_FP16).find(k => k.toLowerCase() === lc);
    if (!match) return res.status(404).json({ error: `Model not found in database: ${modelId}. Only flagship models are supported.` });
    return res.redirect(307, `/api/hardware-for-model?model=${encodeURIComponent(match)}&targetTps=${targetTps}&quantization=${quantization}`);
  }

  // Scale VRAM for requested quantization
  const factor = DTYPE_BYTES[quantization] != null ? DTYPE_BYTES[quantization] / 2 : 1;
  const requiredVram = Math.ceil(fp16Vram * factor * 10) / 10;

  // Get model name for response
  const allFeatured = (() => { try { return JSON.parse(fs.readFileSync(path.join(__dirname, 'data', 'featured_models.json'), 'utf8')); } catch (_) { return []; } })();
  const featuredEntry = allFeatured.find(m => m.id === modelId);
  const modelName = featuredEntry ? featuredEntry.name : modelId.split('/').pop();
  const modelParams = featuredEntry ? featuredEntry.params : null;

  const configs = [];
  for (const gpu of ALL_GPUS) {
    for (const count of [1, 2, 4, 8]) {
      const totalVram = gpu.vram * count;
      if (totalVram < requiredVram) continue;

      const efficiency = count > 1 ? 0.80 : 0.85;
      const achievedTps = Math.floor((gpu.bw * count * efficiency) / requiredVram);
      if (achievedTps < targetTps) continue;

      const priceApprox = gpu.price * count;
      const tpsTier = achievedTps >= 50 ? 'fast' : achievedTps >= 15 ? 'medium' : 'slow';

      configs.push({
        gpu: gpu.name,
        tier: gpu.tier,
        count,
        totalVramGb: totalVram,
        requiredVramGb: requiredVram,
        achievedTps,
        tpsTier,
        priceApprox,
        pricePer: gpu.price,
        quantization,
      });
      break; // only keep lowest count that meets target for each GPU
    }
  }

  // Sort: by price ascending, then totalVram ascending
  configs.sort((a, b) => a.priceApprox - b.priceApprox || a.totalVramGb - b.totalVramGb);

  res.json({
    model: { id: modelId, name: modelName, params: modelParams, fp16VramGb: fp16Vram, requiredVramGb: requiredVram, quantization },
    targetTps,
    total: configs.length,
    configs: configs.slice(0, 30),
  });
});

const PORT = process.env.PORT ?? 4242;
// API: Contact form — sends message to umanggarg78@gmail.com
// Requires env vars: SMTP_USER (Gmail address) and SMTP_PASS (Gmail app password)
app.post('/api/contact', async (req, res) => {
  const { name, email, subject, message } = req.body || {};
  if (!name || !email || !message) {
    return res.status(400).json({ error: 'name, email, and message are required.' });
  }
  // Basic email format check
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    return res.status(400).json({ error: 'Invalid email address.' });
  }

  const smtpUser = process.env.SMTP_USER;
  const smtpPass = process.env.SMTP_PASS;
  if (!smtpUser || !smtpPass) {
    console.error('Contact form: SMTP_USER / SMTP_PASS env vars not set.');
    return res.status(503).json({ error: 'Email service not configured.' });
  }

  try {
    const transporter = nodemailer.createTransport({
      service: 'gmail',
      auth: { user: smtpUser, pass: smtpPass },
    });

    await transporter.sendMail({
      from: `"Fit to Metal Contact" <${smtpUser}>`,
      to: 'umanggarg78@gmail.com',
      replyTo: `"${name}" <${email}>`,
      subject: `[Fit to Metal] ${subject || 'Contact form'}`,
      text: `Name: ${name}\nEmail: ${email}\nSubject: ${subject || 'N/A'}\n\n${message}`,
      html: `<p><strong>Name:</strong> ${name}</p>
             <p><strong>Email:</strong> <a href="mailto:${email}">${email}</a></p>
             <p><strong>Subject:</strong> ${subject || 'N/A'}</p>
             <hr>
             <p>${message.replace(/\n/g, '<br>')}</p>`,
    });

    res.json({ ok: true });
  } catch (err) {
    console.error('Contact form send error:', err.message);
    res.status(500).json({ error: 'Failed to send message. Please try again.' });
  }
});

app.listen(PORT, () => {
  console.log(`\n  GPU Model Finder → http://localhost:${PORT}\n`);
});
