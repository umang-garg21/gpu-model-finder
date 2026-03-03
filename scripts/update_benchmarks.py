#!/usr/bin/env python3
"""
update_benchmarks.py
────────────────────
Fetches benchmark scores from public HuggingFace leaderboard datasets and writes
data/benchmark_overrides.json.  server.js reads this file at startup and merges
the scores on top of the hardcoded BENCHMARK_DATA, so fresh numbers win without
requiring a full code deployment.

Sources
  - Open LLM Leaderboard v2  (LLM: IFEval, GPQA, MATH, BBH, MUSR, MMLU-Pro, …)
  - Open VLM Leaderboard      (VLM: MMMU, TextVQA, DocVQA, MMBench, …)
  - MTEB Leaderboard          (Embeddings: MTEB avg across tasks)

Run manually:    python scripts/update_benchmarks.py
Auto-run weekly: .github/workflows/update-benchmarks.yml (GitHub Actions cron)

Requirements:    pip install requests
"""

import json
import os
import sys
import time

try:
    import requests
except ImportError:
    print("ERROR: 'requests' not installed. Run: pip install requests")
    sys.exit(1)

ROOT   = os.path.join(os.path.dirname(os.path.abspath(__file__)), '..')
OUTPUT = os.path.join(ROOT, 'data', 'benchmark_overrides.json')

HF_API = 'https://datasets-server.huggingface.co/rows'
HEADERS = {'User-Agent': 'gpu-model-finder-benchmark-updater/1.0'}


# ── helpers ────────────────────────────────────────────────────


def _get(url, params, timeout=30):
    try:
        r = requests.get(url, params=params, headers=HEADERS, timeout=timeout)
        if r.status_code == 200:
            return r.json()
        print(f"  [warn] HTTP {r.status_code} for {url} params={params}")
    except Exception as e:
        print(f"  [error] {e}")
    return None


def fetch_rows(dataset, config='default', split='train', max_rows=10_000, batch=100):
    """Page through a HF dataset returning all row dicts up to max_rows."""
    all_rows = []
    offset = 0
    while offset < max_rows:
        data = _get(HF_API, {
            'dataset': dataset, 'config': config, 'split': split,
            'offset': offset, 'length': min(batch, max_rows - offset),
        })
        if not data:
            break
        rows = [r['row'] for r in data.get('rows', [])]
        if not rows:
            break
        all_rows.extend(rows)
        total = data.get('num_rows_total', len(all_rows))
        offset += len(rows)
        if offset >= total:
            break
        time.sleep(0.25)   # be polite to HF servers
    print(f"  fetched {len(all_rows)} rows from {dataset}")
    return all_rows


# ── Open LLM Leaderboard v2 ────────────────────────────────────

# Maps dataset column names → our internal benchmark keys
LLM_COL_MAP = {
    'IFEval':              'ifeval',
    'ifeval_strict_acc':   'ifeval',
    'BBH':                 'bbh',
    'MATH Lvl 5':          'math',
    'MATH':                'math',
    'GPQA':                'gpqa',
    'gpqa_diamond':        'gpqa',
    'MUSR':                'musr',
    'MMLU-PRO':            'mmlu_pro',
    'HumanEval':           'humaneval',
    'GSM8K':               'gsm8k',
    'MMLU':                'mmlu',
    'ARC':                 'arc',
}
# Model ID column names to try (the leaderboard has changed names over versions)
LLM_ID_COLS = ['fullname', 'model_name_for_query', 'model']


def fetch_open_llm_leaderboard(overrides):
    print("Fetching Open LLM Leaderboard v2 …")
    rows = fetch_rows('open-llm-leaderboard/contents', max_rows=20_000)
    count = 0
    for row in rows:
        model_id = next((row[c] for c in LLM_ID_COLS if row.get(c)), None)
        if not model_id or '/' not in str(model_id):
            continue
        entry = {}
        for col, key in LLM_COL_MAP.items():
            v = row.get(col)
            if isinstance(v, (int, float)) and v > 0:
                # Only overwrite if this is a higher score than what we have
                existing = entry.get(key, 0)
                entry[key] = round(max(float(v), existing), 1)
        if entry:
            overrides.setdefault(model_id, {}).update(entry)
            count += 1
    print(f"  → {count} LLM model entries updated")


# ── Open VLM Leaderboard ────────────────────────────────────────

VLM_COL_MAP = {
    'MMMU_VAL':          'mmmu',
    'MMBench_DEV_EN':    'mmbench',
    'TextVQA_VAL':       'textvqa',
    'DocVQA_VAL':        'docvqa',
    'MMMU':              'mmmu',
    'TextVQA':           'textvqa',
    'DocVQA':            'docvqa',
    'MMBench':           'mmbench',
    'AI2D':              'ai2d',
    'ChartQA':           'chartqa',
    'MMStar':            'mmstar',
}
VLM_ID_COLS = ['model_link', 'model_name', 'model']


def _normalize_model_id(raw):
    """Strip HF URL prefix to get org/repo format."""
    if raw and raw.startswith('https://huggingface.co/'):
        return raw[len('https://huggingface.co/'):]
    return raw


def fetch_open_vlm_leaderboard(overrides):
    print("Fetching Open VLM Leaderboard …")
    rows = fetch_rows('opencompass/open_vlm_leaderboard', max_rows=5_000)
    count = 0
    for row in rows:
        raw_id = next((row.get(c) for c in VLM_ID_COLS if row.get(c)), None)
        model_id = _normalize_model_id(raw_id)
        if not model_id or '/' not in str(model_id):
            continue
        entry = {}
        for col, key in VLM_COL_MAP.items():
            v = row.get(col)
            if isinstance(v, (int, float)) and v > 0:
                existing = entry.get(key, 0)
                entry[key] = round(max(float(v), existing), 1)
        if entry:
            overrides.setdefault(model_id, {}).update(entry)
            count += 1
    print(f"  → {count} VLM model entries updated")


# ── MTEB Leaderboard ────────────────────────────────────────────

MTEB_ID_COLS  = ['model_name', 'model', 'name']
MTEB_AVG_COLS = ['mean_accuracy', 'average_score', 'score', 'main_score']


def fetch_mteb(overrides):
    """Aggregate task scores per model and compute a rough average."""
    print("Fetching MTEB results …")
    rows = fetch_rows('mteb/mteb_results', max_rows=50_000, batch=100)
    aggregates = {}   # model_id -> list of scores
    for row in rows:
        model_id = next((row.get(c) for c in MTEB_ID_COLS if row.get(c)), None)
        if not model_id or '/' not in str(model_id):
            continue
        score = next((row.get(c) for c in MTEB_AVG_COLS
                      if isinstance(row.get(c), (int, float))), None)
        if score and 0 < score <= 100:
            aggregates.setdefault(model_id, []).append(float(score))
    count = 0
    for mid, vals in aggregates.items():
        mean = round(sum(vals) / len(vals), 1)
        overrides.setdefault(mid, {})['mteb'] = mean
        count += 1
    print(f"  → {count} embedding model entries updated")


# ── main ────────────────────────────────────────────────────────


def main():
    print("=== BYOG Benchmark Updater ===\n")
    overrides = {}

    fetch_open_llm_leaderboard(overrides)
    fetch_open_vlm_leaderboard(overrides)
    fetch_mteb(overrides)

    # Drop completely empty entries (safety)
    overrides = {k: v for k, v in overrides.items() if v}

    os.makedirs(os.path.join(ROOT, 'data'), exist_ok=True)
    with open(OUTPUT, 'w', encoding='utf-8') as f:
        json.dump(overrides, f, indent=2, ensure_ascii=False)

    print(f"\n✅  Wrote {len(overrides)} model entries → {OUTPUT}")
    print("    Restart server.js (or redeploy) to pick up fresh scores.")


if __name__ == '__main__':
    main()
