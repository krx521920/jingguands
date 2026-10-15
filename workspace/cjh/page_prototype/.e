{
  "default_engine": "http",
  "engines": [
    {
      "id": "file",
      "label": "本地预生成信封",
      "owner": "陈家浩（页面侧）",
      "kind": "prebuilt",
      "available": true,
      "reason": "本地预生成信封常驻可用（权威批次 data_unified/ + 演示池 data/）",
      "caps": {
        "reruns_extraction": false,
        "needs_pdf": false,
        "same_file_as_peer": true,
        "label": "预生成信封（未重新抽取）"
      }
    },
    {
      "id": "cli",
      "label": "魏文宇抽取 CLI（run_extract.mjs）",
      "owner": "魏文宇（scripts/jingguan/run_extract.mjs，weiwenyu@93c8ae28）",
      "kind": "live",
      "available": false,
      "reason": "入口未接通：EXTRACT_CLI_PARSE_DIR / EXTRACT_CLI_TXT_DIR 均未设（魏的入口收 .txt 或解析 JSON，不收 PDF）；无 LLM 密钥（JINGGUAN_LLM_API_KEY / DEEPSEEK_API_KEY）—— 只能跑 --mock，按魏自述不得计入真实成绩；把密钥写进 page_prototype/.env 即可（该文件不入库）",
      "caps": {
        "reruns_extraction": true,
        "needs_pdf": true,
        "same_file_as_peer": false,
        "label": "独立跑抽取管线"
      }
    },
    {
      "id": "http",
      "label": "魏文宇抽取服务（预留）",
      "owner": "魏文宇（需提供 HTTP 抽取接口）",
      "kind": "live",
      "available": true,
      "reason": "已接通：http://127.0.0.1:8788/extract",
      "caps": {
        "reruns_extraction": true,
        "needs_pdf": true,
        "same_file_as_peer": false,
        "label": "独立跑抽取管线"
      }
    }
  ],
  "live_ready": true,
  "can_rerun_extraction": true
}