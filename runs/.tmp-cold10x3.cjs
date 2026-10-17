// 宗④-①：R2 锁定的冷跑 10 份 × 3 轮（轮间无缓存；判据＝值层＋code_version 三轮逐字节一致＋每轮耗时）
const { execSync } = require('child_process')
const { readFileSync, writeFileSync, mkdirSync, rmSync } = require('fs')
const KEY = process.env.JINGGUAN_LLM_API_KEY
if (!KEY) { console.error('需要 JINGGUAN_LLM_API_KEY'); process.exit(2) }
const DOCS = [
  ['D4-PLD-001', 'pledge', 'corpus/zhangzhibo/d4/parse-official/D4-PLD-001.parse.json'],
  ['D4-PLD-002', 'pledge', 'corpus/zhangzhibo/d4/parse-official/D4-PLD-002.parse.json'],
  ['D4-PLD-003', 'pledge', 'corpus/zhangzhibo/d4/parse-official/D4-PLD-003.parse.json'],
  ['D4-PLD-004', 'pledge', 'corpus/zhangzhibo/d4/parse-official/D4-PLD-004.parse.json'],
  ['D5-EQC-001', 'equity_change', 'corpus/zhangzhibo/d5/parse-official/D5-EQC-001.parse.json'],
  ['D5-EQC-002', 'equity_change', 'corpus/zhangzhibo/d5/parse-official/D5-EQC-002.parse.json'],
  ['D5-EQC-003', 'equity_change', 'corpus/zhangzhibo/d5/parse-official/D5-EQC-003.parse.json'],
  ['D6-AWD-001', 'award_contract', 'corpus/zhangzhibo/d6/parse-official/D6-AWD-001.parse.json'],
  ['D6-AWD-002', 'award_contract', 'corpus/zhangzhibo/d6/parse-official/D6-AWD-002.parse.json'],
  ['D6-AWD-003', 'award_contract', 'corpus/zhangzhibo/d6/parse-official/D6-AWD-003.parse.json'],
]
const OUT = 'runs/R4-冷跑10x3-20261015'
mkdirSync(OUT, { recursive: true })
const valueLayer = env => JSON.stringify({
  code_version: env.run_meta?.code_version ?? null,
  events: (env.events ?? []).map(ev => Object.fromEntries(Object.entries(ev.fields ?? {})
    .map(([k, f]) => [k, { value: f.value ?? null, unit: f.unit ?? null, status: f.status }]))),
})
const results = []
for (const [doc, type, parse] of DOCS) {
  const rounds = []
  for (let r = 1; r <= 3; r++) {
    const dir = `${OUT}/${doc}/r${r}`
    rmSync(dir, { recursive: true, force: true })
    const t0 = Date.now()
    try {
      const out = execSync(`node scripts/jingguan/run_extract.mjs --parse ${parse} --event-type ${type} --no-cache --out-dir "${dir}"`, { encoding: 'utf8', env: process.env, timeout: 300_000 })
      const m = [...out.matchAll(/\[输出\]\s*(\S+events\.json)/g)].pop()
      const env = JSON.parse(readFileSync(m[1], 'utf8'))
      rounds.push({ round: r, ms: Date.now() - t0, value: valueLayer(env), run_id: env.run_id, errors: env.run_meta?.errors?.length ?? 0 })
    } catch (e) {
      rounds.push({ round: r, ms: Date.now() - t0, error: String(e.message).slice(0, 120) })
    }
  }
  const ok = rounds.length === 3 && rounds.every(r => r.value) && rounds[0].value === rounds[1].value && rounds[1].value === rounds[2].value
  results.push({ doc, type, byte_identical_3rounds: ok, rounds: rounds.map(r => ({ round: r.round, ms: r.ms, run_id: r.run_id, errors: r.errors, error: r.error ?? null })) })
  console.log(`${ok ? '✓' : '✗'} ${doc}：三轮逐字节${ok ? '一致' : '不一致'}｜耗时 ${rounds.map(r => r.ms + 'ms').join('/')}｜错误 ${rounds.map(r => r.errors ?? '-').join('/')}${ok ? '' : ' ' + JSON.stringify(rounds.map(r => r.error ?? r.value?.slice(0, 40)))}`)
}
const all = results.every(r => r.byte_identical_3rounds)
writeFileSync(`${OUT}/结果.json`, JSON.stringify({ ran_on: new Date().toISOString(), criterion: 'R2 锁定：轮间无缓存，比对＝值层＋code_version 逐字节；10 份×3 轮', all_pass: all, results }, null, 1))
console.log(`\n[汇总] ${results.filter(r => r.byte_identical_3rounds).length}/10 三轮逐字节一致｜判定=${all ? 'PASS' : 'FAIL'}｜报告 ${OUT}/结果.json`)
process.exit(all ? 0 : 1)
