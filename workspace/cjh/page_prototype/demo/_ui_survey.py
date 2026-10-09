#!/usr/bin/env python
"""D11 首次封存测试 —— 页面层巡检（只读，真实浏览器）

接口层零缺陷不代表页面零缺陷。本脚本用 Playwright 逐视图实测：
  - 控制台错误 / 页面未捕获异常
  - 元素重叠与溢出（错位类缺陷）
  - 长文本/大表格可读性
  - 大响应渲染耗时（卡死类）
纪律：只读。不改数据、不改代码、不碰封存资产。
输出：_ui_survey.json
"""
import json
import os
import sys
import time
import urllib.request
from playwright.sync_api import sync_playwright

BASE = os.environ.get("BASE", "http://127.0.0.1:8643")
OUT = os.path.join(os.path.dirname(os.path.abspath(__file__)), "_ui_survey.json")


def fetch(path):
    """直接从接口取真实条目 id，避免手抄清单与产品漂移。"""
    with urllib.request.urlopen(BASE + path, timeout=30) as r:
        return json.loads(r.read().decode("utf-8"))


def load_entry_ids():
    """视图名 -> 该视图接口返回的全部唯一标识（用于漏渲染核对）。"""
    ids = {}
    pairs = fetch("/api/pairs")
    ids["配对 D8"] = [g["group_id"] for g in pairs.get("groups", []) if g.get("group_id")]
    # 配对视图还应显示每个成员文档名，一并核对
    mem = []
    for g in pairs.get("groups", []):
        for m in (g.get("members") or []):
            v = m if isinstance(m, str) else (m.get("dataset") or m.get("doc_id") or "")
            if v:
                mem.append(v)
    ids["配对 D8 成员"] = sorted(set(mem))

    ver = fetch("/api/verify")
    f_ids = []
    for f in ver.get("findings", []):
        # findings 的唯一定位是 dataset + event_id + code；页面显示 event_id 与 code
        if f.get("event_id"):
            f_ids.append(f["event_id"])
        if f.get("code"):
            f_ids.append(f["code"])
    ids["核验 D9"] = sorted(set(f_ids))

    inte = fetch("/api/integration")
    c_ids = []
    for c in inte.get("cases", []):
        if c.get("case_id"):
            c_ids.append(c["case_id"])
    ids["集成 D10"] = c_ids
    return ids


ENTRY_IDS = load_entry_ids()

# 视图按钮 id -> 视图中文名（见 public/index.html）
# 注意：单文档三栏是默认视图，无切换按钮（首页即它），故 btn 为 None。
VIEWS = [
    (None, "单文档三栏", None),
    ("#pairsBtn", "配对 D8", "D8-PAIR-001"),
    ("#verifyBtn", "核验 D9", "MISSING_SHARE_PAIR"),
    ("#integrationBtn", "集成 D10", "D10-INT-001"),
    ("#metricsBtn", "结果图表 D11", "出处命中率"),
]

# 探针 JS：一次性把三类问题全查出来
PROBE = r"""
() => {
  const out = {overlap: [], overflow: [], tiny: [], counts: {}};
  // 1) 溢出：横向滚动超宽（错位类）
  const de = document.documentElement;
  out.overflow.push({
    kind: 'page_hscroll',
    scrollW: de.scrollWidth, clientW: de.clientWidth,
    excess: de.scrollWidth - de.clientWidth
  });
  // 2) 元素级：内容宽度显著超出容器（表格/长串）
  const els = [...document.querySelectorAll('main *')].slice(0, 6000);
  els.forEach(e => {
    if (e.children.length > 0) return;                 // 只看叶子节点
    const r = e.getBoundingClientRect();
    if (r.width === 0 || r.height === 0) return;
    const p = e.parentElement;
    if (!p) return;
    const pr = p.getBoundingClientRect();
    // 子元素比父容器宽 50% 以上且父容器有 overflow:hidden => 会被裁切
    const style = getComputedStyle(p);
    if ((style.overflow === 'hidden' || style.overflowX === 'hidden') && r.width > pr.width * 1.5) {
      out.overflow.push({
        kind: 'clipped_by_parent',
        tag: e.tagName, cls: (e.className || '').toString().slice(0, 60),
        text: (e.textContent || '').trim().slice(0, 50),
        childW: Math.round(r.width), parentW: Math.round(pr.width)
      });
    }
    // 3) 重叠：同层可见叶子节点两两相交面积占比高
    if ((e.textContent || '').trim().length < 4) return;
    out.tiny.push({x: r.x, y: r.y, w: r.width, h: r.height,
                   t: (e.textContent || '').trim().slice(0, 40)});
  });
  // 4) 重叠检测（限制比较规模：只看视口内、面积够大的文本节点）
  const boxes = out.tiny.filter(b => b.w > 8 && b.h > 8 && b.x > -50 && b.y > -50 && b.x < 2000);
  out.tiny = [];
  for (let i = 0; i < boxes.length; i++) {
    for (let j = i + 1; j < boxes.length; j++) {
      const a = boxes[i], b = boxes[j];
      const ix = Math.min(a.x+a.w, b.x+b.w) - Math.max(a.x, b.x);
      const iy = Math.min(a.y+a.h, b.y+b.h) - Math.max(a.y, b.y);
      if (ix > 2 && iy > 2) {
        const inter = ix * iy;
        const small = Math.min(a.w*a.h, b.w*b.h);
        if (small > 0 && inter / small > 0.55) {
          out.overlap.push({a: a.t, b: b.t, ratio: +(inter/small).toFixed(2)});
        }
      }
    }
  }
  // 5) 关键内容计数
  out.counts = {
    tables: document.querySelectorAll('table').length,
    details: document.querySelectorAll('details').length,
    cards: document.querySelectorAll('[class*="card"],[class*="panel"]').length,
    rows: document.querySelectorAll('tr').length,
    visible_text_len: (document.body.innerText || '').length
  };
  out.title = document.title;
  return out;
}
"""


def main():
    findings = []
    views = []

    def note(sev, view, title, repro, expect, actual):
        findings.append({"sev": sev, "view": view, "title": title,
                         "repro": repro, "expect": expect, "actual": actual})

    with sync_playwright() as p:
        browser = p.chromium.launch(headless=True,
                                    args=["--no-sandbox", "--disable-dev-shm-usage", "--disable-gpu"])
        for btn, name, anchor in VIEWS:
            ctx = browser.new_context(viewport={"width": 1600, "height": 1000},
                                      device_scale_factor=1)
            pg = ctx.new_page()
            errors, pageerrors = [], []
            pg.on("console", lambda m: errors.append(m.text) if m.type == "error" else None)
            pg.on("pageerror", lambda e: pageerrors.append(str(e)))

            t0 = time.time()
            pg.goto(BASE, wait_until="networkidle", timeout=60000)
            pg.wait_for_timeout(1500)

            if btn:
                pg.click(btn)
                pg.wait_for_timeout(2500)

            # 锚点定位（配对/核验/集成的关键条目）
            anchored = False
            if anchor:
                anchored = pg.evaluate(
                    """(txt) => {
                        const els = [...document.querySelectorAll('*')].filter(
                            e => e.children.length === 0 && e.textContent.includes(txt));
                        if (!els.length) return false;
                        els[els.length - 1].scrollIntoView({block: 'start'});
                        window.scrollBy(0, -70);
                        return true;
                    }""",
                    anchor,
                )
                pg.wait_for_timeout(700)
                if not anchored:
                    note("P1", name, "锚点文本未找到", "切到「%s」后找文本「%s」" % (name, anchor),
                         "锚点存在", "页面中无此文本")

            # 关键：页面实际渲染条目 vs 接口返回条目（漏渲染是真缺陷，且肉眼难发现）
            # 做法：对每条目的唯一标识（D8-PAIR-xxx / case_id / event_id）逐个在 DOM 文本中查找。
            rendered = pg.evaluate(
                """(ids) => {
                    const body = document.body.innerText || '';
                    return {
                        total: ids.length,
                        present: ids.filter(i => body.includes(i)),
                        missing: ids.filter(i => !body.includes(i))
                    };
                }""",
                ENTRY_IDS.get(name, []),
            )
            if rendered["missing"]:
                note("P0", name, "页面漏渲染条目（接口有、页面无）",
                     "打开首页 → 点「%s」" % name,
                     "%d 条全部可见" % rendered["total"],
                     "缺 %d 条：%s" % (len(rendered["missing"]), ", ".join(rendered["missing"][:8])))

            probe = pg.evaluate(PROBE)
            render_ms = round((time.time() - t0) * 1000)  # 端到端：goto + 切视图 + 渲染
            # 卡死判定：端到端超过 8 秒
            if render_ms > 8000:
                note("P1", name, "视图加载过慢（疑似卡死）", "打开首页 → 点「%s」" % name,
                     "<8000ms", "%dms" % render_ms)

            # 判定
            repro = "打开首页 → 点「%s」%s" % (name, (" → 定位「%s」" % anchor) if anchor else "")
            if errors or pageerrors:
                note("P0", name, "控制台报错 / 未捕获异常", repro,
                     "0 条错误", "console.error %d 条：%s；pageerror %d 条：%s" % (
                         len(errors), errors[:3], len(pageerrors), pageerrors[:3]))
            hscroll = [o for o in probe["overflow"] if o["kind"] == "page_hscroll" and o["excess"] > 4]
            if hscroll:
                note("P1", name, "页面出现横向滚动条（布局超宽）", repro,
                     "scrollWidth == clientWidth",
                     "超宽 %dpx（scrollW=%d, clientW=%d）" % (hscroll[0]["excess"], hscroll[0]["scrollW"], hscroll[0]["clientW"]))
            clipped = [o for o in probe["overflow"] if o["kind"] == "clipped_by_parent"]
            if clipped:
                note("P1", name, "文本被容器裁切（内容溢出隐藏）", repro,
                     "不裁切或换行完整显示",
                     "%d 处，例：<%s class=%s> 「%s」 宽 %d > 父 %d" % (
                         len(clipped), clipped[0]["tag"], clipped[0]["cls"],
                         clipped[0]["text"], clipped[0]["childW"], clipped[0]["parentW"]))
            ov = [o for o in probe["overlap"] if o["a"] != o["b"]]
            if ov:
                note("P1", name, "文本块重叠（错位）", repro,
                     "无重叠",
                     "%d 对，例：「%s」× 「%s」覆盖 %d%%" % (
                         len(ov), ov[0]["a"], ov[0]["b"], ov[0]["ratio"] * 100))
            if probe["counts"]["visible_text_len"] < 500:
                note("P1", name, "视图内容过少（疑似空渲染）", repro,
                     ">500 字符", "%d 字符" % probe["counts"]["visible_text_len"])

            views.append({
                "view": name, "btn": btn, "anchor": anchor, "anchored": anchored,
                "render_ms": render_ms, "probe": probe,
                "render_check": rendered,
                "console_errors": errors, "page_errors": pageerrors,
            })
            print("[%s] 锚点=%s 端到端%dms 表格%d 详情%d 文本%d字 条目%d/%d可见 错误%d未捕获%d" % (
                name, "命中" if anchored else ("-" if not anchor else "未命中"),
                render_ms, probe["counts"]["tables"], probe["counts"]["details"],
                probe["counts"]["visible_text_len"],
                rendered["total"] - len(rendered["missing"]), rendered["total"],
                len(errors), len(pageerrors)))
            if rendered["missing"]:
                print("缺渲染: %s" % ", ".join(rendered["missing"][:10]))
            ctx.close()
        browser.close()

    out = {"generated_at": time.strftime("%Y-%m-%dT%H:%M:%S"),
           "base": BASE, "views": views, "findings": findings}
    with open(OUT, "w", encoding="utf-8") as f:
        json.dump(out, f, ensure_ascii=False, indent=2)

    print("\n=== 页面缺陷 %d 条 ===" % len(findings))
    by = {}
    for f in findings:
        by.setdefault(f["sev"], []).append(f)
    for s in ["P0", "P1", "P2"]:
        print("  %s: %d" % (s, len(by.get(s, []))))
        for f in by.get(s, [])[:6]:
            print("     · [%s] %s — %s" % (f["view"], f["title"], f["actual"][:110]))
    print("→ " + OUT)
    return 0


if __name__ == "__main__":
    sys.exit(main())