import fs from 'node:fs';
import path from 'node:path';

const root = path.resolve(import.meta.dirname, '..');
const manifest = JSON.parse(fs.readFileSync(path.join(root, 'dev', 'manifest.json'), 'utf8'));
const diffs = [];
let matched = 0;
let documents = 0;
const valueKey = (name, fv) => name === 'change_shares' && typeof fv?.value === 'number' ? Math.abs(fv.value) : fv?.value;
const eventKey = (event) => [event.fields.holder?.value, event.fields.direction?.value, event.fields.shares_before?.value].join('|');

for (const item of manifest.items) {
  const upstreamPath = path.join(root, 'evidence', 'upstream', `${item.case_id}.upstream.json`);
  if (!fs.existsSync(upstreamPath)) continue;
  documents++;
  const gold = JSON.parse(fs.readFileSync(path.join(root, 'dev', item.gold), 'utf8'));
  const upstream = JSON.parse(fs.readFileSync(upstreamPath, 'utf8'));
  const upstreamMap = new Map((upstream.events ?? []).map((event) => [eventKey(event), event]));
  for (const goldEvent of gold.events) {
    const upstreamEvent = upstreamMap.get(eventKey(goldEvent));
    if (!upstreamEvent) {
      diffs.push({ case_id:item.case_id, event_id:goldEvent.event_id, field:'event', reason:'missing upstream event' });
      continue;
    }
    matched++;
    for (const [name, goldField] of Object.entries(goldEvent.fields)) {
      const upstreamField = upstreamEvent.fields?.[name];
      if (!upstreamField) {
        diffs.push({ case_id:item.case_id, event_id:goldEvent.event_id, field:name, reason:'missing upstream field' });
        continue;
      }
      if (goldField.status !== upstreamField.status) {
        diffs.push({ case_id:item.case_id, event_id:goldEvent.event_id, field:name, gold:goldField.status, upstream:upstreamField.status });
        continue;
      }
      if (['extracted','needs_review'].includes(goldField.status)) {
        const goldValue = valueKey(name, goldField);
        const upstreamValue = valueKey(name, upstreamField);
        if (JSON.stringify(goldValue) !== JSON.stringify(upstreamValue)) {
          diffs.push({ case_id:item.case_id, event_id:goldEvent.event_id, field:name, gold:goldValue, upstream:upstreamValue });
        }
      }
    }
  }
}

const out = {
  upstream_branch:'weiwenyu',
  upstream_commit:'a862c40a',
  upstream_batch:'runs/batch-20261001T094756',
  documents_compared:documents,
  gold_documents:manifest.items.length,
  events_matched:matched,
  field_differences:diffs.length,
  normalization_note:'change_shares compared by absolute magnitude; direction is validated separately.',
  differences:diffs,
  result:diffs.length===0 && documents===6 ? 'MATCH' : 'DIFF',
};
fs.writeFileSync(path.join(root, 'evidence', 'upstream-comparison.json'), JSON.stringify(out, null, 2) + '\n', 'utf8');
console.log(JSON.stringify(out, null, 2));
if (out.result !== 'MATCH') process.exit(1);
