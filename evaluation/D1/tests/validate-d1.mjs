#!/usr/bin/env node
import fs from 'node:fs'
import path from 'node:path'

const root = path.resolve(import.meta.dirname, '..')
const manifest = JSON.parse(fs.readFileSync(path.join(root, 'dev/manifest.json'), 'utf8'))
const errors = []
const summary = { samples: 0, fields: 0, confirmed: 0, notDisclosed: 0, notApplicable: 0, evidenceBearing: 0, boundaryChecks: 0, semanticChecks: 0 }

for (const item of manifest.items) {
  const raw = JSON.parse(fs.readFileSync(path.join(root, 'dev', item.raw), 'utf8'))
  const gold = JSON.parse(fs.readFileSync(path.join(root, 'dev', item.gold), 'utf8'))
  summary.samples += 1
  if (raw.case_id !== item.case_id || gold.case_id !== item.case_id) errors.push(item.case_id + ': case_id mismatch')
  if (gold.event_type !== item.event_type) errors.push(item.case_id + ': event_type mismatch')
  if (raw.source_status !== 'public_cninfo') errors.push(item.case_id + ': D1 fixture must identify public_cninfo source')
  if (!/^https:\/\/static\.cninfo\.com\.cn\//.test(raw.source_url || '')) errors.push(item.case_id + ': source_url must use static.cninfo.com.cn')
  if (!/^[a-f0-9]{64}$/.test(raw.source_hash || '')) errors.push(item.case_id + ': source_hash must be a SHA-256 hex digest')
  if (gold.source_hash !== raw.source_hash) errors.push(item.case_id + ': source hash mismatch')
  for (const [field, value] of Object.entries(gold.fields)) {
    summary.fields += 1
    if (value.status === 'confirmed') {
      summary.confirmed += 1
      if (!Array.isArray(value.evidence) || value.evidence.length === 0) errors.push(item.case_id + '.' + field + ': confirmed without evidence')
      else summary.evidenceBearing += 1
    }
    if (value.status === 'not_disclosed') summary.notDisclosed += 1
    if (value.status === 'not_applicable') summary.notApplicable += 1
    for (const evidence of value.evidence ?? []) {
      if (!evidence.document_id || !Number.isInteger(evidence.page) || !evidence.excerpt) errors.push(item.case_id + '.' + field + ': invalid evidence')
    }
  }
}

const award = JSON.parse(fs.readFileSync(path.join(root, 'dev/gold/award-001.answer.json'), 'utf8'))
const check = (condition, message) => { summary.boundaryChecks += 1; if (!condition) errors.push(message) }
check(award.fields.award_status.value === 'contract_signed', 'public award fixture must remain contract_signed')
check(award.fields.contract_signed.value === true, 'public award fixture must record the signed contract')
check(award.fields.recognized_revenue.status === 'not_applicable', 'award must not recognize revenue')
check(award.fields.price_adjustment_status.status === 'not_disclosed', 'undisclosed adjustment must remain not_disclosed')
check(award.fields.formal_award_notice_received.status === 'not_disclosed', 'formal award notice receipt must remain not_disclosed')
const pledgeGold = JSON.parse(fs.readFileSync(path.join(root, 'dev/gold/pledge-001.answer.json'), 'utf8'))
summary.semanticChecks += 3
if (pledgeGold.fields.pledged_shares_current_components.value.length !== 3) errors.push('pledge components must contain three rows')
if (pledgeGold.fields.pledged_shares_current_total.value !== 7800000) errors.push('pledge current total must equal 7800000')
if (!pledgeGold.fields.current_pledge_ratio_of_pledgor_holdings_pct || !pledgeGold.fields.current_pledge_ratio_of_total_share_capital_pct) errors.push('pledge ratio fields must use explicit denominator names')

const result = { status: errors.length === 0 ? 'PASS' : 'FAIL', ...summary, errors }
fs.mkdirSync(path.join(root, 'evidence'), { recursive: true })
fs.writeFileSync(path.join(root, 'evidence/validation-summary.json'), JSON.stringify(result, null, 2) + '\n', 'utf8')
console.log(JSON.stringify(result, null, 2))
if (errors.length) process.exit(1)
