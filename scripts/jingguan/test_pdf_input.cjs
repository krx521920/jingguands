const assert = require('node:assert/strict');
const { test } = require('node:test');
const { readFileSync } = require('node:fs');
const { resolve } = require('node:path');
const { createHash } = require('node:crypto');
const parsePdf = require('../../workspace/zhangzhibo/ui_redesign/pdf_input.js');
const file = resolve(__dirname, '../../scripts/jingguan/fixtures/parser-two-page.pdf');
test('synthetic PDF bytes become schema-checked source blocks and safe display filename', async () => {
  const bytes = readFileSync(file);
  const result = await parsePdf({ pdf_base64: bytes.toString('base64'), file_name: '../../公告.pdf' });
  assert.equal(result.parse.doc.file_name, '公告.pdf');
  assert.equal(result.parse.doc.file_sha256, createHash('sha256').update(bytes).digest('hex'));
  assert.equal(result.parse.pages.length, 2);
  assert(result.parse.pages.flatMap(p => p.blocks).some(b => b.text_raw.includes('84,680,000')));
  assert(result.parse_ms > 0);
});
for (const [label, input, status] of [
  ['missing body', null, 400], ['bad base64', { pdf_base64: '?' }, 400],
  ['non-PDF', { pdf_base64: Buffer.from('not a PDF').toString('base64') }, 400],
  ['oversize', { pdf_base64: Buffer.alloc(20 * 1024 * 1024 + 1).toString('base64') }, 413],
  ['broken PDF', { pdf_base64: Buffer.from('%PDF-1.7\ninvalid').toString('base64') }, 422],
]) test(label + ' fails without a model request', async () => { await assert.rejects(parsePdf(input), { status }); });
