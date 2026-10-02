#!/usr/bin/env python3
"""按 sample/D6/manifest.json 的 source_url 取回原始 PDF 并校验 sha256。

cninfo 的 CDN 会按 User-Agent 拦截：自定义 UA 会被 502 / SSL 断连，
因此这里用浏览器 UA（与宗博文 evaluation/D*/fetch_sources.py 一致）。
原始 PDF 不入库（团队规则：不二次分发原始文件）。
"""
from __future__ import annotations

import hashlib
import json
import os
import subprocess
import sys
import time

ROOT = os.path.dirname(os.path.abspath(__file__))
UA = ("Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 "
      "(KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36")


def sha256(data: bytes) -> str:
    return hashlib.sha256(data).hexdigest()


def main() -> int:
    manifest = json.load(open(os.path.join(ROOT, "manifest.json"), encoding="utf-8"))
    raw = os.path.join(ROOT, "raw")
    os.makedirs(raw, exist_ok=True)
    ok = fail = 0
    for i, s in enumerate(manifest["samples"]):
        dest = os.path.join(raw, s["case_id"] + ".pdf")
        if not os.path.exists(dest):
            if i:
                time.sleep(2.0)      # 团队数据规则：严格限速
            subprocess.run(["curl", "-sS", "-L", "--max-time", "60", "-A", UA,
                            "-o", dest, s["source_url"]], capture_output=True)
        if not os.path.exists(dest) or os.path.getsize(dest) == 0:
            print(f"[missing] {s['case_id']}")
            fail += 1
            continue
        got = sha256(open(dest, "rb").read())
        match = got == s["source_hash_sha256"]
        print(f"[{'ok' if match else 'BAD'}] {s['case_id']} {got}")
        ok += match
        fail += not match
    print(f"成功 {ok} / 失败 {fail}")
    return 1 if fail else 0


if __name__ == "__main__":
    raise SystemExit(main())
