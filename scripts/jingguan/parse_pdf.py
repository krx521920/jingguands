"""Parse an uploaded local PDF with the team's preserved evidence parser."""
import json
from pathlib import Path
import sys

sys.path.insert(0, str(Path(__file__).resolve().parents[2] / 'tools/finstruct-parser/src'))
from finstruct.parse.parse_pdf import parse_pdf
from finstruct.parse.evidence import self_check
from pypdf import PdfReader

if len(PdfReader(sys.argv[1]).pages) > 200:
    raise ValueError('PDF exceeds the 200 page limit')
parsed = parse_pdf(sys.argv[1])
checks = self_check(parsed)
if not checks['ok']:
    raise ValueError('Parser output failed its evidence schema checks')
sys.stdout.buffer.write((json.dumps(parsed, ensure_ascii=False) + '\n').encode('utf-8'))
