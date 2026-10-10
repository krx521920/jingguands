#!/usr/bin/env python3
"""Download the public PDFs referenced by evaluation/D3/dev/manifest.json and verify SHA-256."""
from __future__ import annotations
import argparse, hashlib, json, urllib.request
from pathlib import Path
ROOT = Path(__file__).resolve().parent
MANIFEST = ROOT / 'dev' / 'manifest.json'
def sha256(data: bytes) -> str: return hashlib.sha256(data).hexdigest()
def main() -> int:
    ap=argparse.ArgumentParser(); ap.add_argument('--out', default=str(ROOT/'raw_pdfs')); ap.add_argument('--check-only', action='store_true'); args=ap.parse_args(); out=Path(args.out); out.mkdir(parents=True,exist_ok=True)
    manifest=json.loads(MANIFEST.read_text(encoding='utf-8')); failures=0
    for item in manifest['items']:
        target=out/f"{item['case_id']}.pdf"
        if target.exists(): data=target.read_bytes()
        elif args.check_only: print(f"[missing] {item['case_id']} {target}"); failures+=1; continue
        else:
            req=urllib.request.Request(item['source_url'],headers={'User-Agent':'Mozilla/5.0'}); data=urllib.request.urlopen(req,timeout=60).read(); target.write_bytes(data)
        actual=sha256(data); ok=actual==item['source_hash']; print(f"[{'ok' if ok else 'BAD'}] {item['case_id']} {actual}");
        if not ok: failures+=1
    return 1 if failures else 0
if __name__=='__main__': raise SystemExit(main())
