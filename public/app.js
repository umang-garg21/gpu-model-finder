/* ─────────────────────────────────────────────────────────────
   GPU Model Finder — Frontend
   ───────────────────────────────────────────────────────────── */

// ── State ──────────────────────────────────────────────────────
const state = {
  vram: 8,
  usecase: 'llm',
  quantization: 'fp16',
  sort: 'downloads',
  loading: false,
  models: [],
};

// ── DOM refs ───────────────────────────────────────────────────
const vramSlider    = document.getElementById('vramSlider');
const vramDisplay   = document.getElementById('vramDisplay');
const vramPresets   = document.getElementById('vramPresets');
const usecaseTabs   = document.getElementById('usecaseTabs');
const quantSel      = document.getElementById('quantization');
const sortSel       = document.getElementById('sortBy');
const searchBtn     = document.getElementById('searchBtn');
const modelGrid     = document.getElementById('modelGrid');
const resultsCount  = document.getElementById('resultsCount');
const sortBar       = document.getElementById('sortBar');

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

// Sync select → state
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

    const count = state.models.length;
    const qLabel = quantSel.options[quantSel.selectedIndex].text.split('—')[0].trim();
    resultsCount.innerHTML = `Found <strong>${count}</strong> model${count !== 1 ? 's' : ''} that fit in <strong>${state.vram} GB</strong> at <strong>${qLabel}</strong>`;
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

  const paramStr = m.paramLabel ? `<span class="chip">${m.paramLabel} params</span>` : '';
  const gatedIcon = m.gated ? `<span title="Requires access request" style="font-size:12px">🔒</span>` : '';

  // Render at most 4 non-trivial tags
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

// ── Auto-search on load (optional) ────────────────────────────
// Uncomment to fetch immediately on page load:
// window.addEventListener('DOMContentLoaded', fetchModels);
