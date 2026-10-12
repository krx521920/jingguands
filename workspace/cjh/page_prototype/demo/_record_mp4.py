"""MP4 自动录制 —— 按 D29_MP4拍摄规划.md 的分镜表逐镜截帧。

设计纪律（三条，都是被坑出来的）：
1. **录制前先断言数据已预置**（fields_total==606 且 anchor.matches==true）。
   没预置就录，会拍出三张 null 卡 —— 那种片比不拍更糟。
2. **每镜断言目标元素真实存在**，不存在即指名报错并中止，**绝不出半成品**。
3. **提交号现读 `git rev-parse HEAD`**，不写死 —— 写死就会与实际不符。

用法：
  python demo/_record_mp4.py --base http://127.0.0.1:8651 --out materials/xxx.mp4
  python demo/_record_mp4.py --check      # 只跑断言与选器体检，不截帧
"""
import argparse, json, os, subprocess, sys, time, shutil
from pathlib import Path

from playwright.sync_api import sync_playwright

ROOT = Path(__file__).resolve().parent.parent          # page_prototype/
REPO = ROOT.parents[2]                                # jingguands/
FRAMES = ROOT / "demo" / "_frames"

W, H = 1920, 1080
MAX_SECONDS = 290          # 赛题限 300，留 10 秒余量
MAX_MB = 480               # 赛题限 500，留 20 MB 余量

# ── 分镜表（与 D29 文档逐条对应；改这里必须同步改文档）────────────────
SHOTS = [
    dict(id="S01", sec=20, view=None, label="首页全景",
         shot="全页", check=None),
    dict(id="S02", sec=25, view=None, label="事件卡列表",
         shot="事件区", check="[class*=event-card]"),
    dict(id="S03", sec=25, view=None, label="字段与出处联动",
         shot="全页", check="[class*=field-value]"),
    dict(id="S04", sec=30, view=None, label="原文证据栏",
         shot="证据区", check="[class*=evidence-panel]"),
    dict(id="S05", sec=30, view="核验清单", label="核验清单视图",
         shot="全页", check="body"),
    dict(id="S06", sec=30, view="跨文档比对", label="跨文档比对视图",
         shot="全页", check="body"),
    dict(id="S07", sec=30, view="综合核验", label="综合核验视图",
         shot="全页", check="body"),
    dict(id="S08", sec=45, view="质量报告", label="质量报告 · 指标区",
         shot="指标区", check="[class*=mx-cards]"),
    dict(id="S09", sec=20, view="质量报告", label="质量报告 · 口径对照",
         shot="全页", check="[class*=mx-caliber], [class*=mx-ds-statement]"),
    dict(id="S10", sec=20, view="质量报告", label="片尾（提交号见字幕）",
         shot="全页", check="body"),
]

SUBTITLES = {
    "S01": "可信公告事件提取与跨文档核验智能体",
    "S02": "A 流：单份公告 → 3 个结构化事件",
    "S03": "点任意数字 → 右侧原文高亮",
    "S04": "原文证据 39 条 · 四级出处：文件·页·区域·行列",
    "S05": "待复核 / 未提及：不猜不填零",
    "S06": "B 流：跨文档核对 · 13/13 · 4/4 · 8/8 · 1/1",
    "S07": "准确率 437/437 = 100% · 覆盖 31/31 份",
    "S08": "覆盖率 72.11%（437/606）· 溯源 74.09%（449/606）· 标准化 229/229",
    "S09": "弃权 169 条计入分母：弃权是正确行为，但仍是未覆盖",
    "S10": "权威批次：31 份 · 606 字段 · 数据可复算",
}


def head_sha():
    try:
        return subprocess.check_output(
            ["git", "rev-parse", "--short=8", "HEAD"], cwd=str(REPO)
        ).decode().strip()
    except Exception:
        return "unknown"


def ffprobe_duration(path):
    try:
        out = subprocess.check_output(
            ["ffprobe", "-v", "error", "-show_entries", "format=duration",
             "-of", "csv=p=0", str(path)], stderr=subprocess.STDOUT)
        return float(out.decode().strip())
    except Exception:
        return None


def assert_ready(base):
    """录制前硬断言：数据已预置。没预置就录会拍出 null 卡。"""
    import urllib.request
    with urllib.request.urlopen(base + "/api/metrics", timeout=20) as r:
        m = json.loads(r.read().decode("utf-8"))
    ds = m.get("data_source") or {}
    ft = (m.get("summary") or {}).get("fields_total")
    ok_anchor = bool((ds.get("anchor") or {}).get("matches"))
    if ft != 606 or not ok_anchor:
        print("✘ 录制中止：数据未预置  fields_total=%r anchor.matches=%r"
              % (ft, ok_anchor), file=sys.stderr)
        print("  需要的数据在 %s（权威批次 31 份）" % (ROOT / "data_unified"), file=sys.stderr)
        sys.exit(2)
    print("✔ 预置断言通过：fields_total=606, anchor.matches=true")


# 中文字体候选（Windows 自带）。PIL 默认位图字体**不渲染中文**，
# 直接 draw.text 会画出空白 —— 字幕"看起来烧了"其实什么也没有。
FONT_CANDIDATES = [
    "C:/Windows/Fonts/msyh.ttc",          # 微软雅黑
    "C:/Windows/Fonts/msyhbd.ttc",
    "C:/Windows/Fonts/simhei.ttf",        # 黑体
    "C:/Windows/Fonts/simsun.ttc",        # 宋体
]


def _load_font(size=34):
    from PIL import ImageFont
    for p in FONT_CANDIDATES:
        if os.path.exists(p):
            try:
                return ImageFont.truetype(p, size)
            except Exception:
                continue
    return None   # None ⇒ 退回默认位图字体（中文会缺字，调用方须报警）


def burn_subtitle(frame_dir, sid, text, sha):
    """把字幕烧进该镜**每一帧**（只烧首帧 ⇒ 该镜大部分时间无字幕）。
    返回是否真的烧成功（字体缺失须如实上报，不能静默出一个没字幕的片）。"""
    from PIL import Image, ImageDraw
    frames = sorted(frame_dir.glob(sid + "_*.png"))
    if not frames:
        return False
    font = _load_font(34)
    if font is None:
        print("✘ 未找到中文字体，字幕无法渲染（PIL 默认字体不含汉字）", file=sys.stderr)
        return False
    for f in frames:
        im = Image.open(f).convert("RGB")
        d = ImageDraw.Draw(im)
        W_, H_ = im.size
        bar_h = 96
        d.rectangle([0, H_ - bar_h, W_, H_], fill=(24, 20, 40))
        line2 = ("展示层提交号：" + sha) if sid == "S10" else ""
        if line2:
            d.text((48, H_ - bar_h + 14), text, fill=(255, 255, 255), font=font)
            d.text((48, H_ - bar_h + 54), line2, fill=(196, 160, 255), font=font)
        else:
            d.text((48, H_ - bar_h + 32), text, fill=(255, 255, 255), font=font)
        im.save(f)
    return True


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--base", default="http://127.0.0.1:8651")
    ap.add_argument("--out", default=str(REPO / "materials" /
                                         "项目演示-可信公告事件提取与跨文档核验.mp4"))
    ap.add_argument("--check", action="store_true", help="只做体检，不截帧")
    ap.add_argument("--fps", type=float, default=2)
    args = ap.parse_args()

    assert_ready(args.base)
    sha = head_sha()
    print("展示层提交号 =", sha)
    print("分镜 =", len(SHOTS), "镜，合计",
          sum(s["sec"] for s in SHOTS), "秒（赛题限 300）")

    if FRAMES.exists():
        shutil.rmtree(FRAMES)
    FRAMES.mkdir(parents=True, exist_ok=True)

    fails = []
    with sync_playwright() as p:
        b = p.chromium.launch(args=["--force-device-scale-factor=1"])
        pg = b.new_page(viewport={"width": W, "height": H})
        pg.goto(args.base + "/", wait_until="networkidle", timeout=60000)
        time.sleep(2.5)

        for s in SHOTS:
            sid, label = s["id"], s["label"]
            try:
                if s["view"]:
                    pg.locator("button:has-text('%s')" % s["view"]).first.click()
                    time.sleep(2.4)
                    if s["id"] in ("S08", "S09"):
                        pg.eval_on_selector_all(
                            "details", "els => els.forEach(e => e.open = true)")
                        time.sleep(0.8)

                # 每镜硬断言：目标元素真实存在
                if s["check"]:
                    loc = pg.locator(s["check"]).first
                    if loc.count() == 0:
                        raise AssertionError("目标元素不存在：%s" % s["check"])
                    if not loc.is_visible():
                        raise AssertionError("目标元素存在但不可见：%s" % s["check"])

                if args.check:
                    print("  [体检] %s %-22s ✔" % (sid, label))
                    continue

                # 帧数 = 时长 × fps（**不是** ÷10 —— 那是笔误，会让成片只有计划时长的 1/10）
                n = max(2, int(round(s["sec"] * args.fps)))
                for i in range(n):
                    if s["shot"] == "事件区" and i == n - 1:
                        pg.mouse.wheel(0, 420); time.sleep(0.5)
                    elif s["shot"] == "证据区" and i == n - 1:
                        pg.keyboard.press("End"); time.sleep(0.6)
                    elif s["shot"] == "指标区" and i == n - 1:
                        pg.mouse.wheel(0, 300); time.sleep(0.5)
                    elif s["shot"] == "全页" and i == n - 1 and s["id"] in ("S02", "S03", "S09"):
                        pg.mouse.wheel(0, 260); time.sleep(0.5)
                    pg.screenshot(path=str(FRAMES / ("%s_%03d.png" % (sid, i))))
                if not burn_subtitle(FRAMES, sid, SUBTITLES[sid], sha):
                    raise AssertionError("字幕烧录失败（缺中文字体？）—— 不出无字幕的片")
                print("  ✔ %s %-22s %d 帧 / %ds" % (sid, label, n, s["sec"]))
            except Exception as e:
                fails.append("%s %s：%s" % (sid, label, str(e)[:160]))
                print("  ✘ %s %s：%s" % (sid, label, str(e)[:160]))

        b.close()

    if args.check:
        print("\n体检结果：%s" % ("全部通过" if not fails else "FAIL %d" % len(fails)))
        for f in fails:
            print("  ✘", f)
        sys.exit(1 if fails else 0)

    if fails:
        print("\n✘ 有 %d 镜失败，**不出片**（半成品比不拍更糟）。已录帧保留在 %s"
              % (len(fails), FRAMES), file=sys.stderr)
        sys.exit(1)

    # ── 合成 ──
    #★ 用 concat 清单而非 `-i S%02d_%03d.png`：
    #   各镜帧数不同（20s→4x、45s→9x），序号不连续，glob 模式匹配不到。
    #   concat 清单逐帧显式列出，还能给每帧精确时长（帧数/时长分离）。
    out = Path(args.out)
    out.parent.mkdir(parents=True, exist_ok=True)

    manifest = ROOT / "demo" / "_frames" / "_concat.txt"
    per_frame = 1.0 / args.fps
    lines = []
    for s in SHOTS:
        for f in sorted((FRAMES).glob(s["id"] + "_*.png")):
            lines.append("file '%s'" % f.as_posix().replace("'", "'\\''"))
            lines.append("duration %.4f" % per_frame)
    # concat -demuxer 要求最后一帧再重复一次，否则末帧时长被吞
    last = sorted(FRAMES.glob("S10_*.png"))[-1]
    lines.append("file '%s'" % last.as_posix())
    manifest.write_text("\n".join(lines) + "\n", encoding="utf-8")
    print("\nconcat 清单：%d 帧（每帧 %.3fs ⇒ %.1f 秒）"
          % (len(lines) // 2 + 1, per_frame, (len(lines) // 2 + 1) * per_frame))

    # ★ ffmpeg 参数顺序铁律：**输出选项（-c/-pix_fmt/-r/-vf…）必须全部放在最后一个 -i 之后**，
    #   且不能夹在两个输入之间。之前的写法把 -vf 放在 concat 输入与 anullsrc 输入之间，
    #   ffmpeg 会把它当成"给 anullsrc 这个输入加视频滤镜" ⇒
    #   "Option vf ... cannot be applied to input url anullsrc"，直接失败。
    #   截图本身已是 1920×1080（视口设定），**缩放滤镜本就多余** —— 直接去掉，
    #   既绕开顺序坑，又少一次无谓重采样（重采样会放大静态文字的锯齿）。
    cmd = ["ffmpeg", "-y",
           "-f", "concat", "-safe", "0", "-i", str(manifest),
           "-f", "lavfi", "-i", "anullsrc=channel_layout=stereo:sample_rate=48000",
           "-c:v", "libx264", "-preset", "medium", "-crf", "20",
           "-pix_fmt", "yuv420p", "-r", "30",
           "-shortest", "-c:a", "aac", "-b:a", "128k", str(out)]
    print("合成：ffmpeg concat →", out.name)
    r = subprocess.run(cmd, capture_output=True, text=True)
    if r.returncode != 0:
        print("✘ ffmpeg 失败：\n", r.stderr[-1800:], file=sys.stderr)
        sys.exit(1)

    dur = ffprobe_duration(out) or 0
    mb = out.stat().st_size / 1024 / 1024
    print("\n成片：%s" % out)
    print("  时长 %.1f 秒（限 300，余量 %.1f）%s" % (dur, 300 - dur, "✔" if dur <= MAX_SECONDS else "✘"))
    print("  体积 %.1f MB（限 500，余量 %.1f）%s" % (mb, 500 - mb, "✔" if mb <= MAX_MB else "✘"))

    bad = []
    if dur <= 0:
        bad.append("时长探测失败（成片可能不可播放）")
    if dur > MAX_SECONDS:
        bad.append("超时长 %.1fs" % (dur - 300))
    if mb > MAX_MB:
        bad.append("超体积 %.1fMB" % (mb - 500))
    if bad:
        print("\n✘ 成片不合规：", "；".join(bad), file=sys.stderr)
        sys.exit(1)
    print("\n✔ 成片合规（时长与体积双限均达标）")


if __name__ == "__main__":
    main()
