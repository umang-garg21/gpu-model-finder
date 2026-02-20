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
