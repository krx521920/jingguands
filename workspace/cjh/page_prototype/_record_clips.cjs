// 录制方建议的 3 个演示片段（10-17 方《给陈的录屏案例交接》"现在可录的三段"）
// 方案：playwright-core 驱动页面 + CDP Page.startScreencast 自采帧（绕过 recordVideo 管线）+ ffmpeg 序列合成 mp4。
// 纪律：版本号取实时 git rev-parse HEAD；不口播未证实承诺；标注「已有结果回放 / 公开开发用例」。
const { chromium } = require("C:/Users/cjh05/.workbuddy/binaries/node/workspace/node_modules/playwright-core");
const { execSync } = require("child_process");
const fs = require("fs");
const path = require("path");

const EXE = "C:/Users/cjh05/AppData/Local/ms-playwright/chromium-1228/chrome-win64/chrome.exe";
const URL = "http://127.0.0.1:8642/";
const TMP = "D:/chenjh/code/program/jingguanpluge/jingguands/workspace/cjh/page_prototype/_rec_tmp";
const OUT = "D:/chenjh/code/program/jingguanpluge/jingguands/materials/clips_2026-10-17";
const SHA = execSync("git rev-parse --short HEAD", { cwd: "D:/chenjh/code/program/jingguanpluge/jingguands", encoding: "utf8" }).trim();
const FPS = 12;

const CSS = `
 #rec-sub{position:fixed;left:50%;transform:translateX(-50%);bottom:18px;z-index:99999;background:rgba(13,20,32,.9);color:#fff;font:500 19px/1.5 "Microsoft YaHei",sans-serif;padding:10px 24px;border-radius:10px;max-width:82%;text-align:center;box-shadow:0 4px 18px rgba(0,0,0,.35);display:none}
 #rec-badge{position:fixed;right:14px;top:12px;z-index:99999;background:rgba(13,20,32,.72);color:#cbd5e1;font:500 12px/1 "Microsoft YaHei",sans-serif;padding:7px 11px;border-radius:6px;letter-spacing:.5px}
`;
const INJECT = `
 (()=>{
  const st=document.createElement('style'); st.textContent=${JSON.stringify(CSS)}; document.head.appendChild(st);
  const s=document.createElement('div'); s.id='rec-sub'; document.body.appendChild(s);
  const b=document.createElement('div'); b.id='rec-badge'; b.textContent='已有结果回放 · 公开开发用例'; document.body.appendChild(b);
  window.__sub=(t)=>{const e=document.getElementById('rec-sub'); e.textContent=t; e.style.display='block';};
  window.__card=(id)=>{
    const c=[...document.querySelectorAll('.pair-card')].find(x=>x.textContent.includes(id));
    if(!c) return false;
    c.scrollIntoView({block:'center'});
    c.style.outline='3px solid #2563eb'; c.style.outlineOffset='4px'; c.style.borderRadius='10px';
    return true;
  };
  window.__vgroup=(id)=>{
    const t=[...document.querySelectorAll('.corr-group-title')].find(x=>x.textContent.startsWith(id));
    if(!t) return false;
    const g=t.parentElement||t;
    g.scrollIntoView({block:'center'});
    g.style.outline='3px solid #2563eb'; g.style.outlineOffset='4px'; g.style.borderRadius='10px';
    return true;
  };
 })();
`;

// 启动一段录像：返回 { seqDir, stop } —— stop() 落盘收尾
async function startRecorder(cdp, seqDir) {
  fs.rmSync(seqDir, { recursive: true, force: true });
  fs.mkdirSync(seqDir, { recursive: true });
  let latest = null; // Buffer
  let n = 0;
  cdp.on("Page.screencastFrame", async (p) => {
    try {
      latest = Buffer.from(p.data, "base64");
      await cdp.send("Page.screencastFrameAck", { sessionId: p.sessionId });
    } catch (e) { /* 忽略单帧错误 */ }
  });
  await cdp.send("Page.startScreencast", { format: "jpeg", quality: 85, maxWidth: 1280, maxHeight: 720, everyNthFrame: 1 });
  const timer = setInterval(() => {
    if (latest) {
      const f = path.join(seqDir, String(++n).padStart(6, "0") + ".jpg");
      fs.writeFileSync(f, latest);
    }
  }, Math.round(1000 / FPS));
  return {
    async stop() {
      clearInterval(timer);
      try { await cdp.send("Page.stopScreencast"); } catch (e) {}
      return n;
    },
  };
}

async function newClip(browser, tag) {
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 720 } });
  const page = await ctx.newPage();
  const cdp = await ctx.newCDPSession(page);
  const rec = await startRecorder(cdp, path.join(TMP, tag + "_seq"));
  await page.goto(URL, { waitUntil: "load", timeout: 20000 });
  await page.waitForTimeout(800);
  await page.evaluate(INJECT);
  return { ctx, page, rec };
}

async function openPairs(page) {
  await page.click("#pairsBtn");
  await page.waitForSelector(".pair-card", { timeout: 20000 });
  await page.waitForTimeout(500);
}

async function openVerify(page) {
  await page.click("#verifyBtn");
  await page.waitForSelector(".corr-group-title", { timeout: 20000 });
  try { await page.waitForFunction(() => !document.body.textContent.includes("正在加载核验结果"), null, { timeout: 10000 }); } catch (e) {}
  await page.waitForTimeout(700);
}

async function endCard(page, ms) {
  await page.evaluate((sha) => window.__sub("版本 " + sha + " · 已有结果回放 / 公开开发用例"), SHA);
  await page.waitForTimeout(ms);
}

async function toMp4(seqDir, dst, frames) {
  const ffmpeg = "C:/Users/cjh05/AppData/Local/Microsoft/WinGet/Links/ffmpeg.exe";
  if (frames < 5) throw new Error("帧数过少: " + frames);
  execSync(`"${ffmpeg}" -y -framerate ${FPS} -i "${path.join(seqDir, "%06d.jpg")}" -c:v libx264 -preset medium -crf 20 -pix_fmt yuv420p -movflags +faststart "${dst}"`, { stdio: "pipe" });
  return Math.round(fs.statSync(dst).size / 1024);
}

async function main() {
  fs.mkdirSync(TMP, { recursive: true });
  fs.mkdirSync(OUT, { recursive: true });
  const browser = await chromium.launch({ executablePath: EXE, headless: true });
  console.log("SHA =", SHA);

  // ---------- 片段 1（目标 15–20s）：D8-PAIR-001 同事件普通互证 ----------
  {
    const { ctx, page, rec } = await newClip(browser, "clip1");
    await page.evaluate(() => window.__sub("跨文档核验页面 · 以下为已有结果回放（公开开发用例）"));
    await page.waitForTimeout(2000);
    await openPairs(page);
    const ok1 = await page.evaluate(() => window.__card("D8-PAIR-001"));
    if (!ok1) throw new Error("D8-PAIR-001 卡片未找到");
    await page.waitForTimeout(700);
    await page.evaluate(() => window.__sub("两份公告对应2026年9月23日同一次股份转让"));
    await page.waitForTimeout(4100);
    await page.evaluate(() => window.__sub("蔚文绪变动前持股均为14,722,917股，双侧引文一致"));
    await page.waitForTimeout(3600);
    await page.evaluate(() => window.__sub("核验页同编号普通互证：字段出处属于保存结果，非实时抽取"));
    await openVerify(page);
    const ok2 = await page.evaluate(() => window.__vgroup("D8-PAIR-001"));
    if (!ok2) throw new Error("核验页 D8-PAIR-001 分组未找到");
    await page.waitForTimeout(500);
    await page.waitForTimeout(4800);
    await endCard(page, 2400);
    const frames = await rec.stop();
    await ctx.close();
    console.log("clip1 frames:", frames);
  }

  // ---------- 片段 2（目标 8–12s）：D8-PAIR-006 不同主体不强行对齐 ----------
  if (process.env.ONLY !== "clip1") {
    const { ctx, page, rec } = await newClip(browser, "clip2");
    await openPairs(page);
    const ok = await page.evaluate(() => window.__card("D8-PAIR-006"));
    if (!ok) throw new Error("D8-PAIR-006 卡片未找到");
    await page.waitForTimeout(800);
    await page.evaluate(() => window.__sub("鸿路钢构与红豆股份是不同公告主体"));
    await page.waitForTimeout(4000);
    await page.evaluate(() => window.__sub("系统不强行对齐比较"));
    await page.waitForTimeout(3200);
    await endCard(page, 2500);
    const frames = await rec.stop();
    await ctx.close();
    console.log("clip2 frames:", frames);
  }

  // ---------- 片段 3（目标 12–15s）：D8-PAIR-013 证据不足保留 ----------
  if (process.env.ONLY !== "clip1") {
    const { ctx, page, rec } = await newClip(browser, "clip3");
    await openPairs(page);
    const ok = await page.evaluate(() => window.__card("D8-PAIR-013"));
    if (!ok) throw new Error("D8-PAIR-013 卡片未找到");
    await page.waitForTimeout(800);
    await page.evaluate(() => window.__sub("一侧扫描件没有足够可读证据"));
    await page.waitForTimeout(4200);
    await page.evaluate(() => window.__sub("系统保留证据不足，不判成不同事件或矛盾"));
    await page.waitForTimeout(4500);
    await endCard(page, 2800);
    const frames = await rec.stop();
    await ctx.close();
    console.log("clip3 frames:", frames);
  }

  await browser.close();

  const map = [
    ["clip1", "片段1_D8-PAIR-001_同事件普通互证"],
    ["clip2", "片段2_D8-PAIR-006_不同主体不强行对齐"],
    ["clip3", "片段3_D8-PAIR-013_证据不足保留"],
  ].filter(([tag]) => (process.env.ONLY === "clip1" ? tag === "clip1" : true));
  for (const [tag, name] of map) {
    const seqDir = path.join(TMP, tag + "_seq");
    const frames = fs.readdirSync(seqDir).filter((f) => f.endsWith(".jpg")).length;
    const dst = path.join(OUT, name + ".mp4");
    const kb = await toMp4(seqDir, dst, frames);
    console.log("MP4:", dst, kb + "KB", frames + "帧");
  }
  console.log("ALL DONE");
}

main().catch((e) => {
  console.error("FAILED:", e.message);
  process.exit(1);
});
