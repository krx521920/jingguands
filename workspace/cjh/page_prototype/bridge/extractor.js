// extractor.js —— 抽取引擎适配层（D12 预留入口）
//
// 为什么有这个文件：
//   D10 的`web_cli_same_result` 被判"未覆盖"，根本原因是页面侧**没有独立跑抽取的能力**——
//   server.js 只做 readFileSync + JSON.parse，消不掉的对比维度。两��边读同一文件，
//   验的只是"读同一文件的两个消费者行为是否一致"（幂等性），不是 Web/CLI 一致性。
//
// 本层做的事：把「数据从哪来」抽象成 provider，页面/接口只认`extract(caseId)`。
//   file  —— 读 data/<case>.json 预生成信封（当前唯一可用，**不是独立抽取**）
//   cli   —— 接魏文宇抽取 CLI run_extract.mjs（EXTRACT_CLI_CMD / EXTRACT_CLI_PARSE_DIR / 密钥）
//   http  —— 预留：HTTP 调魏的抽取服务（EXTRACT_HTTP_URL）
//
// ★ 铁律（写死在这里，不允许后来者绕过）：
//   ① `parity()` 在两侧都是 prebuilt（同源文件）时**必须返回 verdict="not_covered"**，
//      不允许返回 pass。这是 D10 那条造假的根因，不封死就会再犯。
//   ② provider 的`capabilities.reruns_extraction` 必须诚实。file 是 false，
//      页面与成绩单都据此显示"未覆盖"，不允许把它渲染成"一致 ✔"。
//   ③ 未配置的 provider 一律 available()=false 并给出可执行原因，**不静默回落到 file**
//      —— 静默回落就是"假装跑过"，是 D10 已犯过的错。
"use strict";

const fs = require("fs");
const path = require("path");
const { spawnSync } = require("child_process");
const { toContract } = require("./upstream_bridge.js");
// ★ D14：评判标准单一真源。parity() 的判定全部由它给出，本文件不再自带一套判据
//   （早先的 diffEnvelopes 逐字节比较只保留作自检对照组）。
const criteria = require("./parity_criteria.js");

const ROOT = path.resolve(__dirname, "..");
const DATA_DIR = path.join(ROOT, "data");

// ============================================================
// .env 加载（零依赖自实现，12 行）
//
// ★ 为什么要有：密钥不能写进代码、不能提交、也不该每次靠人手动 export。
//   放`.env`（根 .gitignore 已忽略，本机 .git/info/exclude 再兜一层），
//   由本文件读进 process.env，然后现有 available() / spawnSync 逻辑原样可用。
//
//纪律：
//   ① 只在变量**尚未存在于 process.env** 时才注入 ⇒ 真机环境变量永远优先，
//      不会因为本机有个旧 .env 就把 CI/合流会的密钥覆盖掉。
//   ② 解析最简格式`KEY=VALUE`，忽略 # 注释与空行，两种引号都剥掉。
//   ③ 找不到 .env 是正常情况（队友 clone 后没这个文件），静默跳过——
//      此时 available() 会因缺密钥而**显式拒判**，不是假装可用。
function loadDotEnv(dir) {
  const f = path.join(dir, ".env");
  if (!fs.existsSync(f)) return null;
  let text;
  try { text = fs.readFileSync(f, "utf8"); } catch (e) { return null; }
  for (const raw of text.split(/\r?\n/)) {
    const line = raw.trim();
    if (!line || line.startsWith("#")) continue;
    const i = line.indexOf("=");
    if (i <= 0) continue;
    const k = line.slice(0, i).trim();
    let v = line.slice(i + 1).trim();
    if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'"))) v = v.slice(1, -1);
    if (!(k in process.env)) process.env[k] = v;          // ① 已存在的绝不覆盖
  }
  return f;
}

const DOTENV_FILE = loadDotEnv(ROOT);

// ---- provider 能力画像（诚实声明，页面据此渲染）----
const CAPS = {
  prebuilt: { reruns_extraction: false, needs_pdf: false, same_file_as_peer: true,  label: "预生成信封（未重新抽取）" },
  live:     { reruns_extraction: true,  needs_pdf: true,  same_file_as_peer: false, label: "独立跑抽取管线" }
};

// ============================================================
// provider: file —— 读本地预生成信封（当前唯一可用）
// ============================================================
const fileProvider = {
  id: "file",
  label: "本地预生成信封",
  owner: "陈家浩（页面侧）",
  kind: "prebuilt",
  caps: CAPS.prebuilt,

  available() {
    return { ok: true, reason: "data/ 目录常驻可用" };
  },

  list() {
    try {
      return fs.readdirSync(DATA_DIR)
        .filter(f => f.endsWith(".json") && !f.endsWith(".check.json") && f !== "upstream_case.json")
        .map(f => path.basename(f, ".json"))
        .sort();
    } catch { return []; }
  },

  /** @returns {{ok:true, envelope:object, run_meta:object}} */
  run(caseId) {
    const safe = String(caseId);
    if (!/^[A-Za-z0-9_-]+$/.test(safe)) {
      return { ok: false, reason: "数据集名含非法字符（仅允许字母数字下划线连字符）" };
    }
    const file = path.join(DATA_DIR, safe + ".json");
    if (!file.startsWith(DATA_DIR) || !fs.existsSync(file)) {
      return { ok: false, reason: `本地无此信封：data/${safe}.json` };
    }
    let raw;
    try { raw = JSON.parse(fs.readFileSync(file, "utf8")); }
    catch (e) { return { ok: false, reason: "信封解析失败：" + e.message }; }

    // 方核验 sidecar：随数据集走，缺失不报错（D6 起沿用的口径）
    const checkFile = path.join(DATA_DIR, safe + ".check.json");
    if (fs.existsSync(checkFile)) {
      try { raw.check_report = JSON.parse(fs.readFileSync(checkFile, "utf8")); }
      catch { raw.check_report_error = "check sidecar parse failed"; }
    }
    return {
      ok: true,
      envelope: raw,
      run_meta: {
        engine: "file",
        engine_owner: this.owner,
        reruns_extraction: false,
        source_path: path.relative(ROOT, file),
        code_version: (raw.run_meta && raw.run_meta.code_version) || raw.code_version || null,
        upstream_run_id: raw.run_id || null
      }
    };
  }
};

// ============================================================
// provider: cli —— 接魏文宇的抽取 CLI（真正独立跑一次）
//
// ★ 契约已按魏 10-08 交付的 scripts/jingguan/run_extract.mjs 对齐（不再是我 10-07
//   自拟的 env 契约，那份对不上）：
//   调用：  node scripts/jingguan/run_extract.mjs --input <txt>  |  --parse <parse.json>
//           [--event-type pledge|equity_change|award_contract] [--out-dir runs]
//   注意：  ① 走 argv，不走 env（--input / --parse）
//          ② 输入是 .txt 或张的解析 JSON，**不是 PDF** —— 页面侧不做 PDF 解析
//          ③ 输出**落盘** runs/<run_id>/events.json，**不在 stdout** —— 必须读文件
//          ④ 无密钥必须显式 --mock；mock 全程 is_mock=true，按魏自述
//             「不得计入真实抽取成绩」⇒ 本provider **绝不在缺密钥时自动加 --mock**
//
//环境变量：
//   EXTRACT_CLI_CMD        默认 `node scripts/jingguan/run_extract.mjs`
//   EXTRACT_CLI_PARSE_DIR  张的解析 JSON 目录（优先，喂 --parse）
//   EXTRACT_CLI_TXT_DIR    纯文本目录（回退，喂 --input）
//   EXTRACT_CLI_REPO       魏的代码所在仓库根（默认仓库根）
//   EXTRACT_CLI_OUT_DIR    输出根目录（默认 <REPO>/runs）
//   EXTRACT_CLI_TIMEOUT    单例超时 ms（默认 180000）
// ============================================================

/** 命令字符串 → [可执行, ...args]。
 *  spawnSync 不经过 shell，`"node demo/x.js"` 会被当成单个文件名而 ENOENT，必须先拆。
 *  只按空白拆分（不处理引号）—— 抽取命令不含带空格的参数，够用且不引shell 注入面。 */
function splitCommand(cmd) {
  const parts = String(cmd).trim().split(/\s+/).filter(Boolean);
  return [parts[0] || "node", ...parts.slice(1)];
}

const DEFAULT_CLI_CMD = "node scripts/jingguan/run_extract.mjs";

/** 事件类型推断。
 *  ★ caseId 是数据集名，不是契约里的英文事件类型，两边对不上是常态：
 *    - 缩写：`D4-PLD-001`→pledge、`D5-EQC-001`→equity_change、`D6-AWD-007`→award_contract
 *    - 变体：`share_change` 实为 equity_change；`wei_real_D4_scan` 实为 pledge
 *    10-08 只写了英文全称匹配，`D4-PLD-001` 直接落空→ 魏的脚本报
 *    「无法确定事件类型」exit=2，排查时看不出是映射缺失。
 *  ★ 已知覆盖缺口与不入映射的情况（别混为一谈）：
 *    - `bank_guarantee`（events[].event_type=guarantee）不在魏的 registry.mjs 里
 *      （只有 pledge/equity_change/award_contract）⇒ **引擎侧不支持**，须魏扩registry。
 *    - `wei_multi_event_test` 是**测试样本**（且 is_mock=true），本就不该参与真实对照，
 *      不给它硬编映射；用 EXTRACT_CLI_EVENT_TYPE_MAP 按需覆盖。
 *    - 批次级兜底 D4→pledge / D5→equity_change / D6→award_contract，
 *      依据是 D4=PLD 批、D5=EQC 批、D6=AWD 批；批次名不带类型时（如 `wei_real_D4_scan`）靠它。 */
const ET_MAP_DEFAULT = {
  pledge: ["pledge", "PLD", "D4"],
  equity_change: ["equity_change", "equity", "EQC", "share_change", "sharechange", "D5"],
  award_contract: ["award_contract", "award", "AWD", "D6"],
};
function eventTypeMap() {
  try {
    const raw = process.env.EXTRACT_CLI_EVENT_TYPE_MAP;
    if (!raw) return ET_MAP_DEFAULT;
    const custom = JSON.parse(raw);
    const m = {};
    for (const [k, v] of Object.entries(custom)) m[k] = Array.isArray(v) ? v : [v];
    return Object.assign({}, ET_MAP_DEFAULT, m);
  } catch (e) { return ET_MAP_DEFAULT; }
}
function inferEventType(name) {
  // ★ 大小写无关：caseId 实际形态是 `wei_real_awd_001`（小写缩写），
  //   而映射表里写的是 `AWD`（大写）—— 用 includes 区分大小写会全部落空。
  const n = String(name).toLowerCase();
  for (const [type, pats] of Object.entries(eventTypeMap())) {
    if (pats.some(p => n.includes(String(p).toLowerCase()))) return type;
  }
  return null;
}

/** 快照目录里找 caseId 的输入文件。parse 优先，其次 txt，最后 pdf（pdf 不可用，仅提示）。 */
function resolveInput(caseId) {
  const parseDir = process.env.EXTRACT_CLI_PARSE_DIR;
  const txtDir = process.env.EXTRACT_CLI_TXT_DIR;
  if (parseDir) {
    for (const ext of [".parse.json", ".json"]) {
      const p = path.join(parseDir, caseId + ext);
      if (fs.existsSync(p)) return { mode: "--parse", file: p };
    }
  }
  if (txtDir) {
    for (const ext of [".txt", ".md"]) {
      const p = path.join(txtDir, caseId + ext);
      if (fs.existsSync(p)) return { mode: "--input", file: p };
    }
  }
  return null;
}

/** 本地信封里自认 is_mock=true 的数据集（直接扫，不读外部清单——
 *  清单会与实际信封脱节，而脱节正是这类守卫失效的常见方式）。
 *  这类样本永远不参与真实抽取一致性对照。 */
function mockDatasetSet() {
  const out = new Set();
  for (const dir of [path.join(ROOT, "data"), path.join(ROOT, "data_unified")]) {
    if (!fs.existsSync(dir)) continue;
    for (const f of fs.readdirSync(dir)) {
      if (!f.endsWith(".json") || f.endsWith(".check.json") || f === "upstream_case.json") continue;
      try {
        const j = JSON.parse(fs.readFileSync(path.join(dir, f), "utf8"));
        const m = (j.run_meta && j.run_meta.is_mock !== undefined) ? j.run_meta.is_mock : (j.is_mock === true);
        if (m === true) out.add(f.replace(/\.json$/, ""));
      } catch (e) { /* 坏文件跳过，不让守卫整体挂掉 */ }
    }
  }
  return out;
}

const cliProvider = {
  id: "cli",
  label: "魏文宇抽取 CLI（run_extract.mjs）",
  owner: "魏文宇（scripts/jingguan/run_extract.mjs，weiwenyu@93c8ae28）",
  kind: "live",
  caps: CAPS.live,

  available() {
    const cmd = process.env.EXTRACT_CLI_CMD || DEFAULT_CLI_CMD;
    const [exe, ...args] = splitCommand(cmd);
    const parseDir = process.env.EXTRACT_CLI_PARSE_DIR;
    const txtDir = process.env.EXTRACT_CLI_TXT_DIR;
    const missing = [];

    // 入口脚本在不在（按仓库根拼）
    const repo = process.env.EXTRACT_CLI_REPO || path.resolve(ROOT, "..", "..", "..");
    const scriptArg = args.find((a) => a.endsWith(".mjs") || a.endsWith(".js"));
    if (scriptArg) {
      const sp = path.isAbsolute(scriptArg) ? scriptArg : path.join(repo, scriptArg);
      if (!fs.existsSync(sp)) missing.push(`入口脚本不存在：${sp}`);
    }
    if (!parseDir && !txtDir) {
      missing.push("EXTRACT_CLI_PARSE_DIR / EXTRACT_CLI_TXT_DIR 均未设（魏的入口收 .txt 或解析 JSON，不收 PDF）");
    } else {
      for (const [k, d] of [["EXTRACT_CLI_PARSE_DIR", parseDir], ["EXTRACT_CLI_TXT_DIR", txtDir]]) {
        if (d && !fs.existsSync(d)) missing.push(`${k} 目录不存在：${d}`);
      }
    }
    // ★ 密钥：无密钥只能跑 mock，mock 不得计入成绩 ⇒ 直接判未接通
    const hasKey = Boolean(process.env.JINGGUAN_LLM_API_KEY || process.env.DEEPSEEK_API_KEY);
    if (!hasKey) missing.push("无 LLM 密钥（JINGGUAN_LLM_API_KEY / DEEPSEEK_API_KEY）—— 只能跑 --mock，按魏自述不得计入真实成绩；把密钥写进 page_prototype/.env 即可（该文件不入库）");

    return missing.length
      ? { ok: false, reason: "入口未接通：" + missing.join("；"), has_key: hasKey, cmd, dotenv: DOTENV_FILE }
      : { ok: true, reason: `已接通：${cmd}｜输入 ${parseDir || txtDir}`, has_key: hasKey, cmd, dotenv: DOTENV_FILE };
  },

  list() { return []; },   // 由魏的 CLI 自行枚举，页面侧不猜

  run(caseId) {
    const av = this.available();
    if (!av.ok) return { ok: false, reason: av.reason };

    const input = resolveInput(caseId);
    if (!input) {
      return { ok: false, reason: `输入侧无 ${caseId} 的解析 JSON / 纯文本（parse=${process.env.EXTRACT_CLI_PARSE_DIR || "未设"} txt=${process.env.EXTRACT_CLI_TXT_DIR || "未设"}）` };
    }

    // ★ 检查顺序：mock 判定放在最前。
    //   顺序错了会怎样：mock 样本（如 wei_multi_event_test）本身就映射不出事件类型，
    //   若先查映射，报的是「无法推断事件类型」——听起来像我的映射缺一项，
    //   实际是这份数据根本不该参与真实对照。**报错要指向真正的原因。**
    const isMockDataset = mockDatasetSet().has(caseId);
    if (isMockDataset) {
      return { ok: false, reason: `数据集 ${caseId} 自认 is_mock=true —— mock 样本不参与真实抽取一致性对照（不是映射问题）`, mock: true };
    }

    const repo = process.env.EXTRACT_CLI_REPO || path.resolve(ROOT, "..", "..", "..");
    const outRoot = process.env.EXTRACT_CLI_OUT_DIR || path.join(repo, "runs");
    const outDir = path.join(outRoot, "cjh-l4", caseId);
    fs.mkdirSync(outDir, { recursive: true });

    const cmd = process.env.EXTRACT_CLI_CMD || DEFAULT_CLI_CMD;
    const [exe, ...base] = splitCommand(cmd);
    const args = [
      ...base,
      input.mode, input.file,
      "--out-dir", outDir,
    ];
    const et = inferEventType(caseId);
    // ★ 事件类型推不出来时必须本地拒判：让魏那边报「无法确定事件类型」exit=2 是含糊的失败，
    //   排查时看不出是 caseId 映射缺失。两种成因要分开说：
    //   - 已知引擎不支持的类型（guarantee）⇒ 说清是「魏的 registry 没有该事件类型」
    //   - 真的没认出来 ⇒ 说清可加 EXTRACT_CLI_EVENT_TYPE_MAP 覆盖
    if (!et) {
      const unsupported = /guarantee/i.test(caseId);
      return {
        ok: false,
        reason: unsupported
          ? `引擎侧不支持：caseId「${caseId}」是 ${"guarantee"} 类事件，而魏的 registry.mjs 只注册了 pledge/equity_change/award_contract —— 该类无法用 CLI 重跑（须魏扩registry）`
          : `无法从 caseId「${caseId}」推断事件类型（现识别 pledge/PLD、equity_change/EQC/share_change、award_contract/AWD）—— 可用 EXTRACT_CLI_EVENT_TYPE_MAP 覆盖`,
        unsupported_by_engine: unsupported
      };
    }
    args.push("--event-type", et);
    // ★ 刻意不加 --mock：无密钥已在 available() 拒判；此处若加就等于用 mock 顶替真跑

    const t0 = Date.now();
    const r = spawnSync(exe, args, {
      cwd: repo,                                   // 魏的脚本按 import.meta.dirname 定 REPO_ROOT，cwd 需在仓库内
      env: { ...process.env },
      encoding: "utf8",
      timeout: Number(process.env.EXTRACT_CLI_TIMEOUT || 180000),
      maxBuffer: 64 * 1024 * 1024
    });
    const ms = Date.now() - t0;

    if (r.error) return { ok: false, reason: "CLI 调用失败：" + r.error.message };
    if (r.status !== 0) {
      return { ok: false, reason: `CLI exit=${r.status}：${String(r.stderr || r.stdout || "").slice(0, 400)}` };
    }

    // ★ 输出是落盘的 events.json，不在 stdout —— 必须读文件（我 10-07 的自拟契约错在这）
    const outFile = path.join(outDir, "events.json");
    if (!fs.existsSync(outFile)) {
      return { ok: false, reason: `CLI exit=0 但未产出 ${outFile}（stdout: ${String(r.stdout || "").slice(0, 200)}）` };
    }
    let raw;
    try { raw = JSON.parse(fs.readFileSync(outFile, "utf8")); }
    catch (e) { return { ok: false, reason: "events.json 非合法 JSON：" + e.message }; }

    // ★ 二次守卫：产物若自认 mock，立即拒判——防止上游悄悄回落
    const meta = raw.run_meta || {};
    const isMock = meta.is_mock === true || raw.is_mock === true;
    if (isMock) {
      return { ok: false, reason: "CLI 产物 is_mock=true —— mock 成绩不得计入真实抽取一致性", mock: true, out_file: outFile };
    }

    const events = Array.isArray(raw.events) ? raw.events : [];
    return {
      ok: true,
      envelope: raw,
      run_meta: {
        engine: "cli",
        engine_owner: this.owner,
        reruns_extraction: true,
        source_path: input.file,
        input_mode: input.mode,
        code_version: meta.code_version || raw.code_version || null,
        upstream_run_id: raw.run_id || null,
        events_total: events.length,
        elapsed_ms: ms,
        cli_stderr: String(r.stderr || "").slice(0, 500) || null
      }
    };
  }

};

// ============================================================
// provider: http —— 预留：HTTP 调魏的抽取服务
//   EXTRACT_HTTP_URL  形如 `http://127.0.0.1:8800/extract`
//   调用：GET <URL>?case_id=xxx   期望返回信封 JSON
// ============================================================
const httpProvider = {
  id: "http",
  label: "魏文宇抽取服务（预留）",
  owner: "魏文宇（需提供 HTTP 抽取接口）",
  kind: "live",
  caps: CAPS.live,

  available() {
    const url = process.env.EXTRACT_HTTP_URL;
    return url
      ? { ok: true, reason: `已接通：${url}` }
      : { ok: false, reason: "入口未接通：EXTRACT_HTTP_URL（未设上游抽取服务地址）" };
  },

  list() { return []; },

  async run(caseId) {
    const av = this.available();
    if (!av.ok) return { ok: false, reason: av.reason };
    const base = process.env.EXTRACT_HTTP_URL;
    const url = base + (base.includes("?") ? "&" : "?") + "case_id=" + encodeURIComponent(caseId);

    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), Number(process.env.EXTRACT_HTTP_TIMEOUT || 120000));
    let res, text;
    try {
      res = await fetch(url, { signal: ctrl.signal });
      text = await res.text();
    } catch (e) {
      return { ok: false, reason: "上游抽取服务不可达：" + e.message };
    } finally { clearTimeout(timer); }

    if (!res.ok) return { ok: false, reason: `上游 HTTP ${res.status}：${text.slice(0, 200)}` };
    let raw;
    try { raw = JSON.parse(text); }
    catch (e) { return { ok: false, reason: "上游返回非合法 JSON：" + e.message }; }

    return {
      ok: true,
      envelope: raw,
      run_meta: {
        engine: "http",
        engine_owner: this.owner,
        reruns_extraction: true,
        source_path: url,
        code_version: (raw.run_meta && raw.run_meta.code_version) || raw.code_version || null,
        upstream_run_id: raw.run_id || null
      }
    };
  }
};

const PROVIDERS = { file: fileProvider, cli: cliProvider, http: httpProvider };

// ============================================================
// 统一入口
// ============================================================

/** 引擎清单（页面与 /api/engines 用；诚实暴露可用性，不粉饰） */
function describeEngines() {
  return Object.values(PROVIDERS).map(p => {
    const av = p.available();
    return {
      id: p.id, label: p.label, owner: p.owner, kind: p.kind,
      available: av.ok, reason: av.reason, caps: p.caps
    };
  });
}

function defaultEngine() {
  const live = Object.values(PROVIDERS).filter(p => p.kind === "live" && p.available().ok);
  if (live.length) return live[0].id;
  return "file";
}

/**
 * 抽取一个 case 的信封（过桥到契约 v0.3）。
 * @returns {{ok:true, data:object, engine:string, run_meta:object} | {ok:false, reason:string, engine:string}}
 */
async function extract(caseId, engineId) {
  const p = PROVIDERS[engineId || defaultEngine()];
  if (!p) return { ok: false, engine: engineId || null, reason: `未知引擎：${engineId}` };
  const av = p.available();
  if (!av.ok) return { ok: false, engine: p.id, reason: av.reason };

  const r = await p.run(caseId);
  if (!r.ok) return { ok: false, engine: p.id, reason: r.reason };
  // ★ 转接口返回 {envelope, view, contract_validation}：engine抽取通道消费 **view**
  //   （页面渲染投影），契约本体与校验结果并列挂在 view 上，供页面显示合规状态。
  const bridged = toContract(r.envelope);
  const view = bridged.view || bridged;
  view.contract_validation = bridged.contract_validation || null;
  return {
    ok: true, engine: p.id, data: view,
    run_meta: Object.assign({ contract_version: "0.3" }, r.run_meta)
  };
}

// ============================================================
// Web/CLI 对照（D10 那条的真实实现）
// ============================================================

/** 业务键（★不能用 event_id / 序号 —— 信封与 Gold 两侧事件编排独立，按 ID 配对必假失配） */
function evKey(ev) {
  const f = ev.fields || {};
  const g = n => { const v = f[n]; return v == null ? "" : String(v.value ?? v.raw_value ?? ""); };
  if (ev.event_type === "pledge") return `pledge|${g("pledgor")}|${g("pledgee")}|${g("direction")}`;
  if (ev.event_type === "equity_change") return `equity_change|${g("holder")}|${g("direction")}`;
  return `award_contract|${g("bidder")}|${g("project_name")}`;
}

function fieldRows(envelope) {
  const rows = new Map();          // evKey → { field → {status, value} }
  for (const ev of envelope.events || []) {
    const k = evKey(ev);
    if (!rows.has(k)) rows.set(k, {});
    const bucket = rows.get(k);
    for (const [n, fv] of Object.entries(ev.fields || {})) {
      bucket[n] = { status: fv.status, value: fv.raw_value ?? fv.value ?? null };
    }
  }
  return rows;
}

/** 逐字段比对两个信封。返回 {pairs, only_a, only_b, same, diff[], compared} */
function diffEnvelopes(a, b) {
  const A = fieldRows(a), B = fieldRows(b);
  const keys = new Set([...A.keys(), ...B.keys()]);
  const out = { pairs: 0, only_a: [], only_b: [], same: 0, compared: 0, diff: [] };
  for (const k of keys) {
    if (!B.has(k)) { out.only_a.push(k); continue; }
    if (!A.has(k)) { out.only_b.push(k); continue; }
    out.pairs++;
    const fa = A.get(k), fb = B.get(k);
    const names = new Set([...Object.keys(fa), ...Object.keys(fb)]);
    for (const n of names) {
      out.compared++;
      const x = fa[n], y = fb[n];
      if (!x || !y) { out.diff.push({ ev: k, field: n, a: x ? x.status : "(缺)", b: y ? y.status : "(缺)", kind: "presence" }); continue; }
      if (x.status !== y.status) { out.diff.push({ ev: k, field: n, a: x.status, b: y.status, kind: "status" }); continue; }
      const sameVal = JSON.stringify(x.value) === JSON.stringify(y.value);
      if (sameVal) out.same++;
      else out.diff.push({ ev: k, field: n, a: x.value, b: y.value, kind: "value" });
    }
  }
  return out;
}

/**
 * ★ Web/CLI 对照。**同源即拒判**。
 * @returns {{verdict:"pass"|"mismatch"|"not_covered", ...}}
 *   not_covered —— 两侧都是预生成信封（同一文件/同一抽取批），不构成对照，按 D10 决议标未覆盖。
 */
async function parity(caseIds, opts) {
  const aEngine = (opts && opts.a) || "file";
  const bEngine = (opts && opts.b) || "cli";

  const A = PROVIDERS[aEngine], B = PROVIDERS[bEngine];
  if (!A || !B) return { verdict: "not_covered", reason: `未知引擎：${!A ? aEngine : bEngine}` };

  const avA = A.available(), avB = B.available();
  if (!avA.ok || !avB.ok) {
    return {
      verdict: "not_covered",
      reason: "对照所需引擎未全部接通",
      blockers: [!avA.ok ? { engine: aEngine, reason: avA.reason } : null, !avB.ok ? { engine: bEngine, reason: avB.reason } : null].filter(Boolean),
      remedy: "魏文宇的入口 scripts/jingguan/run_extract.mjs 已交付（weiwenyu@93c8ae28）。页面侧需设 EXTRACT_CLI_PARSE_DIR（张的 sample/D4|D5/parse/）与 LLM 密钥（JINGGUAN_LLM_API_KEY）；无密钥只能跑 --mock，按魏文宇自述不得计入成绩"
    };
  }

  // ★ 同源拒判：两侧都声明 same_file_as_peer ⇒ 测的是幂等性不是一致性
  if (A.caps.same_file_as_peer && B.caps.same_file_as_peer) {
    return {
      verdict: "not_covered",
      reason: "两侧均为预生成信封（同一次运行的同一文件），只验到「读同一文件的两个消费者行为一致」＝幂等性，未验抽取一致性",
      same_source: true,
      remedy: "至少一侧须为 live 引擎（reruns_extraction=true）"
    };
  }
  if (A.caps.same_file_as_peer && A.id === B.id) {
    return { verdict: "not_covered", reason: "两侧是同一个引擎", same_source: true };
  }

  // ★ 显式区分「未传」与「传了空列表」：
  //   undefined → 取引擎自带清单（正常全量）
  //   []        → 调用方明确表示无对照对象，必须判 not_covered，不能静默展开成全量跑
  if (Array.isArray(caseIds) && caseIds.length === 0) {
    return {
      verdict: "not_covered",
      reason: "调用方传入空对照清单 —— 无对照对象，不构成通过",
      a_engine: aEngine, b_engine: bEngine,
      cases_total: 0, cases_ran: 0, cases_failed: 0,
      fields_compared: 0, fields_same: 0, diff_total: 0, unpaired_total: 0,
      cases: []
    };
  }
  const list = caseIds && caseIds.length ? caseIds : A.list();
  const cases = [];
  for (const id of list) {
    const [ra, rb] = [await A.run(id), await B.run(id)];
    if (!ra.ok || !rb.ok) {
      cases.push({ case_id: id, ok: false, reason: [!ra.ok ? `A(${aEngine}): ${ra.reason}` : null, !rb.ok ? `B(${bEngine}): ${rb.reason}` : null].filter(Boolean).join("；") });
      continue;
    }
    // ★ D14：判据不在这里写死 —— 统一走 bridge/parity_criteria.js（评判标准单一真源）。
    //   本函数早先用 diffEnvelopes() 的逐字节比较，那对 LLM 必然大面积假差异。
    //   diffEnvelopes 保留导出，供自检做对照组（量化"逐字节"有多不可用）。
    const j = criteria.judgeEnvelopes(ra.envelope, rb.envelope);
    cases.push({
      case_id: id, ok: true,
      a: { engine: aEngine, code_version: (ra.run_meta && ra.run_meta.code_version) || null, run_id: ra.envelope.run_id || null },
      b: { engine: bEngine, code_version: (rb.run_meta && rb.run_meta.code_version) || null, run_id: rb.envelope.run_id || null },
      // 分级结果（引用本结构必须带 criteria_version，否则不可复现）
      criteria_version: criteria.CRITERIA_VERSION,
      verdict: j.verdict,
      s0: j.s0, s1: j.s1, s2: j.s2, s3: j.s3,
      // 扁平汇总（老字段名保留，避免前端/材料引用断掉）
      pairs: j.s0.paired, compared: j.s2.compared, same: j.s2.equal,
      diff_count: j.s2.value_diff + j.s2.type_diff + j.s1.status_diff + j.s1.missing_in_a + j.s1.missing_in_b,
      only_a: j.s0.only_a, only_b: j.s0.only_b,
      // 差异明细按类别分开，不再混成一个 diff 数组
      value_diff: j.events.flatMap(e => e.value_diff.map(d => ({ ev: e.ev, ...d }))),
      status_diff: j.events.flatMap(e => e.status_diff.map(d => ({ ev: e.ev, ...d }))),
      presence_diff: j.events.flatMap(e => e.presence_diff.map(d => ({ ev: e.ev, ...d }))),
      evidence_diff: j.events.flatMap(e => e.evidence_diff.map(d => ({ ev: e.ev, ...d }))),
      format_only: j.events.flatMap(e => e.format_only.map(d => ({ ev: e.ev, ...d }))),
      type_drift: j.events.flatMap(e => e.type_drift.map(d => ({ ev: e.ev, ...d }))),
      phrases: j.phrases,
    });
  }

  const ran = cases.filter(c => c.ok);
  // ★ 防御：只有带分级结果的用例才参与裁决。
  //   caseId 有可能在跑的过程中失效（文件被删、引擎中途报错），那时 ok=false 且没有 s0..s3。
  //   直接 c.s0.pass 会TypeError——崩掉的自检等于没有自检。
  const judged = ran.filter(c => c.s0 && c.s1 && c.s2 && c.s3);
  const unjudged = ran.length - judged.length;
  const LEVEL_KEYS = ["s0", "s1", "s2", "s3"];              // ★ 小写，与 case 对象键一致
  const hardFail = c => LEVEL_KEYS.some(k => !c[k] || !c[k].pass);
  const totalDiff = judged.reduce((n, c) => n + c.value_diff.length + c.status_diff.length + c.presence_diff.length, 0);
  const totalOnly = judged.reduce((n, c) => n + c.only_a.length + c.only_b.length, 0);

  // ★ 空跑不得判pass —— "一个都没跑成"与"跑了一致"是两件事。
  //   D10 `web_cli_same_result` 就是这么造假的（补cache 块就变 PASS），这里封死同款漏洞。
  if (ran.length === 0) {
    return {
      verdict: "not_covered",
      reason: `对照未跑成任何一例（${cases.length} 例全部失败）—— 空跑不构成通过`,
      a_engine: aEngine, b_engine: bEngine,
      criteria_version: criteria.CRITERIA_VERSION,
      cases_total: cases.length, cases_ran: 0, cases_failed: cases.length,
      fields_compared: 0, fields_same: 0, diff_total: 0, unpaired_total: 0,
      cases
    };
  }
  //部分失败也要显式带上，不能把失败例静默丢掉
  const partial = cases.length - ran.length;
  const passCount = judged.filter(c => !hardFail(c)).length;
  const mismatched = judged.filter(c => hardFail(c));

  return {
    verdict: mismatched.length === 0 ? "pass" : "mismatch",
    a_engine: aEngine, b_engine: bEngine,
    // ★ 引用本结论必须带这四项（判据会变、判据放松过、数字就不可比）
    criteria_version: criteria.CRITERIA_VERSION,
    criteria_meta: {
      levels: criteria.CRITERIA_META.levels,
      normalization_count: criteria.CRITERIA_META.normalization.length,
      registry: criteria.registryStatus(),
      reported_not_vetoed: criteria.CRITERIA_META.reported_not_vetoed,
      not_covered_by_these: criteria.CRITERIA_META.not_covered_by_these,
      required_attribution: criteria.CRITERIA_META.required_attribution,
    },
    cases_total: cases.length, cases_ran: ran.length,
    cases_failed: partial,
    cases_unjudged: unjudged,      // ★ 跑"成功"但没产出可判结果的例数，不许混进通过
    cases_pass: passCount, cases_mismatch: mismatched.length,
    partial: partial > 0,          // ★ true 时不得单独引用本结果当"全量通过"
    fields_compared: judged.reduce((n, c) => n + c.compared, 0),
    fields_same: judged.reduce((n, c) => n + c.same, 0),
    // 格式差异/类型漂移：单列上报，不计入 diff_total，但报告里必须能看见
    format_only_total: judged.reduce((n, c) => n + c.format_only.length, 0),
    type_drift_total: judged.reduce((n, c) => n + c.type_drift.length, 0),
    diff_total: totalDiff, unpaired_total: totalOnly,
    // 不通过的例要能让读者一眼看出卡在哪一级
    // ★ 索引必须用小写：case 对象上的键是 s0/s1/s2/s3（小写），
    //   这里若写成 "S0" 就是 c["S0"] ⇒ undefined ⇒ .pass 抛 TypeError。
    //   曾因此让整个 parity() 崩掉——崩掉的自检等于没有自检，教训同上。
    mismatch_detail: mismatched.map(c => ({
      case_id: c.case_id,
      failed_levels: LEVEL_KEYS.filter(k => !c[k] || !c[k].pass).map(k => k.toUpperCase()),
      value_diff: c.value_diff.slice(0, 10),
      status_diff: c.status_diff.slice(0, 10),
      presence_diff: c.presence_diff.slice(0, 10),
      only_a: c.only_a.slice(0, 5), only_b: c.only_b.slice(0, 5),
    })),
    cases
  };
}

module.exports = { extract, parity, describeEngines, defaultEngine, diffEnvelopes, evKey, PROVIDERS, DOTENV_FILE };
