# ui_redesign · 新版 demoweb（张智博）

> 位置：仓库内 `workspace/zhangzhibo/ui_redesign/`（独立工程：**零外部依赖**，Node 内置模块即可运行）
> 与 `workspace/cjh/page_prototype/` 的关系：**并存，不替代**。新版从 page_prototype 的 `/api` 拉真实数据（反向代理），不改动它任何一行。

## 快速开始

```bash
# 1) 先启动原服务（数据源）
cd workspace/cjh/page_prototype && node server.js   # → 8642

# 2) 再启动新版 UI（另一个终端）
cd workspace/zhangzhibo/ui_redesign && node server.js   # → http://127.0.0.1:8762
```

没有 8642 也能开：`snapshot.js` 里烘焙了全部接口数据（30 个数据集结果 + 配对/核验/集成/图表），页面自动回退「静态快照模式」——数据展示照常，上传/导出会提示降级。**甚至双击 index.html 即可离线浏览。**

## 文件清单

| 文件 | 说明 |
|---|---|
| `index.html` | 全部页面与样式（单文件，含浅/深双主题变量系统） |
| `app.js` | 数据层与渲染（字段中文名注册表、六态状态、指纹、剧场、count-up 等） |
| `server.js` | 静态托管 + `/api/*` 反向代理到 8642（零依赖，绑 0.0.0.0 支持局域网） |
| `make_snapshot.js` | 数据快照生成器（8642 在跑时执行 `node make_snapshot.js` 重新烘焙） |
| `snapshot.js` | 生成的快照（3.2MB；若嫌大可 gitignore，部署静态站前再生成） |
| `DESIGN_SPEC.md` | 设计规范 v1→v5.6 全程演进记录（色板/字体/组件/红线） |
| `previews/` | 各章节截图 |

## 设计要点（30 秒版）

- 主题：浅色白皮书 + 深色深空蓝黑双模式（深色主信息色 = 电光蓝 #3B82F6）；皇家紫贯穿线条与交互，鎏金仅目标线/指纹交汇/织纹；
- 记忆点：**紫金织纹封面**（背景由真实数据织成）与**数据指纹**（字段经线 × 证据坐标纬线，换数据集变纹样）；
- 数据真实：全部内容来自 `/api` 实测（页面顶部徽章区分 真实/模拟，模拟横幅符合团队红线）；
- 红线遵守：字段挂 evidence_id、无证据写 null、unknown 绝不渲染为「不同事件」。

## 约定

- 本目录由张智博维护；结构变更请同步更新本 README；
- **不主动 commit/push——等领导明确说「提交」**（与 page_prototype 规矩一致）。
