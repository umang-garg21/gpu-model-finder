#!/usr/bin/env python3
"""
Orchestrate full ArtificialAnalysis scrape and merge in one command.

Usage examples:
  # dry-run (default)
  python3 scripts/automate_full_run.py --dry-run

  # run, attempt to attach to existing Chrome remote debugging or start Chrome
  python3 scripts/automate_full_run.py --start-chrome

  # provide explicit Chrome executable path
  python3 scripts/automate_full_run.py --start-chrome --chrome-path "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome"

This script will:
 1. Run `npm run fetch:aa` to refresh the model list.
 2. Ensure a Chrome remote-debugging endpoint is available (attach or start Chrome).
 3. Run `npm run fetch:intel` (Puppeteer scraper) using the remote endpoint.
 4. Run `npm run merge:intel` to update `data/models_artificialanalysis.json`.
 5. Optionally commit changes when `--commit` is provided and a git token is available.
"""
import argparse
import os
import shutil
import signal
import subprocess
import sys
import time
from pathlib import Path
import requests


ROOT = Path(__file__).resolve().parents[1]
DATA_DIR = ROOT / 'data'


def run(cmd, env=None, check=True, capture=False):
    print('RUN:', ' '.join(cmd) if isinstance(cmd, list) else cmd)
    r = subprocess.run(cmd, shell=isinstance(cmd, str), env=env or os.environ, capture_output=capture, text=True)
    if capture:
        return r.returncode, r.stdout, r.stderr
    if check and r.returncode != 0:
        raise RuntimeError(f'Command failed: {cmd} (exit {r.returncode})')
    return r.returncode


def wait_for_debugging(url='http://127.0.0.1:9222/json/version', timeout=30):
    start = time.time()
    while time.time() - start < timeout:
        try:
            r = requests.get(url, timeout=3)
            if r.ok:
                print('Remote debugging available')
                return True
        except Exception:
            pass
        time.sleep(1)
    return False


def start_chrome(chrome_path=None, user_data_dir='/tmp/puppeteer-chrome-profile'):
    # Try to start Chrome and return Popen or None
    # try explicit path first
    candidates = []
    if chrome_path:
        candidates.append(chrome_path)
    # macOS default Chrome path
    candidates.extend([
        '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
        '/Applications/Chromium.app/Contents/MacOS/Chromium'
    ])
    for candidate in candidates:
        try:
            if candidate and Path(candidate).exists():
                cmd = [candidate, f'--remote-debugging-port=9222', f'--user-data-dir={user_data_dir}', '--no-first-run']
                print('Starting Chrome:', ' '.join(cmd))
                p = subprocess.Popen(cmd, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
                return p
        except Exception:
            continue
    # fallback to macOS open -a if direct binary not found
    if sys.platform == 'darwin':
        cmd = ['open', '-a', 'Google Chrome', '--args', '--remote-debugging-port=9222', f'--user-data-dir={user_data_dir}']
        print('Launching Chrome via open -a (fallback)')
        subprocess.run(cmd)
        return None
    # on linux try google-chrome
    for candidate in ['/usr/bin/google-chrome', '/usr/bin/google-chrome-stable', '/usr/bin/chromium-browser', '/usr/bin/chromium']:
        if Path(candidate).exists():
            cmd = [candidate, f'--remote-debugging-port=9222', f'--user-data-dir={user_data_dir}', '--no-first-run']
            print('Starting Chrome:', ' '.join(cmd))
            p = subprocess.Popen(cmd, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
            return p
    print('No Chrome executable found to start')
    return None


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('--dry-run', action='store_true', help='Show steps but do not run network actions')
    ap.add_argument('--start-chrome', action='store_true', help='Start Chrome if remote debugging endpoint not present')
    ap.add_argument('--chrome-path', default=None, help='Explicit Chrome executable path')
    ap.add_argument('--new-only', action='store_true', help='Fetch only models not already present in local data')
    ap.add_argument('--timeout', type=int, default=60, help='Seconds to wait for remote debugging to appear')
    ap.add_argument('--commit', action='store_true', help='Commit and push updated data back to repo')
    args = ap.parse_args()

    try:
        if args.dry_run:
            print('DRY RUN: will run the following steps:')
            print(' 1) npm run fetch:aa')
            print(' 2) ensure Chrome remote debugging available (attach or start)')
            print(' 3) CHROME_REMOTE_URL=... CHROME_CONNECT_ONLY=1 npm run fetch:intel')
            print(' 4) npm run merge:intel')
            print(' 5) optional commit')
            return

        # 1) refresh model list
        env_run = os.environ.copy()
        if args.new_only:
            env_run['NEW_ONLY'] = '1'
        run(['npm', 'run', 'fetch:aa'], env=env_run)

        # 2) ensure remote debugging
        ready = wait_for_debugging(timeout=5)
        chrome_proc = None
        if not ready:
            if args.start_chrome:
                chrome_proc = start_chrome(args.chrome_path)
                print('waiting for remote debugging...')
                ready = wait_for_debugging(timeout=args.timeout)
            else:
                print('Remote debugging not available and --start-chrome not set; proceeding to let Puppeteer launch Chrome')

        if not ready:
            print('remote debugging not available; scraper will attempt to launch Chrome via Puppeteer')

        # 3) run scraper using remote connect if available
        env = os.environ.copy()
        if ready:
            env['CHROME_REMOTE_URL'] = 'http://127.0.0.1:9222'
            env['CHROME_CONNECT_ONLY'] = '1'
            # also hint Puppeteer with the Chrome path if we started one
            if 'chrome_proc' in locals() and chrome_proc:
                # prefer explicit path if available
                for pth in [args.chrome_path, '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', '/Applications/Chromium.app/Contents/MacOS/Chromium']:
                    if pth and Path(pth).exists():
                        env['CHROME_PATH'] = pth
                        break
        print('Running intelligence scraper...')
        run(['npm', 'run', 'fetch:intel'], env=env)

        # 4) merge
        print('Merging intelligence into models...')
        run(['npm', 'run', 'merge:intel'])

        # 4b) deduplicate / merge duplicate model entries
        print('Running dedupe/merge duplicate models script...')
        run(['node', 'scripts/merge_duplicate_models.js'])

        # 5) commit if requested
        if args.commit:
            print('Committing updated data...')
            run(['git', 'config', 'user.name', 'github-actions[bot]'])
            run(['git', 'config', 'user.email', '41898282+github-actions[bot]@users.noreply.github.com'])
            run(['git', 'add', 'data/models_artificialanalysis.json', 'data/artificialanalysis_intel_metrics.json'])
            run(['git', 'commit', '-m', 'chore: update ArtificialAnalysis intelligence metrics (automated)'], check=False)
            run(['git', 'push', 'origin', 'HEAD:main'], check=False)

        print('Done')

    finally:
        # cleanup chrome proc if we started one directly
        try:
            if 'chrome_proc' in locals() and chrome_proc and chrome_proc.poll() is None:
                print('Killing Chrome started by script')
                chrome_proc.send_signal(signal.SIGTERM)
        except Exception:
            pass


if __name__ == '__main__':
    main()
