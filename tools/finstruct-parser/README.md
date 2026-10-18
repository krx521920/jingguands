# Original FinStruct PDF parser

English | [中文](README.zh.md)

This folder packages the original Zhang Zhibo parser from the local 2026-10-14 audit copy. SOURCE.json records byte hashes of the ten unmodified Python modules. The browser invokes it through scripts/jingguan/parse_pdf.py; no model or credential is passed to the parser process.

Install Python 3.10+ and run `python -m pip install -r tools/finstruct-parser/requirements.txt`. Set FINSTRUCT_PYTHON to select a non-default executable. The HTTP adapter limits PDFs to 20 MiB and 200 pages, two active parsers and a 60-second timeout. Scanned regions are marked unreadable; OCR is not included.
