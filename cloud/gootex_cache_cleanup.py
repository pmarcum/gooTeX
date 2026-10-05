#!/usr/bin/env python3
"""
gootex_cache_cleanup.py
───────────────────────
Monthly cache eviction script for GooTeX.
Deletes cache directories for documents not compiled in 90+ days.

Scheduled via crontab (adjust the paths to your own install):
  0 10 1 * * /home/<user>/gootex/venv/bin/python3 /home/<user>/gootex/gootex_cache_cleanup.py >> /home/<user>/gootex_cache_cleanup.log 2>&1

Run manually anytime:
  python3 ~/gootex/gootex_cache_cleanup.py

The cache location defaults to ~/gootex_cache (the service user's home) and can
be overridden with the GOOTEX_CACHE_BASE environment variable — keep it in sync
with the server's setting.
"""

import os, json, shutil, datetime

CACHE_BASE      = os.environ.get('GOOTEX_CACHE_BASE', os.path.expanduser('~/gootex_cache'))
MAX_AGE_DAYS    = 90
DRY_RUN         = False   # Set True to preview without deleting

def main():
    now     = datetime.datetime.utcnow()
    cutoff  = now - datetime.timedelta(days=MAX_AGE_DAYS)
    print(f"[{now.isoformat()}] GooTeX cache cleanup starting.")
    print(f"  Cache base:  {CACHE_BASE}")
    print(f"  Max age:     {MAX_AGE_DAYS} days (cutoff: {cutoff.date()})")
    print(f"  Dry run:     {DRY_RUN}")
    print()

    if not os.path.exists(CACHE_BASE):
        print("  Cache base does not exist. Nothing to do.")
        return

    total_size_freed = 0
    dirs_removed     = 0
    dirs_kept        = 0

    for doc_id in os.listdir(CACHE_BASE):
        cache_dir     = os.path.join(CACHE_BASE, doc_id)
        if not os.path.isdir(cache_dir): continue

        manifest_path = os.path.join(cache_dir, 'cache_manifest.json')
        last_compiled = None

        if os.path.exists(manifest_path):
            try:
                with open(manifest_path, 'r') as f:
                    manifest = json.load(f)
                last_str = manifest.get('last_compiled', '')
                if last_str:
                    last_compiled = datetime.datetime.fromisoformat(last_str)
            except Exception as e:
                print(f"  ⚠️  Could not read manifest for {doc_id}: {e}")

        # Fall back to directory modification time if no manifest
        if last_compiled is None:
            mtime = os.path.getmtime(cache_dir)
            last_compiled = datetime.datetime.utcfromtimestamp(mtime)

        age_days = (now - last_compiled).days

        if last_compiled < cutoff:
            # Calculate size before deletion
            dir_size = sum(
                os.path.getsize(os.path.join(cache_dir, f))
                for f in os.listdir(cache_dir)
                if os.path.isfile(os.path.join(cache_dir, f))
            )
            size_mb = dir_size / (1024 * 1024)
            print(f"  🗑️  EVICTING  {doc_id[:20]}...  "
                  f"last compiled {age_days} days ago  ({size_mb:.1f} MB)")
            if not DRY_RUN:
                shutil.rmtree(cache_dir, ignore_errors=True)
            total_size_freed += dir_size
            dirs_removed     += 1
        else:
            print(f"  ✅  KEEPING   {doc_id[:20]}...  "
                  f"last compiled {age_days} days ago")
            dirs_kept += 1

    freed_mb = total_size_freed / (1024 * 1024)
    print()
    print(f"  Summary: {dirs_removed} evicted ({freed_mb:.1f} MB freed), "
          f"{dirs_kept} kept.")
    print(f"[{datetime.datetime.utcnow().isoformat()}] Cleanup complete.")

if __name__ == "__main__":
    main()
