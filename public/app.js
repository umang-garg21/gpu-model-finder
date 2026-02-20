/* ─────────────────────────────────────────────────────────────
   Fit to Metal — Frontend
   ───────────────────────────────────────────────────────────── */

// ── NVIDIA GPU data ────────────────────────────────────────────
const NVIDIA_GPUS = {
  '50-series': [
    { name: 'RTX 5090',    vram: 32, bw: 1792 },
    { name: 'RTX 5080',    vram: 16, bw: 960  },
    { name: 'RTX 5070 Ti', vram: 16, bw: 896  },
    { name: 'RTX 5070',    vram: 12, bw: 672  },
  ],
  '40-series': [
    { name: 'RTX 4090',          vram: 24, bw: 1008 },
    { name: 'RTX 4080 Super',    vram: 16, bw: 736  },
    { name: 'RTX 4080',          vram: 16, bw: 717  },
    { name: 'RTX 4070 Ti Super', vram: 16, bw: 672  },
    { name: 'RTX 4070 Ti',       vram: 12, bw: 504  },
    { name: 'RTX 4070 Super',    vram: 12, bw: 504  },
    { name: 'RTX 4070',          vram: 12, bw: 504  },
    { name: 'RTX 4060 Ti 16G',   vram: 16, bw: 288  },
    { name: 'RTX 4060 Ti',       vram: 8,  bw: 288  },
    { name: 'RTX 4060',          vram: 8,  bw: 272  },
  ],
  'workstation': [
    { name: 'RTX 6000 Ada', vram: 48, bw: 960 },
    { name: 'RTX 5000 Ada', vram: 32, bw: 576 },
    { name: 'RTX 4500 Ada', vram: 24, bw: 432 },
    { name: 'RTX 4000 Ada', vram: 20, bw: 360 },
  ],
  'datacenter': [
    { name: 'H200 SXM',  vram: 141, bw: 4800 },
    { name: 'H100 SXM',  vram: 80,  bw: 3350 },
    { name: 'H100 PCIe', vram: 80,  bw: 2000 },
    { name: 'A100 80G',  vram: 80,  bw: 2000 },
    { name: 'A100 40G',  vram: 40,  bw: 1600 },
    { name: 'L40S',      vram: 48,  bw: 864  },
  ],
};

// ── Benchmark definitions per use case ─────────────────────────
const USE_CASE_BENCHMARKS = {
  llm: [
    { key: 'overall',       label: '★ Overall',  desc: 'Weighted avg across all available LLM benchmarks' },
    { key: 'mmlu',          label: 'General',    desc: 'MMLU 5-shot — broad general knowledge (%)' },
    { key: 'humaneval',     label: 'Coding',     desc: 'HumanEval — Python code generation pass@1 (%)' },
    { key: 'math',          label: 'Math',       desc: 'MATH competition problems (%)' },
    { key: 'gsm8k',         label: 'GSM8K',      desc: 'Grade school math word problems (%)' },
    { key: 'arc',           label: 'Reasoning',  desc: 'ARC-Challenge — science reasoning (%)' },
    { key: 'ifeval',        label: 'Instruct',   desc: 'IFEval — instruction-following accuracy (%)' },
  ],
  image: [
    { key: 'image_quality', label: 'Quality',    desc: 'Human preference quality score 0–100' },
    { key: 'clip_score',    label: 'CLIP',       desc: 'Text-image alignment (higher = better)' },
  ],
  audio: [
    { key: 'wer',           label: 'WER ↓',      desc: 'Word Error Rate — lower is better (%)' },
  ],
  vision: [
    { key: 'imagenet_top1', label: 'ImageNet',   desc: 'Top-1 accuracy on ImageNet val set (%)' },
  ],
  embed: [
    { key: 'mteb',          label: 'MTEB',       desc: 'Massive Text Embedding Benchmark avg (%)' },
  ],
  video: [],
};

// Benchmarks where lower score = better rank
const LOWER_IS_BETTER = new Set(['wer']);

// ── Deployment options ─────────────────────────────────────────
const DEPLOYMENT_OPTIONS = [
  {
    id: 'ollama', name: 'Ollama',
    desc: 'Pull & run with one command. Best UX for local inference.',
    url: 'https://ollama.com',
    tags: ['Beginner', 'Local', 'CLI'],
    usecases: ['llm'], minVram: 0,
  },
  {
    id: 'lmstudio', name: 'LM Studio',
    desc: 'Cross-platform GUI with built-in model browser and chat.',
    url: 'https://lmstudio.ai',
    tags: ['GUI', 'Local', 'GGUF'],
    usecases: ['llm'], minVram: 0,
  },
  {
    id: 'vllm', name: 'vLLM',
    desc: 'PagedAttention for high-throughput serving. OpenAI-compatible API.',
    url: 'https://docs.vllm.ai',
    tags: ['Production', 'High-throughput', 'API'],
    usecases: ['llm'], minVram: 8,
  },
  {
    id: 'llamacpp', name: 'llama.cpp',
    desc: 'Lightweight C++ runtime. CPU + GPU hybrid. GGUF quantization.',
    url: 'https://github.com/ggerganov/llama.cpp',
    tags: ['CPU+GPU', 'GGUF', 'Low-level'],
    usecases: ['llm'], minVram: 0,
  },
  {
    id: 'tgi', name: 'TGI',
    desc: "HuggingFace's Text Generation Inference. Docker-ready, production-grade.",
    url: 'https://huggingface.co/docs/text-generation-inference',
    tags: ['Production', 'Docker', 'HF-native'],
    usecases: ['llm'], minVram: 0,
  },
  {
    id: 'transformers', name: 'Transformers',
    desc: 'HuggingFace Python library. Universal — supports all model types.',
    url: 'https://huggingface.co/docs/transformers',
    tags: ['Universal', 'Python', 'Research'],
    usecases: ['llm', 'image', 'audio', 'vision', 'embed', 'video'], minVram: 0,
  },
  {
    id: 'diffusers', name: 'Diffusers',
    desc: 'HuggingFace library purpose-built for diffusion models.',
    url: 'https://huggingface.co/docs/diffusers',
    tags: ['Diffusion', 'Python'],
    usecases: ['image', 'video'], minVram: 0,
  },
  {
    id: 'comfyui', name: 'ComfyUI',
    desc: 'Node-based workflow editor for image gen. Vast plugin ecosystem.',
    url: 'https://github.com/comfyanonymous/ComfyUI',
    tags: ['GUI', 'Workflows', 'Nodes'],
    usecases: ['image'], minVram: 0,
  },
  {
    id: 'a1111', name: 'Automatic1111',
    desc: 'Feature-rich web UI for Stable Diffusion with hundreds of extensions.',
    url: 'https://github.com/AUTOMATIC1111/stable-diffusion-webui',
    tags: ['Web UI', 'Extensions'],
    usecases: ['image'], minVram: 0,
  },
  {
    id: 'faster-whisper', name: 'faster-whisper',
    desc: 'Optimized Whisper with CTranslate2. ~4× faster than vanilla Whisper.',
    url: 'https://github.com/SYSTRAN/faster-whisper',
    tags: ['Audio', 'Fast', 'CTranslate2'],
    usecases: ['audio'], minVram: 0,
  },
];

// ── Task descriptions (for modal) ──────────────────────────────
const TASK_DESCRIPTIONS = {
  'text-generation':             'General-purpose text generation and chat. Ideal for: chatbots, content creation, summarization, Q&A, code generation, and reasoning tasks.',
  'text2text-generation':        'Sequence-to-sequence generation. Ideal for: translation, summarization, paraphrase, and text-to-text transformation.',
  'text-to-image':               'Generates images from text prompts. Ideal for: creative art, product mockups, concept visualization, and controlled image synthesis.',
  'image-to-image':              'Transforms images via prompts or style transfer. Ideal for: editing, inpainting, upscaling, and style transfer.',
  'automatic-speech-recognition':'Transcribes spoken audio to text. Ideal for: meeting notes, subtitles, voice interfaces, and audio indexing.',
  'text-to-speech':              'Converts text to natural speech. Ideal for: audiobooks, accessibility tools, voice assistants, and content narration.',
  'audio-to-audio':              'Transforms or enhances audio signals. Ideal for: noise cancellation, music source separation, and audio effects.',
  'feature-extraction':          'Produces dense vector embeddings from text. Ideal for: semantic search, clustering, classification, and RAG pipelines.',
  'sentence-similarity':         'Measures semantic closeness between sentences. Ideal for: deduplication, search ranking, recommendation, and NLI.',
  'image-classification':        'Assigns label categories to images. Ideal for: content moderation, medical imaging, quality control, and photo tagging.',
  'object-detection':            'Detects and localizes objects with bounding boxes. Ideal for: security cameras, inventory management, and robotics.',
  'image-segmentation':          'Segments images into semantic or instance regions. Ideal for: medical imaging, autonomous driving, and photo editing.',
  'depth-estimation':            'Predicts per-pixel depth from a single 2D image. Ideal for: AR, 3D reconstruction, and robot navigation.',
  'image-to-text':               'Generates text descriptions from images (captioning/VQA). Ideal for: accessibility, image search, and content understanding.',
  'text-to-video':               'Generates video clips from text prompts. Ideal for: creative production, storyboarding, and marketing content.',
  'video-classification':        'Classifies or understands video sequences. Ideal for: content moderation, sports analytics, and surveillance.',
};

// ── State ──────────────────────────────────────────────────────
const state = {
  vram: 8,
  usecase: 'llm',
  quantization: 'fp16',
  sort: 'downloads',
  loading: false,
  models: [],
  selectedGpu: null,
  gpuCount: 1,
  gpuTier: '50-series',
  activeBenchmark: null,
};

// ── DOM refs ───────────────────────────────────────────────────
const vramSlider      = document.getElementById('vramSlider');
const vramDisplay     = document.getElementById('vramDisplay');
const vramPresets     = document.getElementById('vramPresets');
const usecaseTabs     = document.getElementById('usecaseTabs');
const quantSel        = document.getElementById('quantization');
const sortSel         = document.getElementById('sortBy');
const searchBtn       = document.getElementById('searchBtn');
const modelGrid       = document.getElementById('modelGrid');
const resultsCount    = document.getElementById('resultsCount');
const sortBar         = document.getElementById('sortBar');
const gpuTierTabs     = document.getElementById('gpuTierTabs');
const gpuGrid         = document.getElementById('gpuGrid');
const selectedGpuRow  = document.getElementById('selectedGpuRow');
const selectedGpuText = document.getElementById('selectedGpuText');
const clearGpuBtn     = document.getElementById('clearGpuBtn');
const multiGpuSection = document.getElementById('multiGpuSection');
const gpuCountRow     = document.getElementById('gpuCountRow');
const multiGpuInfo    = document.getElementById('multiGpuInfo');
const benchmarkBar    = document.getElementById('benchmarkBar');
const benchmarkTabs   = document.getElementById('benchmarkTabs');
const modalOverlay    = document.getElementById('modalOverlay');
const modalBody       = document.getElementById('modalBody');
const modalClose      = document.getElementById('modalClose');

// ── GPU Picker ─────────────────────────────────────────────────
function renderGpuGrid() {
  const gpus = NVIDIA_GPUS[state.gpuTier] ?? [];
  gpuGrid.innerHTML = gpus.map(g => `
    <button class="gpu-btn${state.selectedGpu?.name === g.name ? ' active' : ''}"
            data-name="${escapeHtml(g.name)}" data-vram="${g.vram}" data-bw="${g.bw}">
      <span class="gpu-btn-name">${escapeHtml(g.name)}</span>
      <span class="gpu-btn-vram">${g.vram} GB</span>
    </button>
  `).join('');
}

gpuTierTabs.addEventListener('click', e => {
  const btn = e.target.closest('.gpu-tier-btn');
  if (!btn) return;
  state.gpuTier = btn.dataset.tier;
  gpuTierTabs.querySelectorAll('.gpu-tier-btn').forEach(b =>
    b.classList.toggle('active', b === btn)
  );
  renderGpuGrid();
});

gpuGrid.addEventListener('click', e => {
  const btn = e.target.closest('.gpu-btn');
  if (!btn) return;
  const name = btn.dataset.name;
  const vram = parseInt(btn.dataset.vram);
  const bw   = parseInt(btn.dataset.bw);
  if (state.selectedGpu?.name === name) {
    clearGpu();
  } else {
    state.selectedGpu = { name, vram, bw };
    state.gpuCount = 1;
    updateVramFromGpu();
    updateGpuUI();
  }
});

clearGpuBtn.addEventListener('click', () => clearGpu());

function clearGpu() {
  state.selectedGpu = null;
  state.gpuCount = 1;
  vramSlider.max = 80;
  updateGpuUI();
  renderGpuGrid();
}

function updateVramFromGpu() {
  if (!state.selectedGpu) return;
  const total = state.selectedGpu.vram * state.gpuCount;
  state.vram = total;
  vramSlider.max = Math.max(320, total + 40);
  vramSlider.value = total;
  vramDisplay.textContent = total;
  syncPresets();
}

function updateGpuUI() {
  if (state.selectedGpu) {
    const total = state.selectedGpu.vram * state.gpuCount;
    selectedGpuText.textContent = state.gpuCount > 1
      ? `${state.gpuCount}× ${state.selectedGpu.name} = ${total} GB`
      : `${state.selectedGpu.name} — ${total} GB`;
    selectedGpuRow.style.display = 'flex';
    multiGpuSection.style.display = 'block';

    gpuCountRow.querySelectorAll('.count-btn').forEach(b =>
      b.classList.toggle('active', parseInt(b.dataset.c) === state.gpuCount)
    );

    if (state.gpuCount > 1) {
      const totalBW = Math.round(state.selectedGpu.bw * state.gpuCount * 0.80);
      multiGpuInfo.style.display = 'block';
      multiGpuInfo.innerHTML =
        `<strong>${state.gpuCount}×</strong> ${escapeHtml(state.selectedGpu.name)} · ` +
        `<strong>${total} GB</strong> VRAM · ~<strong>${totalBW} GB/s</strong> combined bandwidth`;
    } else {
      multiGpuInfo.style.display = 'none';
    }
  } else {
    selectedGpuRow.style.display = 'none';
    multiGpuSection.style.display = 'none';
    vramSlider.max = 80;
  }
  renderGpuGrid();
}

gpuCountRow.addEventListener('click', e => {
  const btn = e.target.closest('.count-btn');
  if (!btn) return;
  state.gpuCount = parseInt(btn.dataset.c);
  updateVramFromGpu();
  updateGpuUI();
});

// ── VRAM slider + presets ──────────────────────────────────────
vramSlider.addEventListener('input', () => {
  state.vram = parseInt(vramSlider.value);
  vramDisplay.textContent = state.vram;
  syncPresets();
});

vramPresets.addEventListener('click', e => {
  const btn = e.target.closest('.preset-btn');
  if (!btn) return;
  state.vram = parseInt(btn.dataset.v);
  vramSlider.value = state.vram;
  vramDisplay.textContent = state.vram;
  syncPresets();
});

function syncPresets() {
  vramPresets.querySelectorAll('.preset-btn').forEach(b =>
    b.classList.toggle('active', parseInt(b.dataset.v) === state.vram)
  );
}

// ── Use-case tabs ──────────────────────────────────────────────
usecaseTabs.addEventListener('click', e => {
  const btn = e.target.closest('.tab-item');
  if (!btn) return;
  state.usecase = btn.dataset.uc;
  state.activeBenchmark = null;  // reset benchmark when use case changes
  usecaseTabs.querySelectorAll('.tab-item').forEach(b =>
    b.classList.toggle('active', b === btn)
  );
  if (state.models.length) renderBenchmarkTabs();
});

// ── Sort bar ───────────────────────────────────────────────────
sortBar.addEventListener('click', e => {
  const btn = e.target.closest('.sort-btn');
  if (!btn) return;
  state.sort = btn.dataset.s;
  sortSel.value = state.sort;
  sortBar.querySelectorAll('.sort-btn').forEach(b =>
    b.classList.toggle('active', b === btn)
  );
  fetchModels();
});

quantSel.addEventListener('change', () => { state.quantization = quantSel.value; });
sortSel.addEventListener('change',  () => { state.sort = sortSel.value; syncSortBar(); });

function syncSortBar() {
  sortBar.querySelectorAll('.sort-btn').forEach(b =>
    b.classList.toggle('active', b.dataset.s === state.sort)
  );
}

// ── Benchmark ──────────────────────────────────────────────────
function computeOverallScore(benchmarks, usecase) {
  if (!benchmarks) return null;
  if (usecase === 'llm') {
    const w = { mmlu: 0.25, humaneval: 0.20, math: 0.20, gsm8k: 0.15, arc: 0.10, ifeval: 0.10 };
    let sum = 0, wsum = 0;
    for (const [k, weight] of Object.entries(w)) {
      if (benchmarks[k] != null) { sum += benchmarks[k] * weight; wsum += weight; }
    }
    return wsum >= 0.25 ? parseFloat((sum / wsum).toFixed(1)) : null;
  }
  const primary = { embed: 'mteb', vision: 'imagenet_top1', image: 'image_quality', audio: null };
  const pk = primary[usecase];
  return pk && benchmarks[pk] != null ? benchmarks[pk] : null;
}

function getBenchmarkScore(model, key, usecase) {
  if (!model.benchmarks) return null;
  if (key === 'overall') return computeOverallScore(model.benchmarks, usecase);
  return model.benchmarks[key] ?? null;
}

function benchmarkTier(score, key) {
  if (LOWER_IS_BETTER.has(key)) {
    return score <= 5 ? 'high' : score <= 12 ? 'med' : 'low';
  }
  return score >= 75 ? 'high' : score >= 55 ? 'med' : 'low';
}

function renderBenchmarkTabs() {
  const available = USE_CASE_BENCHMARKS[state.usecase] ?? [];
  if (!available.length || !state.models.length) {
    benchmarkBar.style.display = 'none';
    return;
  }
  benchmarkBar.style.display = 'flex';
  benchmarkTabs.innerHTML = [
    `<button class="bm-tab${!state.activeBenchmark ? ' active' : ''}" data-bm="">— none —</button>`,
    ...available.map(b =>
      `<button class="bm-tab${state.activeBenchmark === b.key ? ' active' : ''}"
               data-bm="${b.key}" title="${b.desc}">${b.label}</button>`
    ),
  ].join('');
}

benchmarkBar.addEventListener('click', e => {
  const btn = e.target.closest('.bm-tab');
  if (!btn) return;
  state.activeBenchmark = btn.dataset.bm || null;
  renderBenchmarkTabs();
  if (state.models.length) renderModels(state.models, state.vram);
});

// ── Latency estimation ─────────────────────────────────────────
function estimateLatency(model, gpu, gpuCount, usecase) {
  if (!model.estimatedVRAM || !gpu) return null;
  const eff = gpu.bw * gpuCount * (gpuCount > 1 ? 0.80 : 0.85);

  if (usecase === 'llm') {
    const tokPerSec = Math.round(eff / model.estimatedVRAM);
    const tier = tokPerSec >= 50 ? 'fast' : tokPerSec >= 15 ? 'medium' : 'slow';
    return { label: `~${tokPerSec} tok/s`, tier };
  } else if (usecase === 'image') {
    const sec = (20 * model.estimatedVRAM) / eff;
    const label = sec < 1 ? `~${(sec * 1000).toFixed(0)}ms/img` : `~${sec.toFixed(1)}s/img`;
    return { label, tier: sec < 3 ? 'fast' : sec < 10 ? 'medium' : 'slow' };
  } else if (usecase === 'video') {
    const sec = (50 * model.estimatedVRAM) / eff;
    const label = sec < 10 ? `~${sec.toFixed(1)}s` : `~${sec.toFixed(0)}s/clip`;
    return { label, tier: sec < 20 ? 'fast' : sec < 60 ? 'medium' : 'slow' };
  } else {
    const ms = (1000 * model.estimatedVRAM) / eff;
    const label = ms < 10 ? `<10ms` : ms < 1000 ? `~${ms.toFixed(0)}ms` : `~${(ms/1000).toFixed(1)}s`;
    return { label: `${label}/run`, tier: ms < 50 ? 'fast' : ms < 200 ? 'medium' : 'slow' };
  }
}

// ── Model Detail Modal ─────────────────────────────────────────
function openModal(modelId) {
  const model = state.models.find(m => m.id === modelId);
  if (!model) return;
  modalBody.innerHTML = renderModalContent(model);
  modalOverlay.classList.add('open');
  document.body.style.overflow = 'hidden';
}

function closeModal() {
  modalOverlay.classList.remove('open');
  document.body.style.overflow = '';
}

modalClose.addEventListener('click', closeModal);
modalOverlay.addEventListener('click', e => {
  if (e.target === modalOverlay) closeModal();
});
document.addEventListener('keydown', e => {
  if (e.key === 'Escape') closeModal();
});

// Click on a competitor card opens that model's modal
document.addEventListener('click', e => {
  const comp = e.target.closest('.competitor-card[data-id]');
  if (comp) openModal(comp.dataset.id);
});

function findCompetitors(model) {
  const candidates = state.models.filter(m => m.id !== model.id);
  const myScore = computeOverallScore(model.benchmarks, state.usecase);

  if (myScore !== null) {
    return candidates
      .map(m => ({ m, score: computeOverallScore(m.benchmarks, state.usecase) }))
      .filter(x => x.score !== null)
      .sort((a, b) => Math.abs(a.score - myScore) - Math.abs(b.score - myScore))
      .slice(0, 3)
      .map(x => x.m);
  }

  // Fallback: similar VRAM
  if (model.estimatedVRAM) {
    return candidates
      .filter(m => m.estimatedVRAM)
      .sort((a, b) =>
        Math.abs(a.estimatedVRAM - model.estimatedVRAM) -
        Math.abs(b.estimatedVRAM - model.estimatedVRAM)
      )
      .slice(0, 3);
  }
  return candidates.slice(0, 3);
}

function getDeploymentOptions(model) {
  return DEPLOYMENT_OPTIONS.filter(opt => {
    if (!opt.usecases.includes(state.usecase)) return false;
    if (opt.minVram && model.estimatedVRAM && model.estimatedVRAM < opt.minVram) return false;
    return true;
  });
}

function renderModalContent(model) {
  const latency = estimateLatency(model, state.selectedGpu, state.gpuCount, state.usecase);
  const competitors = findCompetitors(model);
  const deployOptions = getDeploymentOptions(model);
  const overallScore = computeOverallScore(model.benchmarks, state.usecase);
  const taskDesc = TASK_DESCRIPTIONS[model.pipeline] ?? `${model.task} model.`;

  // Format numbers
  const dlStr = model.downloads >= 1e6 ? `${(model.downloads/1e6).toFixed(1)}M`
    : model.downloads >= 1e3 ? `${(model.downloads/1e3).toFixed(0)}K` : `${model.downloads}`;
  const likeStr = model.likes >= 1e3 ? `${(model.likes/1e3).toFixed(0)}K` : `${model.likes}`;

  // Benchmark grid
  const benchDefs = (USE_CASE_BENCHMARKS[state.usecase] ?? []).filter(b => b.key !== 'overall');
  const benchCells = model.benchmarks
    ? benchDefs.map(b => {
        const val = model.benchmarks[b.key];
        if (val == null) return '';
        const tier = benchmarkTier(val, b.key);
        const pct  = LOWER_IS_BETTER.has(b.key) ? Math.max(0, 100 - val * 5) : val;
        const label = LOWER_IS_BETTER.has(b.key) ? `${val}%` : `${val.toFixed(1)}%`;
        return `
          <div class="bench-cell ${tier}">
            <div class="bench-cell-label">${b.label}</div>
            <div class="bench-cell-score">${label}</div>
            <div class="bench-cell-bar">
              <div class="bench-cell-bar-fill" style="width:${Math.min(pct,100).toFixed(1)}%"></div>
            </div>
          </div>`;
      }).join('')
    : '';

  // Competitor cards
  const competitorHtml = competitors.length
    ? competitors.map(c => {
        const cScore = computeOverallScore(c.benchmarks, state.usecase);
        const cVram  = c.estimatedVRAM ? `~${c.estimatedVRAM} GB` : 'VRAM ?';
        return `
          <div class="competitor-card" data-id="${escapeHtml(c.id)}">
            <div>
              <div class="competitor-name">${escapeHtml(c.name)}</div>
              <div class="competitor-meta">by ${escapeHtml(c.author)} · ${cVram}</div>
            </div>
            ${cScore !== null
              ? `<div class="competitor-score">${cScore.toFixed(1)}%</div>`
              : `<div class="competitor-score" style="color:var(--text-muted)">—</div>`}
          </div>`;
      }).join('')
    : `<div style="color:var(--text-muted);font-size:13px">Load more models to see alternatives.</div>`;

  // Deployment cards
  const deployHtml = deployOptions.map(opt => `
    <a class="deploy-card" href="${opt.url}" target="_blank" rel="noopener">
      <div class="deploy-name">${opt.name}</div>
      <div class="deploy-desc">${opt.desc}</div>
      <div class="deploy-tags">${opt.tags.map(t => `<span class="deploy-tag">${t}</span>`).join('')}</div>
    </a>`).join('');

  const gatedNote = model.gated
    ? `<span class="chip" style="background:#f59e0b18;border-color:#f59e0b;color:#f59e0b">🔒 Gated — access request required</span>`
    : '';

  return `
    <div class="modal-header">
      <div class="modal-title">${escapeHtml(model.name)}</div>
      <div class="modal-author">by <strong>${escapeHtml(model.author)}</strong></div>
      <div class="modal-badges">
        <span class="chip task">${escapeHtml(model.task)}</span>
        ${model.paramLabel ? `<span class="chip">${model.paramLabel} params</span>` : ''}
        ${gatedNote}
        ${overallScore !== null ? `<span class="chip" style="background:var(--accent-low);border-color:var(--accent);color:var(--accent-h)">★ ${overallScore.toFixed(1)}% overall</span>` : ''}
      </div>
    </div>

    <div class="modal-section">
      <div class="modal-section-title">Hardware Requirements</div>
      <div class="modal-stats-grid">
        <div class="modal-stat-card">
          <div class="modal-stat-label">Est. VRAM</div>
          <div class="modal-stat-value accent">${model.estimatedVRAM != null ? `${model.estimatedVRAM} GB` : '—'}</div>
        </div>
        <div class="modal-stat-card">
          <div class="modal-stat-label">Your Budget</div>
          <div class="modal-stat-value">${state.vram} GB</div>
        </div>
        ${model.estimatedVRAM != null ? `
        <div class="modal-stat-card">
          <div class="modal-stat-label">Utilization</div>
          <div class="modal-stat-value">${((model.estimatedVRAM / state.vram) * 100).toFixed(0)}%</div>
        </div>` : ''}
        ${model.paramLabel ? `
        <div class="modal-stat-card">
          <div class="modal-stat-label">Parameters</div>
          <div class="modal-stat-value">${model.paramLabel}</div>
        </div>` : ''}
      </div>
    </div>

    ${latency ? `
    <div class="modal-section">
      <div class="modal-section-title">Expected Latency on ${escapeHtml(state.selectedGpu.name)}${state.gpuCount > 1 ? ` ×${state.gpuCount}` : ''}</div>
      <div class="modal-stats-grid">
        <div class="modal-stat-card">
          <div class="modal-stat-label">Throughput</div>
          <div class="modal-stat-value accent">${latency.label}</div>
        </div>
        <div class="modal-stat-card">
          <div class="modal-stat-label">GPU Bandwidth</div>
          <div class="modal-stat-value">${Math.round(state.selectedGpu.bw * state.gpuCount * (state.gpuCount > 1 ? 0.80 : 0.85))} GB/s</div>
        </div>
      </div>
      <div style="margin-top:8px;font-size:11px;color:var(--text-muted)">
        Estimates based on memory-bandwidth-bound inference. Actual performance depends on context length, batch size, and driver version.
      </div>
    </div>` : ''}

    ${benchCells ? `
    <div class="modal-section">
      <div class="modal-section-title">Benchmark Scores</div>
      <div class="bench-grid">${benchCells}</div>
      <div style="margin-top:8px;font-size:11px;color:var(--text-muted)">
        Scores are approximate and sourced from model cards and published leaderboards. Evaluation setups vary.
      </div>
    </div>` : ''}

    <div class="modal-section">
      <div class="modal-section-title">What It's Good For</div>
      <div style="font-size:13px;color:var(--text-muted);line-height:1.6">${taskDesc}</div>
    </div>

    ${deployHtml ? `
    <div class="modal-section">
      <div class="modal-section-title">Deployment Options</div>
      <div class="deploy-grid">${deployHtml}</div>
    </div>` : ''}

    <div class="modal-section">
      <div class="modal-section-title">Similar Models</div>
      <div class="competitor-list">${competitorHtml}</div>
    </div>

    <div class="modal-footer">
      <a class="modal-btn modal-btn-primary" href="${model.url}" target="_blank" rel="noopener">
        ↗ View & Download on HuggingFace
      </a>
      <a class="modal-btn modal-btn-secondary" href="${model.url}/tree/main" target="_blank" rel="noopener">
        Browse Model Files
      </a>
    </div>`;
}

// ── Fetch models ───────────────────────────────────────────────
async function fetchModels() {
  if (state.loading) return;
  state.loading = true;
  searchBtn.disabled = true;
  searchBtn.textContent = 'Searching…';
  state.activeBenchmark = null;

  showSkeletons();
  resultsCount.innerHTML = 'Fetching models from HuggingFace…';
  sortBar.style.display = 'none';
  benchmarkBar.style.display = 'none';

  try {
    const params = new URLSearchParams({
      vram: state.vram, usecase: state.usecase,
      quantization: state.quantization, sort: state.sort, limit: 24,
    });

    const res = await fetch(`/api/models?${params}`);
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const data = await res.json();

    state.models = data.models ?? [];
    renderModels(state.models, state.vram);
    renderBenchmarkTabs();

    const count  = state.models.length;
    const qLabel = quantSel.options[quantSel.selectedIndex].text.split('—')[0].trim();
    const gpuLabel = state.selectedGpu
      ? ` on <strong>${state.gpuCount > 1 ? `${state.gpuCount}× ` : ''}${escapeHtml(state.selectedGpu.name)}</strong>`
      : '';
    resultsCount.innerHTML =
      `Found <strong>${count}</strong> model${count !== 1 ? 's' : ''} ` +
      `that fit in <strong>${state.vram} GB</strong> at <strong>${qLabel}</strong>${gpuLabel}`;
    sortBar.style.display = count ? 'flex' : 'none';
    syncSortBar();
  } catch (err) {
    console.error(err);
    modelGrid.innerHTML = `
      <div class="state-box">
        <div class="state-icon">⚠️</div>
        <div class="state-title">Something went wrong</div>
        <div class="state-desc">${err.message}<br/>Make sure the server is running.</div>
      </div>`;
    resultsCount.textContent = 'Error fetching data';
  } finally {
    state.loading = false;
    searchBtn.disabled = false;
    searchBtn.textContent = 'Find Models →';
  }
}

// ── Render helpers ─────────────────────────────────────────────
function renderModels(models, maxVram) {
  if (!models.length) {
    modelGrid.innerHTML = `
      <div class="state-box">
        <div class="state-icon">😕</div>
        <div class="state-title">No models found</div>
        <div class="state-desc">Try increasing VRAM, switching quantization, or a different use case.</div>
      </div>`;
    return;
  }

  // Sort by active benchmark if set
  let sorted = [...models];
  if (state.activeBenchmark) {
    sorted.sort((a, b) => {
      const aS = getBenchmarkScore(a, state.activeBenchmark, state.usecase);
      const bS = getBenchmarkScore(b, state.activeBenchmark, state.usecase);
      if (aS === null && bS === null) return 0;
      if (aS === null) return 1;
      if (bS === null) return -1;
      return LOWER_IS_BETTER.has(state.activeBenchmark) ? aS - bS : bS - aS;
    });
  }

  modelGrid.innerHTML = sorted.map((m, i) => modelCardHTML(m, maxVram, i + 1)).join('');
}

function modelCardHTML(m, maxVram, rank) {
  // VRAM badge
  let badgeClass = 'badge-gray', badgeLabel = 'VRAM ?', barPct = 0, barColor = '#6366f1';
  if (m.estimatedVRAM !== null) {
    const pct = Math.min((m.estimatedVRAM / maxVram) * 100, 100);
    barPct = pct;
    badgeLabel = `~${m.estimatedVRAM} GB`;
    if (pct <= 50)      { badgeClass = 'badge-green';  barColor = '#22c55e'; }
    else if (pct <= 80) { badgeClass = 'badge-yellow'; barColor = '#eab308'; }
    else                { badgeClass = 'badge-red';    barColor = '#ef4444'; }
  }

  // Stats
  const dlStr = m.downloads >= 1e6 ? `${(m.downloads/1e6).toFixed(1)}M`
    : m.downloads >= 1e3 ? `${(m.downloads/1e3).toFixed(0)}K` : `${m.downloads}`;
  const likeStr = m.likes >= 1e3 ? `${(m.likes/1e3).toFixed(0)}K` : `${m.likes}`;

  const paramStr  = m.paramLabel ? `<span class="chip">${m.paramLabel} params</span>` : '';
  const gatedIcon = m.gated ? `<span title="Gated model">🔒</span>` : '';

  // Latency
  const latency = estimateLatency(m, state.selectedGpu, state.gpuCount, state.usecase);
  const latencyHtml = latency
    ? `<div class="latency-chip ${latency.tier}">⚡ ${latency.label}</div>` : '';

  // Rank badge
  let rankHtml = '';
  if (state.activeBenchmark) {
    const score = getBenchmarkScore(m, state.activeBenchmark, state.usecase);
    if (score !== null) {
      const cls = rank === 1 ? 'rank-1' : rank === 2 ? 'rank-2' : rank === 3 ? 'rank-3' : 'rank-n';
      rankHtml = `<span class="rank-badge ${cls}">#${rank}</span>`;
    }
  }

  // Benchmark scores strip
  let benchHtml = '';
  if (m.benchmarks) {
    const defs = (USE_CASE_BENCHMARKS[state.usecase] ?? []).filter(b => b.key !== 'overall');
    const pills = defs.map(b => {
      const val = m.benchmarks[b.key];
      if (val == null) return '';
      const isActive = state.activeBenchmark === b.key ||
        (state.activeBenchmark === 'overall' && b.key === 'mmlu');
      const tier = benchmarkTier(val, b.key);
      const label = LOWER_IS_BETTER.has(b.key)
        ? `${b.label}: ${val}%`
        : `${b.label}: ${val.toFixed(1)}%`;
      const cls = isActive ? 'highlighted' : tier;
      return `<span class="bench-pill ${cls}">${label}</span>`;
    }).filter(Boolean).slice(0, 4);

    if (pills.length) benchHtml = `<div class="bench-row">${pills.join('')}</div>`;
  }

  // Tags
  const interestingTags = m.tags
    .filter(t => !['transformers','pytorch','safetensors','gguf','en'].includes(t))
    .slice(0, 3);
  const tagChips = interestingTags.map(t => `<span class="chip">${t}</span>`).join('');

  return `
  <div class="model-card" data-id="${escapeHtml(m.id)}" onclick="openModal('${escapeHtml(m.id)}')">
    <div class="card-top">
      <div>
        <div class="card-title">${escapeHtml(m.name)} ${gatedIcon}</div>
        <div class="card-author">by ${escapeHtml(m.author)}</div>
      </div>
      <div style="display:flex;gap:6px;align-items:flex-start;flex-shrink:0">
        ${rankHtml}
        <div class="card-badge ${badgeClass}">${badgeLabel}</div>
      </div>
    </div>

    ${m.estimatedVRAM !== null ? `
    <div class="vram-bar-wrap">
      <div class="vram-bar-label">
        <span>VRAM</span><span>${m.estimatedVRAM} / ${maxVram} GB</span>
      </div>
      <div class="vram-bar">
        <div class="vram-bar-fill" style="width:${barPct.toFixed(1)}%;background:${barColor}"></div>
      </div>
    </div>` : ''}

    ${benchHtml}

    <div class="card-meta">
      <span class="chip task">${escapeHtml(m.task)}</span>
      ${paramStr}${tagChips}
    </div>

    ${latencyHtml}

    <div class="card-stats">
      <div class="stat">⬇️ ${dlStr}</div>
      <div class="stat">❤️ ${likeStr}</div>
    </div>
  </div>`;
}

function showSkeletons() {
  modelGrid.innerHTML = Array.from({ length: 8 }).map(() => `
    <div class="skeleton-card">
      <div style="display:flex;justify-content:space-between;gap:8px">
        <div>
          <div class="skeleton" style="height:14px;width:140px;margin-bottom:6px"></div>
          <div class="skeleton" style="height:11px;width:80px"></div>
        </div>
        <div class="skeleton" style="height:22px;width:60px;border-radius:20px"></div>
      </div>
      <div><div class="skeleton" style="height:6px;width:100%;margin-bottom:8px"></div></div>
      <div style="display:flex;gap:5px">
        <div class="skeleton" style="height:18px;width:90px;border-radius:20px"></div>
        <div class="skeleton" style="height:18px;width:60px;border-radius:20px"></div>
      </div>
      <div style="display:flex;gap:14px;padding-top:10px;border-top:1px solid var(--border)">
        <div class="skeleton" style="height:11px;width:80px"></div>
        <div class="skeleton" style="height:11px;width:60px"></div>
      </div>
    </div>`).join('');
}

function escapeHtml(str = '') {
  return str.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
}

// ── Initialize ─────────────────────────────────────────────────
renderGpuGrid();
