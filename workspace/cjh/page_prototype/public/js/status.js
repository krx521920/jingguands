// status.js —— 状态枚举与徽章（单一事实源，页面与接口共用约定）
// v0.3：字段级状态对齐魏文宇信封 6 状态（README §四，文案同步约定）：
//   extracted→无徽章正常显示；not_disclosed/not_applicable/not_mentioned/unreadable→status_override；
//   needs_review→pending_review。
export const STATUS = {
  success:        { text: "成功",     cls: "b-success" },
  failed:         { text: "失败",     cls: "b-failed" },
  unreadable:     { text: "无法读取", cls: "b-unreadable" },
  pending_review: { text: "待复核",   cls: "b-pending_review" },
  simulated:      { text: "模拟",     cls: "b-simulated" },
  not_disclosed:  { text: "未披露",   cls: "b-neutral" },   // 原文明示未披露，不推断
  not_applicable: { text: "不适用",   cls: "b-neutral" },   // 结构性不适用于该事件
  not_mentioned:  { text: "未提及",   cls: "b-neutral" }    // 原文压根没提到（≠未披露，分开计分）
};

export function badge(status) {
  const s = STATUS[status] || { text: status, cls: "b-unreadable" };
  const el = document.createElement("span");
  el.className = "badge " + s.cls;
  el.textContent = s.text;
  return el;
}
