"""Recheck saved held-out inputs, outputs and timing sources without network access."""
from pathlib import Path
import hashlib,json,re,sys
root=Path(__file__).resolve().parent
read=lambda p:json.loads(p.read_text('utf-8-sig'))
sha=lambda p:hashlib.sha256(p.read_bytes()).hexdigest()
missing_pdfs=[]
for name,expected in read(root/'receipt-files.json')['files'].items():
    if name.endswith('.pdf') and not (root/name).exists():
        missing_pdfs.append(name);continue
    assert sha(root/name)==expected, 'Receipt changed: '+name
for name,expected in read(root/'heldout/pre-call-lock.json')['sha256'].items():
    if name.endswith('.pdf') and not (root/'heldout'/name).exists():continue
    assert sha(root/'heldout'/name)==expected, 'Pre-call input changed: '+name
gold=read(root/'heldout/gold.json');fields=anchors=same=0
def norm(x):
    if x is None:return None
    text=re.sub(r'\s','',str(x)).replace(',','')
    try:return float(text)
    except ValueError:return text
receipts={case:read(root/'live'/(case+'.web.json')) for case in gold['cases']}
for case,expected in gold['cases'].items():
    receipt=receipts[case];assert receipt['cache']=='disabled'
    assert receipt['call_log']['cache']['enabled'] is False
    events=receipt['envelope']['events']
    selected=[event for event in events if all(norm(event['fields'][key]['value'])==norm(value) for key,value in expected['match'].items())]
    assert len(selected)==1,(case,'ambiguous event')
    for key,target in expected['fields'].items():
        field=selected[0]['fields'][key]
        assert (norm(target['value']) in norm(field['value']) if target.get('contains') else norm(field['value'])==norm(target['value'])),(case,key,'value')
        assert not target.get('statuses') or field['status'] in target['statuses'],(case,key,'status')
        assert not target.get('denominator') or field.get('denominator')==target['denominator'],(case,key,'denominator')
        fields+=1
    blocks={b['block_id']:b for p in receipt['input']['parse']['pages'] for b in p['blocks']}
    for event in events:
        for key,field in event['fields'].items():
            for anchor in field.get('prove'+'nance',[]):
                block=blocks.get(anchor.get('block_id'))
                assert block and anchor.get('quote') and anchor['quote'] in block['text_raw'] and anchor['page']==block['page'],(case,key,'anchor')
                anchors+=1
cli=read(root/'live/H-EQC-001.cli.events.json')
for key,a in cli['events'][0]['fields'].items():
    b=receipts['H-EQC-001']['envelope']['events'][0]['fields'][key]
    assert all(a.get(k)==b.get(k) for k in ['status','value','unit','standardized','denominator']),key
    same+=1
for timing in read(root/'live/browser-timings.json')['runs']:
    receipt=receipts[timing['case']]
    assert timing['run_id']==receipt['run_id'] and timing['pages']==len(receipt['input']['parse']['pages'])
    assert 0<timing['seconds']<3600
    for key in ['receipt','screenshot']:assert sha(root/'live'/timing[key])==timing[key+'_sha256']
assert (fields,anchors,same)==(37,30,9)
assert '--require-pdf' not in sys.argv or not missing_pdfs, missing_pdfs
print(json.dumps({'field_assertions':fields,'strict_anchors':anchors,'web_cli_fields':same,'network_calls':0,'optional_original_pdfs_missing':missing_pdfs}))
