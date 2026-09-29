#!/usr/bin/env node
/**
 * Gold 一致性机检（D3 审计）：宗博文的 Gold 答案 vs 其自带原文。
 * 契约硬规则（他自己冻结的）：extracted 字段的 quote 必须是原文子串。
 *
 * 判定分级：
 *   OK               —— quote 命中原文，或值以原文形态出现（含标准化合法项）
 *   GOLD_NO_QUOTE    —— 标准化值（CNY/true/ISO日期/枚举）合法，但 gold 未给出可命中的 quote（小瑕疵）
 *   GOLD_UNSUPPORTED —— quote 与值在原文中均不存在（硬伤：无法评分依据）
 * 用法：node scripts/jingguan/check_gold.mjs
 */
import { readFileSync, existsSync } from 'node:fs'
import { resolve, join } from 'node:path'

const REPO_ROOT = resolve(import.meta.dirname, '..', '..')
const DEV = join(REPO_ROOT, 'corpus/zongbowen/dev')
const manifest = JSON.parse(readFileSync(join(DEV, 'manifest.json'), 'utf8'))

let hard = 0, minor = 0, ok = 0
for (const item of manifest.items) {
  const raw = JSON.parse(readFileSync(join(DEV, item.raw), 'utf8'))
  const text = (raw.pages ?? []).map((p) => p.text).join('\n')
  const gold = JSON.parse(readFileSync(join(DEV, item.gold), 'utf8'))
  console.log(`===== ${item.case_id} =====`)
  for (const [name, fv] of Object.entries(gold.events?.[0]?.fields ?? {})) {
    if (fv.status !== 'extracted') continue
    const quote = fv.provenance?.[0]?.quote ?? ''
    const quoteHit = quote.length > 0 && text.includes(quote)
    const valueHit = fv.value !== null && text.includes(String(fv.value))
    // ISO 日期逆推中文形态对原文（"2026-09-03" ↔ "2026年9月3日"），捕捉错值
    const iso = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(fv.value))
    const dateHit = iso !== null && text.includes(`${Number(iso[1])}年${Number(iso[2])}月${Number(iso[3])}日`)
    // 标准化形态：单位映射(CNY)/布尔(true)/英文枚举——值不现身原文属正常
    const normalizedShape = /^(CNY|true|false|increase|decrease)$/.test(String(fv.value))
      || /^[\d.]+e?\+?\d*$/.test(String(fv.value)) // 大数值标准化
    if (quoteHit || valueHit || dateHit) { ok++; continue }
    if (normalizedShape || iso !== null) {
      minor++
      console.log(`  GOLD_NO_QUOTE  ${name}: gold=${JSON.stringify(fv.value)}${iso !== null ? '（ISO日期在原文无对应中文日期——疑似错值）' : '（标准化值合法，quote 未命中原文）'}`)
      continue
    }
    hard++
    console.log(`  GOLD_UNSUPPORTED ${name}: gold=${JSON.stringify(fv.value)}，quote与值均不在原文`)
  }
}
console.log(`\n[汇总] 可支撑 ${ok}；quote小瑕疵 ${minor}；不可支撑（硬伤） ${hard}`)
process.exit(hard > 0 ? 1 : 0)
