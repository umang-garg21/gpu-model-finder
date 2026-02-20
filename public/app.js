/* ─────────────────────────────────────────────────────────────
   Bring Your Own Hardware — Frontend
   ───────────────────────────────────────────────────────────── */

// ── NVIDIA GPU data ────────────────────────────────────────────
// bw = memory bandwidth in GB/s (key metric for inference latency)
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

// ── State ──────────────────────────────────────────────────────
const state = {
  vram: 8,
  usecase: 'llm',
  quantization: 'fp16',
  sort: 'downloads',
  loading: false,
  models: [],
  selectedGpu: null,   // { name, vram, bw }
  gpuCount: 1,
  gpuTier: '50-series',
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
  const totalVram = state.selectedGpu.vram * state.gpuCount;
  state.vram = totalVram;
  vramSlider.max = Math.max(320, totalVram + 40);
  vramSlider.value = totalVram;
  vramDisplay.textContent = totalVram;
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
        `<strong>${total} GB</strong> VRAM · ` +
        `~<strong>${totalBW} GB/s</strong> combined bandwidth`;
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

// ── Multi-GPU count ────────────────────────────────────────────
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
  vramPresets.querySelectorAll('.preset-btn').forEach(b => {
    b.classList.toggle('active', parseInt(b.dataset.v) === state.vram);
  });
}

// ── Use-case tabs ──────────────────────────────────────────────
usecaseTabs.addEventListener('click', e => {
  const btn = e.target.closest('.tab-item');
  if (!btn) return;
  state.usecase = btn.dataset.uc;
  usecaseTabs.querySelectorAll('.tab-item').forEach(b =>
    b.classList.toggle('active', b === btn)
  );
});

// ── Sort bar (in results header) ───────────────────────────────
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
sortSel.addEventListener('change',  () => {
  state.sort = sortSel.value;
  syncSortBar();
});

function syncSortBar() {
  sortBar.querySelectorAll('.sort-btn').forEach(b =>
    b.classList.toggle('active', b.dataset.s === state.sort)
  );
}

// ── Latency estimation ─────────────────────────────────────────
// Memory-bandwidth-bound formula: throughput ≈ bandwidth / model_size
// This is the dominant bottleneck during transformer autoregressive inference.
function estimateLatency(model, gpu, gpuCount, usecase) {
  if (!model.estimatedVRAM || !gpu) return null;

  // Effective bandwidth with multi-GPU efficiency discount
  const eff = gpu.bw * gpuCount * (gpuCount > 1 ? 0.80 : 0.85);

  if (usecase === 'llm') {
    const tokPerSec = Math.round(eff / model.estimatedVRAM);
    const tier = tokPerSec >= 50 ? 'fast' : tokPerSec >= 15 ? 'medium' : 'slow';
    return { label: `~${tokPerSec} tok/s`, tier };

  } else if (usecase === 'image') {
    // Typical 20 denoising steps
    const sec = (20 * model.estimatedVRAM) / eff;
    const label = sec < 1
      ? `~${(sec * 1000).toFixed(0)}ms/img`
      : `~${sec.toFixed(1)}s/img`;
    const tier = sec < 3 ? 'fast' : sec < 10 ? 'medium' : 'slow';
    return { label, tier };

  } else if (usecase === 'video') {
    // ~50 steps for video diffusion
    const sec = (50 * model.estimatedVRAM) / eff;
    const label = sec < 10 ? `~${sec.toFixed(1)}s` : `~${sec.toFixed(0)}s/clip`;
    const tier = sec < 20 ? 'fast' : sec < 60 ? 'medium' : 'slow';
    return { label, tier };

  } else {
    // Audio, vision, embed — single forward pass
    const ms = (1000 * model.estimatedVRAM) / eff;
    const label = ms < 10 ? `<10ms` : ms < 1000
      ? `~${ms.toFixed(0)}ms`
      : `~${(ms / 1000).toFixed(1)}s`;
    const tier = ms < 50 ? 'fast' : ms < 200 ? 'medium' : 'slow';
    return { label: `${label}/run`, tier };
  }
}

// ── Fetch models ───────────────────────────────────────────────
async function fetchModels() {
  if (state.loading) return;
  state.loading = true;
  searchBtn.disabled = true;
  searchBtn.textContent = 'Searching…';

  showSkeletons();
  resultsCount.innerHTML = 'Fetching models from HuggingFace…';
  sortBar.style.display = 'none';

  try {
    const params = new URLSearchParams({
      vram:         state.vram,
      usecase:      state.usecase,
      quantization: state.quantization,
      sort:         state.sort,
      limit:        24,
    });

    const res = await fetch(`/api/models?${params}`);
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const data = await res.json();

    state.models = data.models ?? [];
    renderModels(state.models, state.vram);

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
        <div class="state-desc">${err.message}<br/>Make sure the server is running and you have an internet connection.</div>
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
        <div class="state-desc">
          Try increasing your VRAM budget, switching to a more aggressive quantization,
          or choosing a different use case.
        </div>
      </div>`;
    return;
  }
  modelGrid.innerHTML = models.map(m => modelCardHTML(m, maxVram)).join('');
}

function modelCardHTML(m, maxVram) {
  // VRAM badge
  let badgeClass = 'badge-gray';
  let badgeLabel = 'VRAM unknown';
  let barPct = 0;
  let barColor = '#6366f1';

  if (m.estimatedVRAM !== null) {
    const pct = Math.min((m.estimatedVRAM / maxVram) * 100, 100);
    barPct = pct;
    badgeLabel = `~${m.estimatedVRAM} GB`;
    if (pct <= 50) { badgeClass = 'badge-green'; barColor = '#22c55e'; }
    else if (pct <= 80) { badgeClass = 'badge-yellow'; barColor = '#eab308'; }
    else { badgeClass = 'badge-red'; barColor = '#ef4444'; }
  }

  // Stat formatting
  const dlStr = m.downloads >= 1e6
    ? `${(m.downloads / 1e6).toFixed(1)}M`
    : m.downloads >= 1e3
    ? `${(m.downloads / 1e3).toFixed(0)}K`
    : `${m.downloads}`;

  const likeStr = m.likes >= 1e3
    ? `${(m.likes / 1e3).toFixed(0)}K`
    : `${m.likes}`;

  const paramStr  = m.paramLabel ? `<span class="chip">${m.paramLabel} params</span>` : '';
  const gatedIcon = m.gated ? `<span title="Requires access request" style="font-size:12px">🔒</span>` : '';

  // Latency estimate (only when a GPU is selected)
  const latency = estimateLatency(m, state.selectedGpu, state.gpuCount, state.usecase);
  const latencyHtml = latency
    ? `<div class="latency-chip ${latency.tier}">⚡ ${latency.label}</div>`
    : '';

  // Tags — at most 4 non-trivial ones
  const interestingTags = m.tags
    .filter(t => !['transformers','pytorch','safetensors','gguf','en'].includes(t))
    .slice(0, 4);
  const tagChips = interestingTags.map(t => `<span class="chip">${t}</span>`).join('');

  return `
  <a class="model-card" href="${m.url}" target="_blank" rel="noopener">
    <div class="card-top">
      <div>
        <div class="card-title">${escapeHtml(m.name)} ${gatedIcon}</div>
        <div class="card-author">by ${escapeHtml(m.author)}</div>
      </div>
      <div class="card-badge ${badgeClass}">${badgeLabel}</div>
    </div>

    ${m.estimatedVRAM !== null ? `
    <div class="vram-bar-wrap">
      <div class="vram-bar-label">
        <span>VRAM usage</span>
        <span>${m.estimatedVRAM} / ${maxVram} GB</span>
      </div>
      <div class="vram-bar">
        <div class="vram-bar-fill" style="width:${barPct.toFixed(1)}%; background:${barColor}"></div>
      </div>
    </div>` : ''}

    <div class="card-meta">
      <span class="chip task">${escapeHtml(m.task)}</span>
      ${paramStr}
      ${tagChips}
    </div>

    ${latencyHtml}

    <div class="card-stats">
      <div class="stat">⬇️ ${dlStr} downloads</div>
      <div class="stat">❤️ ${likeStr} likes</div>
    </div>
  </a>`;
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
      <div>
        <div class="skeleton" style="height:5px;width:100%;margin-bottom:8px"></div>
      </div>
      <div style="display:flex;gap:5px">
        <div class="skeleton" style="height:18px;width:90px;border-radius:20px"></div>
        <div class="skeleton" style="height:18px;width:50px;border-radius:20px"></div>
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
