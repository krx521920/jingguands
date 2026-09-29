"""按 manifest 里的 source_url 取回三份原始公告 PDF。

## 为什么不在仓库里放 PDF

团队数据规则写着「不二次分发原始文件」，而本仓库是**公开仓库**。
宗博文的 fixture 也采用同样做法：只保留 source_url + source_hash。
所以原始 PDF 由本脚本按需取回，取回后校验 sha256 是否与 manifest 记录一致。

## 用法

    python fetch_samples.py                    # 取到 ./raw/
    python fetch_samples.py --verify-only      # 只校验已有文件

取回后跑：

    在仓库根目录：
        set PYTHONPATH=src
        python -m finstruct.parse.parse_pdf sample\\D2\\raw\\pledge-001.pdf -o sample\\D2\\parse\\pledge-001.parse.json

## 合规

- 只取公开披露文件，不绕过任何技术保护措施
- 请求间隔 ≥2 秒（团队规则：严格限速）
- 仅取本 manifest 列出的 3 份，不做批量回补
"""
from __future__ import annotations

import argparse
import hashlib
import json
import os
import sys
import time
import urllib.request

HERE = os.path.dirname(os.path.abspath(__file__))
MANIFEST = os.path.join(HERE, "manifest.json")
RAW_DIR = os.path.join(HERE, "raw")
UA = "jingguands-competition-research/0.1 (D2 parse deliverable)"
SLEEP_SEC = 2.0


def sha256_file(path: str) -> str:
    h = hashlib.sha256()
    with open(path, "rb") as fh:
        for chunk in iter(lambda: fh.read(1 << 20), b""):
            h.update(chunk)
    return h.hexdigest()


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--verify-only", action="store_true", help="只校验已存在的文件")
    ap.add_argument("--raw-dir", default=RAW_DIR)
    args = ap.parse_args()

    manifest = json.load(open(MANIFEST, encoding="utf-8"))
    os.makedirs(args.raw_dir, exist_ok=True)

    ok = True
    for i, s in enumerate(manifest["samples"]):
        name = os.path.basename(s["parse_file"]).replace(".parse.json", "")
        dest = os.path.join(args.raw_dir, name + ".pdf")
        want = s["source_hash_sha256"]

        if not os.path.exists(dest) and not args.verify_only:
            if i:
                time.sleep(SLEEP_SEC)
            print(f"  下载 {name}: {s['source_url']}")
            req = urllib.request.Request(s["source_url"], headers={"User-Agent": UA})
            with urllib.request.urlopen(req, timeout=60) as r, open(dest, "wb") as out:
                out.write(r.read())

        if not os.path.exists(dest):
            print(f"  ✗ {name}: 文件不存在")
            ok = False
            continue

        got = sha256_file(dest)
        mark = "✓" if got == want else "✗"
        if got != want:
            ok = False
        print(f"  {mark} {name}.pdf  {os.path.getsize(dest)/1024:.0f} KB  sha256={got[:16]}…")

    print()
    print("全部校验通过 ✓" if ok else "有文件校验失败 ✗")
    return 0 if ok else 1


if __name__ == "__main__":
    raise SystemExit(main())
