# D8 跨文档索引 —— 交接给 B 流程

> 交出人：张智博（解析层）　日期：2026-10-03
> 收件人：方轩诚（同事件对齐规则）、魏文宇（B 入口与分组输出）

---

## 一、交给你的是什么

两个文件，都在 `zhangzhibo` 分支的 `sample/D8/`：

| 文件 | 内容 |
| --- | --- |
| `cross_index.json` | 文件索引、主体索引、**发行主体索引**、日期索引、**版本索引** |
| `pair_evidence.json` | 对封存的 20 组配对，输出**双方各自的块级锚点** |

**每个索引键都带块级出处**（`block_id` + `page` + `quote`）。

---

## 二、它**不是**结论，是你们规则的输入

**我没有判定任何一组是不是同一事件。** 输出的是「双方各自有什么、各自在哪一块」。

这是刻意的分工：**同公司 ≠ 同一事件**，语义裁决归 B 流程。
我保证的是「给出索引键时能指回哪个文件的哪个块」——关联依据的**可核验性**。

---

## 三、一个可直接用的基线：零误报

对封存的 20 组配对（4 组 `related` + 16 组 `unrelated`）：

| 期望关系 | 组数 | 我的主体键一致 |
| --- | ---: | ---: |
| `related` | 4 | **2** |
| `unrelated` | 16 | **0** |

**16 组对照零误报** —— 「证券代码」这个键在关联信号上是干净的。

**建议把它当基线用**：如果你们的对齐规则在 16 组对照上出现误报，
那是**规则**的问题（键是干净的）；如果在 `related` 组上漏判，
先看是不是落在我下面说的键缺失上。

**2 组 `related` 的漏判有明确原因**：`D5-EQC-003` 是《财务顾问核查意见》，
首页没有证券代码表头，**首块是财务顾问国海证券而不是发行主体** ——
简单规则定不出主体。我已把它列进 `issuer_key_missing`，**没有猜一个可能错的键**。
这一组需要你们的语义裁决。

---

## 四、接口怎么读

```jsonc
// pair_evidence.json
{
  "disclaimer": "本文件不判定是否同一事件；issuer_key_same 只是可核验的关联信号之一。",
  "groups": [{
    "group_id": "D7-XDOC-004",
    "expected_relation": "related",
    "issuer_key_same": true,              // 可核验的关联信号之一，不是结论
    "shared_entities": ["..."],           // 双方都提到的公司名（未做语义判断）
    "missing_parse": [],                  // 缺解析包的成员（目前全为 0）
    "sides": [
      { "case_id": "D5-EQC-004",
        "issuer_key": "code:600267",      // 发行主体键
        "issuer_basis": "证券代码",        // 键的依据（另一可能是「标题公司名」）
        "issuer_anchors": [               // **块级锚点：这条依据出现在哪一块**
          {"block_id": "...", "page": 1, "quote": "证券代码：600267"}],
        "notice_numbers": { "2026-075": [...] },
        "date_candidates": { "2026-09-22": [...] } }
    ]
  }]
}
```

```jsonc
// cross_index.json
{
  "files":          [ /* 30 份：doc_id / file_id / 页数 / 形态 */ ],
  "entity_index":   { /* 公司名 → [{case_id, hits:[{block_id,...}]}] */ },
  "issuer_index":   { "code:600267": ["D5-EQC-004","D5-EQC-005"] },
  "date_index":     { /* 日期候选 → 出处，**未筛公告日期** */ },
  "version_index":  [ /* 发行主体键 → 按公告编号排序的版本链 */ ],
  "issuer_key_missing": ["D5-EQC-003"]   // 定不出主体键的文档，显式列出
}
```

---

## 五、三条使用注意（都是实测踩出来的）

1. **`entity_index` 含非发行主体。**
   实测「中国证券登记结算有限责任公司」出现在 8 份质押公告里 —— 它是**登记结算机构**。
   该索引只表示「该名出现在此文件的此块」，**不代表主体关系**。
   要用它做关联，请配合 `issuer_key` 或你们的语义规则。

2. **`date_index` 未筛公告日期。**
   正文里第一个日期常来自「历史沿革」章节 —— 实测出现过 `2008-02-14`、`2015-05-08`。
   **判公告日期属抽取语义，我不替你们决定。**

3. **`version_index` 的排序用公告编号，不用日期。**
   公告编号（形如 `2026-075`）按主体单调递增，是可靠的排序键。
   实测科创新材两份排成 `2025-097 → 2026-075`。

---

## 六、我需要你们反馈的

1. **`D5-EQC-003` 这类无代码文档，你们打算怎么定主体？**
   如果你们的规则能定出来，请把依据指回具体的块 —— 我可以把它补进
   `issuer_key` 的「标题公司名」回退分支。
2. **`issuer_key_same` 这个信号对你们够不够用？**
   如果不够，请告诉我还需要解析层提供什么粒度（例如某类主体的共现实体、
   或跨页的条款段落切分）。

---

## 附：复现

```bash
python tools/build_cross_index.py sample/D4/parse sample/D5/parse sample/D6/parse -o sample/D8/cross_index.json
python tools/build_pair_evidence.py --index sample/D8/cross_index.json \
  --pairs evaluation/sealed/cross-doc/manifest.json -o sample/D8/pair_evidence.json
```

（`--pairs` 指向宗博文封存清单，在 `zongbowen` 分支的
`evaluation/sealed/cross-doc/manifest.json`。）
