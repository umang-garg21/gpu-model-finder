const express = require('express');
const axios   = require('axios');
const NodeCache = require('node-cache');
const path    = require('path');

const app   = express();
const cache = new NodeCache({ stdTTL: 600 }); // 10-minute cache

app.use(express.static(path.join(__dirname, 'public')));
app.use(express.json());

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
  // ── LLMs: mmlu, humaneval, math, gsm8k, arc, ifeval ───────────
  'meta-llama/Llama-3.1-8B-Instruct':           { mmlu:68.4, humaneval:72.6, math:51.9, gsm8k:84.5, arc:60.1, ifeval:71.2 },
  'meta-llama/Llama-3.1-70B-Instruct':          { mmlu:83.6, humaneval:80.5, math:68.0, gsm8k:95.1, arc:67.7, ifeval:84.6 },
  'meta-llama/Llama-3.1-405B-Instruct':         { mmlu:87.3, humaneval:89.0, math:73.8, gsm8k:96.8, arc:70.2, ifeval:88.6 },
  'meta-llama/Llama-3.2-1B-Instruct':           { mmlu:49.3, humaneval:38.4, math:25.0, gsm8k:44.4, arc:47.3, ifeval:53.2 },
  'meta-llama/Llama-3.2-3B-Instruct':           { mmlu:63.4, humaneval:58.0, math:41.6, gsm8k:77.7, arc:54.8, ifeval:67.4 },
  'meta-llama/Llama-3.3-70B-Instruct':          { mmlu:86.0, humaneval:88.4, math:77.0, gsm8k:95.6, arc:68.5, ifeval:85.0 },
  'Qwen/Qwen2.5-0.5B-Instruct':                 { mmlu:47.0, humaneval:36.6, math:41.1, gsm8k:41.2, arc:40.3, ifeval:35.2 },
  'Qwen/Qwen2.5-1.5B-Instruct':                 { mmlu:60.9, humaneval:61.0, math:55.2, gsm8k:68.5, arc:52.1, ifeval:47.4 },
  'Qwen/Qwen2.5-3B-Instruct':                   { mmlu:65.0, humaneval:65.9, math:65.6, gsm8k:79.1, arc:55.2, ifeval:57.0 },
  'Qwen/Qwen2.5-7B-Instruct':                   { mmlu:74.2, humaneval:84.1, math:75.5, gsm8k:91.6, arc:62.0, ifeval:71.1 },
  'Qwen/Qwen2.5-14B-Instruct':                  { mmlu:79.7, humaneval:78.7, math:79.9, gsm8k:93.3, arc:66.4, ifeval:75.9 },
  'Qwen/Qwen2.5-32B-Instruct':                  { mmlu:83.0, humaneval:85.4, math:83.1, gsm8k:95.3, arc:68.2, ifeval:83.4 },
  'Qwen/Qwen2.5-72B-Instruct':                  { mmlu:85.3, humaneval:86.0, math:83.1, gsm8k:95.2, arc:70.4, ifeval:84.8 },
  'Qwen/Qwen2.5-Coder-7B-Instruct':             { mmlu:72.0, humaneval:88.4, math:83.9, gsm8k:91.6, arc:61.0, ifeval:69.8 },
  'Qwen/Qwen2.5-Coder-32B-Instruct':            { mmlu:82.5, humaneval:92.7, math:88.2, gsm8k:93.5, arc:68.0, ifeval:80.2 },
  'Qwen/QwQ-32B':                               { mmlu:82.5, humaneval:91.5, math:95.8, gsm8k:95.8, arc:67.4, ifeval:78.6 },
  'mistralai/Mistral-7B-Instruct-v0.3':         { mmlu:62.5, humaneval:40.2, math:13.1, gsm8k:52.2, arc:54.0, ifeval:49.6 },
  'mistralai/Mistral-Nemo-Instruct-2407':       { mmlu:68.0, humaneval:62.4, math:40.4, gsm8k:82.0, arc:60.4, ifeval:58.0 },
  'mistralai/Mixtral-8x7B-Instruct-v0.1':       { mmlu:71.2, humaneval:45.1, math:28.4, gsm8k:74.4, arc:61.3, ifeval:47.9 },
  'mistralai/Mixtral-8x22B-Instruct-v0.1':      { mmlu:77.7, humaneval:51.3, math:41.8, gsm8k:88.2, arc:66.0, ifeval:72.7 },
  'google/gemma-2-2b-it':                       { mmlu:55.7, humaneval:40.2, math:20.0, gsm8k:61.0, arc:52.2, ifeval:52.0 },
  'google/gemma-2-9b-it':                       { mmlu:72.3, humaneval:68.3, math:44.4, gsm8k:90.8, arc:63.7, ifeval:71.5 },
  'google/gemma-2-27b-it':                      { mmlu:78.7, humaneval:74.4, math:55.2, gsm8k:90.7, arc:67.5, ifeval:77.9 },
  'microsoft/Phi-3-mini-4k-instruct':           { mmlu:69.9, humaneval:59.1, math:41.6, gsm8k:86.4, arc:62.0, ifeval:45.8 },
  'microsoft/Phi-3.5-mini-instruct':            { mmlu:69.0, humaneval:62.8, math:46.4, gsm8k:88.6, arc:61.6, ifeval:49.2 },
  'microsoft/Phi-3-medium-4k-instruct':         { mmlu:78.0, humaneval:70.6, math:51.4, gsm8k:90.9, arc:65.0, ifeval:55.0 },
  'microsoft/Phi-4':                            { mmlu:84.8, humaneval:82.6, math:80.4, gsm8k:95.6, arc:72.0, ifeval:72.0 },
  'deepseek-ai/DeepSeek-R1-Distill-Qwen-7B':   { mmlu:55.5, humaneval:86.0, math:92.8, gsm8k:92.8, arc:59.0, ifeval:51.2 },
  'deepseek-ai/DeepSeek-R1-Distill-Qwen-14B':  { mmlu:69.5, humaneval:91.5, math:93.9, gsm8k:93.9, arc:65.0, ifeval:66.4 },
  'deepseek-ai/DeepSeek-R1-Distill-Qwen-32B':  { mmlu:72.6, humaneval:92.7, math:94.3, gsm8k:93.3, arc:68.0, ifeval:72.8 },
  'deepseek-ai/DeepSeek-R1-Distill-Llama-8B':  { mmlu:50.0, humaneval:73.8, math:89.1, gsm8k:89.1, arc:56.0, ifeval:44.0 },
  'deepseek-ai/DeepSeek-R1-Distill-Llama-70B': { mmlu:77.6, humaneval:95.1, math:94.5, gsm8k:95.0, arc:70.0, ifeval:76.0 },
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

const USECASE_PIPELINES = {
  llm:    ['text-generation', 'text2text-generation'],
  image:  ['text-to-image', 'image-to-image'],
  audio:  ['automatic-speech-recognition', 'text-to-speech', 'audio-to-audio'],
  vision: ['image-classification', 'object-detection', 'image-segmentation', 'depth-estimation', 'image-to-text'],
  video:  ['text-to-video', 'video-classification'],
  embed:  ['feature-extraction', 'sentence-similarity'],
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
  const maxResults = Math.min(parseInt(limit), 60);
  const hfSort     = sort === 'newest' ? 'lastModified' : sort;

  const cacheKey = `${vram}-${usecase}-${quantization}-${sort}-${limit}`;
  const cached   = cache.get(cacheKey);
  if (cached) {
    console.log(`[cache hit] ${cacheKey}`);
    return res.json(cached);
  }

  const pipelines = USECASE_PIPELINES[usecase] ?? USECASE_PIPELINES.llm;

  try {
    // 1. Fetch model lists for all pipelines in parallel
    const listResults = await Promise.all(
      pipelines.map(pipeline =>
        axios.get('https://huggingface.co/api/models', {
          params: { filter: pipeline, sort: hfSort, direction: -1, limit: 60, full: true },
          timeout: 12000,
          headers: { 'User-Agent': 'gpu-model-finder/1.0' },
        }).then(r => r.data).catch(err => {
          console.warn(`Failed "${pipeline}":`, err.message);
          return [];
        })
      )
    );

    // De-duplicate
    const seen = new Set();
    const allModels = listResults.flat().filter(m => {
      if (seen.has(m.id)) return false;
      seen.add(m.id);
      return true;
    });

    // 2. First pass: estimate VRAM from model name heuristic
    const candidates = allModels.map(m => {
      const nameParams = paramsFromName(m.id);
      return {
        raw: m,
        totalParams: nameParams,
        estimatedVRAM: estimateVRAM(nameParams, quantization),
      };
    });

    // 3. Identify models where the name heuristic gave no result —
    //    fetch their individual details to get safetensors param count.
    //    Limit to top 40 by downloads to keep response time reasonable.
    const needsDetail = candidates
      .filter(c => c.totalParams === null)
      .sort((a, b) => (b.raw.downloads ?? 0) - (a.raw.downloads ?? 0))
      .slice(0, 40)
      .map(c => c.raw.id);

    let details = {};
    if (needsDetail.length) {
      console.log(`[detail fetch] ${needsDetail.length} models`);
      details = await batchFetchDetails(needsDetail, 8);
    }

    // 4. Merge detail data, build final model objects
    const processed = candidates
      .map(({ raw: m, totalParams: nameParams, estimatedVRAM: nameVRAM }) => {
        let totalParams = nameParams;
        let estimatedVRAM = nameVRAM;

        if (!totalParams && details[m.id]) {
          const detailed = details[m.id];
          totalParams    = paramsFromSafetensors(detailed.safetensors);
          estimatedVRAM  = estimateVRAM(totalParams, quantization);
        }

        // Merge benchmark data: hardcoded lookup + model-card extraction
        const bmLookup = BENCHMARK_DATA[m.id] ?? {};
        const bmCard   = extractBenchmarks(details[m.id]?.cardData) ?? {};
        const benchmarks = Object.keys({ ...bmLookup, ...bmCard }).length
          ? { ...bmLookup, ...bmCard }
          : null;

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
          paramLabel:   paramLabel(totalParams),
          benchmarks,
          tags: (m.tags ?? [])
            .filter(t => !t.startsWith('arxiv:') && !t.startsWith('base_model:') &&
                         !t.startsWith('region:') && !t.startsWith('deploy:') && t.length < 40)
            .slice(0, 8),
          url:   `https://huggingface.co/${m.id}`,
          gated: m.gated ?? false,
        };
      })
      // Keep models that fit (or have unknown VRAM)
      .filter(m => m.estimatedVRAM === null || m.estimatedVRAM <= vramGB)
      // Sort: known VRAM first, then by user's chosen sort
      .sort((a, b) => {
        const aK = a.estimatedVRAM !== null;
        const bK = b.estimatedVRAM !== null;
        if (aK !== bK) return aK ? -1 : 1;
        if (sort === 'likes')  return b.likes - a.likes;
        if (sort === 'newest') return new Date(b.lastModified) - new Date(a.lastModified);
        return b.downloads - a.downloads;
      })
      .slice(0, maxResults);

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

const PORT = process.env.PORT ?? 4242;
app.listen(PORT, () => {
  console.log(`\n  GPU Model Finder → http://localhost:${PORT}\n`);
});
