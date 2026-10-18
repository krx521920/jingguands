# 原始 FinStruct PDF 解析器

[English](README.md) | 中文

此目录打包本机 2026-10-14 审计副本中的张智博原解析器。SOURCE.json 记录十个未修改 Python 模块的字节哈希。页面通过 scripts/jingguan/parse_pdf.py 调用；解析进程不接收模型或密钥。

安装 Python 3.10+，运行 `python -m pip install -r tools/finstruct-parser/requirements.txt`。可通过 FINSTRUCT_PYTHON 指定 Python 程序。HTTP 适配器限制 PDF 为 20 MiB、200 页，同时最多两个解析任务，超时 60 秒。扫描区域标为无法读取，未包含 OCR。
