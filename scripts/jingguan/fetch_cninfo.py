# -*- coding: utf-8 -*-
"""巨潮资讯网公开公告抓取器——补语料用（D3 起）。

合规：仅取公开披露文件；限速≥2s；原始 PDF 不入库（manifest 只记 URL+sha256）。
用法：python3 scripts/jingguan/fetch_cninfo.py --out <本地目录> --count N [--skip-sha <hash前缀>]
抓取后用张智博 finstruct 解析，再把 parse JSON 入 corpus（PDF 本地留存或重取）。
"""
import argparse, hashlib, json, os, sys, time, urllib.request, urllib.parse

API = 'http://www.cninfo.com.cn/new/hisAnnouncement/query'
UA = 'jingguands-competition-research/0.1 (D3 pledge corpus)'
SLEEP = 2.5

def post(url, data):
    req = urllib.request.Request(url, data=urllib.parse.urlencode(data).encode('utf-8'),
                                 headers={'User-Agent': UA, 'Content-Type': 'application/x-www-form-urlencoded'})
    with urllib.request.urlopen(req, timeout=30) as r:
        return json.loads(r.read().decode('utf-8'))

def fetch_pledge(count, out):
    got, page = [], 1
    while len(got) < count and page <= 8:
        try:
            res = post(API, {
                'pageNum': page, 'pageSize': 30, 'column': 'szse', 'tabName': 'fulltext',
                'plate': '', 'stock': '', 'searchkey': '部分股份质押', 'secid': '',
                'category': '', 'trade': '', 'seDate': '2026-08-01~2026-09-25',
                'sortName': '', 'sortType': '', 'isHLtitle': 'true',
            })
        except Exception as e:
            print(f'  第{page}页请求失败：{e}'); page += 1; time.sleep(SLEEP); continue
        anns = res.get('announcements') or []
        if not anns:
            print(f'  第{page}页无结果，停止'); break
        for a in anns:
            title = (a.get('announcementTitle') or '').replace('<em>', '').replace('</em>', '')
            if '质押' not in title or '解除' in title or '提示性' in title:
                continue
            if not any(k in title for k in ('部分股份质押', '股份质押', '质押的公告')):
                continue
            url = 'http://static.cninfo.com.cn/' + a['adjunctUrl']
            entry = {'title': title, 'code': a.get('secCode'), 'org': a.get('secName'),
                     'url': url, 'announce_date': time.strftime('%Y-%m-%d', time.localtime(a['announcementTime']/1000))}
            if any(g['url'] == url for g in got):
                continue
            got.append(entry)
            print(f"  [{len(got)}] {entry['code']} {entry['org']} {title[:38]} ({entry['announce_date']})")
            if len(got) >= count: break
        page += 1
        time.sleep(SLEEP)
    return got

def download(entries, out, skip_sha=''):
    os.makedirs(out, exist_ok=True)
    manifest = []
    for i, e in enumerate(entries, 1):
        name = f"pledge-{i+201:03d}.pdf"  # pledge-201.. 避免与现有编号撞
        path = os.path.join(out, name)
        try:
            req = urllib.request.Request(e['url'], headers={'User-Agent': UA})
            with urllib.request.urlopen(req, timeout=60) as r, open(path, 'wb') as f:
                f.write(r.read())
        except Exception as ex:
            print(f'  下载失败 {e["url"]}: {ex}'); continue
        h = hashlib.sha256(open(path, 'rb').read()).hexdigest()
        if skip_sha and h.startswith(skip_sha):
            print(f'  {name} 与已有 pledge-001 同源(hash {h[:12]})，跳过'); os.remove(path); continue
        size = os.path.getsize(path)
        if size < 10000:
            print(f'  {name} 过小({size}B) 跳过'); os.remove(path); continue
        manifest.append({'file': name, **e, 'sha256': h, 'size': size})
        print(f'  ✓ {name} {size}B sha256={h[:12]} {e["title"][:30]}')
        time.sleep(SLEEP)
    json.dump(manifest, open(os.path.join(out, 'fetch_manifest.json'), 'w', encoding='utf-8'), ensure_ascii=False, indent=2)
    print(f'完成：{len(manifest)} 份，清单 {out}/fetch_manifest.json')

if __name__ == '__main__':
    ap = argparse.ArgumentParser()
    ap.add_argument('--out', default='.tmp_raw')
    ap.add_argument('--count', type=int, default=4)
    ap.add_argument('--skip-sha', default='44e9508596f9')
    a = ap.parse_args()
    print('检索质押公告（巨潮公开接口，限速2.5s）...')
    entries = fetch_pledge(a.count, a.out)
    print(f'命中 {len(entries)} 份，开始下载...')
    download(entries, a.out, a.skip_sha)
