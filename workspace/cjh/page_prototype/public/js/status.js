// status.js —— 状态枚举与徽章（单一事实源，页面与接口共用约定）
export const STATUS = {
  success:       { text: "成功",     cls: "b-success" },
  failed:        { text: "失败",     cls: "b-failed" },
  unreadable:    { text: "无法读取", cls: "b-unreadable" },
  pending_review:{ text: "待复核",   cls: "b-pending_review" },
  simulated:     { text: "模拟",     cls: "b-simulated" }
};

export function badge(status) {
  const s = STATUS[status] || { text: status, cls: "b-unreadable" };
  const el = document.createElement("span");
  el.className = "badge " + s.cls;
  el.textContent = s.text;
  return el;
}
