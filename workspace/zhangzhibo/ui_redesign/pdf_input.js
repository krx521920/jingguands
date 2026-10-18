"use strict";
const { spawn } = require('node:child_process');
const fs = require('node:fs/promises');
const os = require('node:os');
const path = require('node:path');
const ROOT = path.resolve(__dirname, '../../..');
let active = 0;
const fail = (status, message) => Object.assign(new Error(message), { status });

/** Parse a bounded PDF in a private temporary directory, without model credentials.
 * @param {object} input Base64 PDF and its display filename.
 * @returns {Promise<object>} Original evidence output with parse-stage duration.
 */
module.exports = async function parsePdf(input) {
  if (!input || typeof input.pdf_base64 !== 'string') throw fail(400, 'PDF 内容编码无效');
  if (input.pdf_base64.length > Math.ceil(20 * 1024 * 1024 / 3) * 4) throw fail(413, 'PDF 不得超过 20 MiB');
  const bytes = Buffer.from(input.pdf_base64, 'base64');
  if (bytes.length > 20 * 1024 * 1024) throw fail(413, 'PDF 不得超过 20 MiB');
  if (bytes.toString('base64') !== input.pdf_base64) throw fail(400, 'PDF 内容编码无效');
  if (bytes.length < 8 || !bytes.subarray(0, 5).equals(Buffer.from('%PDF-'))) throw fail(400, '文件不是 PDF');
  if (active >= 2) throw fail(429, '已有两份 PDF 正在解析，请稍后重试');
  active++;
  let temp;
  const started = performance.now();
  try {
    temp = await fs.mkdtemp(path.join(os.tmpdir(), 'finstruct-pdf-'));
    const file = path.join(temp, 'input.pdf');
    await fs.writeFile(file, bytes, { flag: 'wx', mode: 0o600 });
    const env = Object.fromEntries(Object.entries(process.env).filter(([key]) => !/KEY|SECRET|TOKEN|PASSWORD/i.test(key)));
    const output = await new Promise((resolve, reject) => {
      const child = spawn(process.env.FINSTRUCT_PYTHON || 'python', ['-I', '-B', path.join(ROOT, 'scripts/jingguan/parse_pdf.py'), file], { cwd: ROOT, env, windowsHide: true, stdio: ['ignore', 'pipe', 'pipe'] });
      let stdout = '', stderr = '', timedOut = false, tooLarge = false;
      child.stdout.setEncoding('utf8');
      child.stderr.setEncoding('utf8');
      const timer = setTimeout(() => { timedOut = true; child.kill(); }, 60000);
      child.stdout.on('data', chunk => { stdout += chunk.toString('utf8'); if (stdout.length > 32 * 1024 * 1024) { tooLarge = true; child.kill(); } });
      child.stderr.on('data', chunk => { stderr = (stderr + chunk).slice(-2000); });
      child.on('error', () => { clearTimeout(timer); reject(fail(503, 'Python 不可用，请设置 FINSTRUCT_PYTHON 并安装解析依赖')); });
      child.on('close', code => {
        clearTimeout(timer);
        if (timedOut) return reject(fail(504, 'PDF 解析超过 60 秒'));
        if (tooLarge) return reject(fail(413, 'PDF 解析内容过大'));
        if (code !== 0) return reject(fail(/ModuleNotFoundError/.test(stderr) ? 503 : 422, /ModuleNotFoundError/.test(stderr) ? '缺少 PDF 解析依赖，请安装 tools/finstruct-parser/requirements.txt' : 'PDF 无法解析、已加密或超过 200 页，请换用可读取文件'));
        resolve(stdout);
      });
    });
    const parse = JSON.parse(output);
    parse.doc.file_name = path.basename(String(input.file_name || 'announcement.pdf').replaceAll('\\', '/')).slice(0, 180);
    return { ok: true, parse, parse_ms: Math.round(performance.now() - started), bytes: bytes.length };
  } finally {
    if (temp) await fs.rm(temp, { recursive: true, force: true });
    active--;
  }
};
