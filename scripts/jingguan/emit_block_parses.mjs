#!/usr/bin/env node
/**
 * 块级解析导出器（回应宗 W3，2026-10-07）
 *
 * 背景：runs/D9-parses-map.json 的 D6 条目曾指向 corpus/zongbowen/d6/raw/*.raw.json。
 * raw 文件其实带完整块级结构（pages[].blocks[].block_id/source_type/table_ref/header_path），
 * 但下游工具若只读 handoff.source.parse_meta.blocks（六键简约版）就拿不到锚定三键，
 * 宗的 D9 块级复核因此有 3 个 D6 侧做不了。
 *
 * 本脚本把任意解析/原始文件中的 pages[].blocks 全保真导出为独立块级解析文件：
 *   - pages[].blocks：逐块全保真（含 source_type/table_ref/header_path）
 *   - handoff.source.parse_meta.blocks：同一数组的引用拷贝（两种读取路径都能拿到块号）
 *
 * 用法：
 *   node scripts/jingguan/emit_block_parses.mjs <输入.json> <输出.json>
 *   node scripts/jingguan/emit_block_parses.mjs --d6   # 一次导出 D6-AWD-004/005/007
 */
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs'
import { resolve, dirname, basename } from 'node:path'
import { sideWriteResolve } from './lib/side_paths.mjs'

const REPO_ROOT = resolve(import.meta.dirname, '..', '..')
const D6_CASES = ['D6-AWD-001', 'D6-AWD-002', 'D6-AWD-003', 'D6-AWD-004', 'D6-AWD-005', 'D6-AWD-006', 'D6-AWD-007', 'D6-AWD-008', 'D6-AWD-009', 'D6-AWD-010']
const OUT_DIR = 'evaluation/D9/parses-blocks'

function emit(inPath, outPath) {
  const src = JSON.parse(readFileSync(resolve(REPO_ROOT, inPath), 'utf8'))
  const pages = (src.pages ?? []).map((pg) => ({
    page: pg.page,
    width: pg.width ?? null,
    height: pg.height ?? null,
    blocks: (pg.blocks ?? []).map((b) => ({ ...b })),
  }))
  const blocksTotal = pages.reduce((a, p) => a + p.blocks.length, 0)
  if (blocksTotal === 0) throw new Error(`${inPath} 无 pages[].blocks，不能导出块级解析`)
  const out = {
    schema_version: '0.3-blocks',
    doc: {
      doc_id: src.doc?.doc_id ?? null,
      file_id: src.handoff?.source?.file_id ?? src.doc?.file_id ?? null,
      file_name: src.doc?.file_name ?? basename(inPath),
      file_sha256: src.handoff?.source?.file_sha256 ?? src.doc?.file_sha256 ?? null,
      page_count: src.doc?.page_count ?? pages.length,
      parser: src.doc?.parser ?? null,
    },
    pages,
    reading_order: src.reading_order ?? null,
    handoff: {
      source: {
        ...(src.handoff?.source ?? {}),
        parse_meta: {
          parser_version: src.handoff?.source?.parse_meta?.parser_version ?? null,
          page_count: src.doc?.page_count ?? pages.length,
          // 与 pages[].blocks 同一数组的拷贝：兼容只读 handoff 路径的工具（宗复核器）
          blocks: pages.flatMap((p) => p.blocks.map((b) => ({
            block_id: b.block_id, page: b.page, role: b.role,
            text: b.text, text_raw: b.text_raw, region: b.region,
            source_type: b.source_type ?? null,
            table_ref: b.table_ref ?? null,
            header_path: b.header_path ?? b.table_ref?.header_path ?? null,
          }))),
        },
      },
    },
    provenance: {
      derived_from: inPath,
      derivation: 'pages[].blocks 逐块全保真拷贝（无任何字段删改）',
      extracted_by: 'scripts/jingguan/emit_block_parses.mjs',
      extracted_at: new Date().toISOString(),
      note: 'D6 官方 parse-official 入库（张 Z1）后，D9-parses-map 可改指官方件；本文件用于此前阶段的 D9 块级复核',
    },
  }
  // 并包树（delivery/v2.0）上 evaluation/D9/parses-blocks 位于 run-side 镜像：经 sideWriteResolve
  // 落镜像原位更新/新建，再生成物不写进评测正典区（宗 2026-10-10 终审核对单 residual ①）
  const target = sideWriteResolve(REPO_ROOT, outPath)
  const abs = target.path
  mkdirSync(dirname(abs), { recursive: true })
  writeFileSync(abs, JSON.stringify(out, null, 1), 'utf8')
  console.log(`[导出] ${inPath} → ${target.rel}（${blocksTotal} 块，${pages.length} 页）`)
}

const argv = process.argv.slice(2)
if (argv[0] === '--d6') {
  for (const c of D6_CASES) {
    emit(`corpus/zongbowen/d6/raw/${c}.raw.json`, `${OUT_DIR}/${c}.parse-blocks.json`)
  }
} else if (argv.length === 2) {
  emit(argv[0], argv[1])
} else {
  console.error('用法：emit_block_parses.mjs <输入.json> <输出.json> | --d6')
  process.exit(2)
}
