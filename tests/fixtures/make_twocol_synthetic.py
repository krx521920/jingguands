"""重新生成双栏 fixture PDF（twocol_synthetic.pdf）。

fixture 是**合成**的：为了让分栏检测有可断言的靶子，正文明确写着「左栏第 N 段 /
右栏第 N 段」，正确阅读顺序因此是确定的。**不是真实公告，不得当评测数据。**

为什么必须自己造：现有四份真实文档全是单栏（实测 14 页零栏缝），
没有正例就无法验证分栏检测 —— 只能验证它不误报。

用法（仅在需要改动 fixture 时跑；PDF 已入库，测试不依赖本脚本）：
    python tests/fixtures/make_twocol_synthetic.py

需要本机有 Microsoft Edge；它 headless 打完 PDF 后不会自己退出，脚本会主动终止。
"""
from __future__ import annotations

import os
import subprocess
import sys
import time

HERE = os.path.dirname(os.path.abspath(__file__))
HTML = os.path.join(HERE, "twocol_synthetic.html")
PDF = os.path.join(HERE, "twocol_synthetic.pdf")
EDGE = "/Applications/Microsoft Edge.app/Contents/MacOS/Microsoft Edge"


def main() -> int:
    if not os.path.exists(EDGE):
        print(f"找不到 Edge：{EDGE}", file=sys.stderr)
        return 2
    profile = os.path.join(HERE, ".edge-profile")
    proc = subprocess.Popen(
        [
            EDGE,
            "--headless=new",
            "--disable-gpu",
            "--no-sandbox",
            f"--user-data-dir={profile}",
            "--no-pdf-header-footer",
            f"--print-to-pdf={PDF}",
            HTML,
        ],
        stdout=subprocess.DEVNULL,
        stderr=subprocess.DEVNULL,
    )
    # Edge 打完 PDF 后不会自己退出，轮询文件出现即视为完成
    for _ in range(60):
        time.sleep(0.5)
        if os.path.exists(PDF) and os.path.getsize(PDF) > 5000:
            break
    proc.terminate()
    try:
        proc.wait(timeout=10)
    except subprocess.TimeoutExpired:
        proc.kill()
    print(f"已生成 {PDF}（{os.path.getsize(PDF)} 字节）")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
