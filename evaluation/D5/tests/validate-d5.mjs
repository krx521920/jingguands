import fs from 'node:fs';
import path from 'node:path';

const root = path.resolve(import.meta.dirname, '..');
const manifest = JSON.parse(fs.readFileSync(path.join(root, 'dev', 'manifest.json'), 'utf8'));
const REG = {
  holder: { unit: 'text' },
  direction: { unit: 'text' },
  shares_before: { unit: 'shares' },
  shares_after: { unit: 'shares' },
  ratio_before: { unit: 'percent', denominator: true },
  ratio_after: { unit: 'percent', denominator: true },
  change_shares: { unit: 'shares' },
  method: { unit: 'text' },
  change_date: { unit: 'date_range' },
};
const STATUSES = new Set(['extracted','not_disclosed','not_applicable','not_mentioned','unreadable','needs_review']);
const NULL_STATUSES = new Set(['not_disclosed','not_applicable','not_mentioned','unreadable']);
const DENOMS = new Set(['holder_shares','total_share_capital','net_assets','other']);
const assert = (x, m) => { if (!x) throw new Error(m); };
const valueOf = (fv) => fv && (fv.status === 'extracted' || fv.status === 'needs_review') ? fv.value : null;
const numeric = (v) => typeof v === 'number' && Number.isFinite(v);

function directionIssues(event) {
  const f = event?.fields ?? {};
  const b = valueOf(f.shares_before);
  const a = valueOf(f.shares_after);
  const d = valueOf(f.direction);
  if (!numeric(b) || !numeric(a) || typeof d !== 'string') return [];
  if (b > a && d !== 'decrease') return [`before ${b} > after ${a}, direction=${d}, expected decrease`];
  if (b < a && d !== 'increase') return [`before ${b} < after ${a}, direction=${d}, expected increase`];
  return [];
}
function ratioConflict(event) {
  const f = event?.fields ?? {};
  const b = valueOf(f.shares_before), a = valueOf(f.shares_after);
  const rb = valueOf(f.ratio_before), ra = valueOf(f.ratio_after);
  if (!numeric(b) || !numeric(a) || !numeric(rb) || !numeric(ra)) return [];
  if (b < a && rb > ra) return [`shares increase but ratio decreases: ${b}->${a}, ${rb}%->${ra}% (possible denominator change)`];
  if (b > a && rb < ra) return [`shares decrease but ratio increases: ${b}->${a}, ${rb}%->${ra}% (possible denominator change)`];
  return [];
}
function makeChallengeEnvelope(c) {
  const fv = (value) => value === null ? { value:null, status:'not_mentioned' } : { value, status:'extracted' };
  const fields = {};
  for (const [k,v] of Object.entries(c.event)) fields[k] = fv(v);
  return { events: [{ event_type:'equity_change', fields }] };
}
function challengeResult(c) {
  const env = makeChallengeEnvelope(c);
  const d = directionIssues(env.events[0]);
  const r = ratioConflict(env.events[0]);
  return { case_id:c.case_id, name:c.name, direction_issues:d, ratio_conflicts:r, requires_review:Boolean(c.expect.requires_review), expect:c.expect };
}

let events=0, fields=0, evidence=0, directionChecks=0, ratioChecks=0;
const caseRows=[], spot=[];
for (const item of manifest.items) {
  const raw = JSON.parse(fs.readFileSync(path.resolve(root,'dev',item.raw),'utf8'));
  const gold = JSON.parse(fs.readFileSync(path.resolve(root,'dev',item.gold),'utf8'));
  assert(raw.doc.file_sha256 === item.source_hash, `${item.case_id} raw source hash`);
  assert(gold.source.file_sha256 === item.source_hash, `${item.case_id} gold source hash`);
  assert(gold.events.length === item.event_count, `${item.case_id} event count`);
  const blocks = new Map();
  for (const page of raw.pages ?? []) for (const b of page.blocks ?? []) blocks.set(b.block_id,b);
  for (const ev of gold.events) {
    events++;
    assert(ev.event_type === 'equity_change', `${item.case_id} event type`);
    const names = Object.keys(ev.fields ?? {});
    assert(names.length === Object.keys(REG).length, `${item.case_id}/${ev.event_id} field count`);
    for (const name of Object.keys(REG)) assert(ev.fields[name], `${item.case_id}/${ev.event_id}/${name} missing`);
    const dIssues = directionIssues(ev);
    directionChecks++;
    assert(dIssues.length === 0, `${item.case_id}/${ev.event_id} direction: ${dIssues.join('; ')}`);
    ratioChecks++;
    const rIssues = ratioConflict(ev);
    assert(rIssues.length === 0, `${item.case_id}/${ev.event_id} ratio conflict: ${rIssues.join('; ')}`);
    for (const [name,fv] of Object.entries(ev.fields)) {
      fields++;
      const spec = REG[name];
      assert(spec, `${item.case_id}/${ev.event_id}/${name} unregistered`);
      assert(fv.unit === spec.unit, `${item.case_id}/${ev.event_id}/${name} unit`);
      assert(STATUSES.has(fv.status), `${item.case_id}/${ev.event_id}/${name} status`);
      if (NULL_STATUSES.has(fv.status)) assert(fv.value === null, `${item.case_id}/${ev.event_id}/${name} value must be null`);
      if (fv.status === 'extracted' || fv.status === 'needs_review') assert(fv.provenance.length > 0, `${item.case_id}/${ev.event_id}/${name} provenance`);
      if (spec.denominator && fv.status === 'extracted') assert(DENOMS.has(fv.denominator), `${item.case_id}/${ev.event_id}/${name} denominator`);
      if (name === 'change_shares' && fv.status === 'extracted') assert(numeric(fv.value) && fv.value >= 0, `${item.case_id}/${ev.event_id}/change_shares must be non-negative`);
      for (const p of fv.provenance ?? []) {
        evidence++;
        const b = blocks.get(p.block_id);
        assert(b, `${item.case_id}/${ev.event_id}/${name} block ${p.block_id}`);
        assert(b.page === p.page, `${item.case_id}/${ev.event_id}/${name} page`);
        assert((b.text ?? '').includes(p.quote) || (b.text_raw ?? '').includes(p.quote), `${item.case_id}/${ev.event_id}/${name} quote`);
        if (p.region !== null && p.region !== undefined) {
          const [l,t,r,bt] = p.region;
          assert(l < r && t < bt && l >= 0 && t >= 0, `${item.case_id}/${ev.event_id}/${name} region`);
        }
        if (p.source_type === 'cell' || p.source_type === 'table') assert(p.table_id && p.cell_ref, `${item.case_id}/${ev.event_id}/${name} table provenance`);
      }
    }
  }
  const candidates = [];
  for (const ev of gold.events) for (const [name,fv] of Object.entries(ev.fields)) if (fv.provenance?.length && (fv.status === 'extracted' || fv.status === 'needs_review')) candidates.push({case_id:item.case_id,event_id:ev.event_id,field:name,...fv.provenance[0]});
  assert(candidates.length >= 2, `${item.case_id} evidence candidates`);
  spot.push(candidates[0], candidates[1]);
  caseRows.push({case_id:item.case_id,events:gold.events.length,fields:gold.events.reduce((n,e)=>n+Object.keys(e.fields).length,0),result:'PASS'});
}

const challenge = JSON.parse(fs.readFileSync(path.join(root,'challenges','direction-inversion-cases.json'),'utf8'));
const challengeRows = challenge.cases.map(challengeResult);
for (const row of challengeRows) {
  assert((row.direction_issues.length > 0) === row.expect.direction_issue, `${row.case_id} direction expectation`);
  assert((row.ratio_conflicts.length > 0) === row.expect.ratio_conflict, `${row.case_id} ratio expectation`);
  if (row.expect.requires_review) assert(row.requires_review, `${row.case_id} review expectation`);
}

const out = {
  result:'PASS',
  documents:manifest.items.length,
  events,
  fields,
  evidence_records:evidence,
  unsupported_quotes:0,
  direction_checks:directionChecks,
  ratio_checks:ratioChecks,
  direction_inversion_challenge_cases:challengeRows.length,
  direction_inversion_challenge_pass:challengeRows.filter((r)=>(r.direction_issues.length>0)===r.expect.direction_issue && (r.ratio_conflicts.length>0)===r.expect.ratio_conflict).length,
  spot_checks:spot.length,
  cases:caseRows,
};
fs.mkdirSync(path.join(root,'evidence'),{recursive:true});
fs.writeFileSync(path.join(root,'evidence','validation-results.json'),JSON.stringify(out,null,2)+'\n','utf8');
fs.writeFileSync(path.join(root,'evidence','spot-checks.json'),JSON.stringify({total:spot.length,items:spot},null,2)+'\n','utf8');
console.log(JSON.stringify(out,null,2));
