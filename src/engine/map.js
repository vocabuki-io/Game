// すごろく風ノードグラフ（データ駆動＝将来のランダム生成に備える）
// restricted: 囚人が立ち入ると看守に目撃されればアウト対象になる区画
// muster: 点呼マス
export const MAP = {
  nodes: {
    cell:     { id: "cell",     label: "独房",   restricted: false },
    corridor: { id: "corridor", label: "廊下",   restricted: false },
    yard:     { id: "yard",     label: "中庭",   restricted: false, muster: true },
    workshop: { id: "workshop", label: "工房",   restricted: false },
    canteen:  { id: "canteen",  label: "食堂",   restricted: false },
    visit:    { id: "visit",    label: "面会室", restricted: false },
    gate:     { id: "gate",     label: "門",     restricted: true, exit: true },
  },
  edges: {
    cell:     ["corridor"],
    corridor: ["cell", "yard", "workshop", "canteen"],
    yard:     ["corridor", "gate"],
    workshop: ["corridor", "visit"],
    canteen:  ["corridor", "visit"],
    visit:    ["workshop", "canteen"],
    gate:     ["yard"],
  },
  musterNode: "yard",
  // 脱獄関連の暫定パラメータ（要プレイテスト）
  tunnelGoal: 3, // 独房で「掘る」を成功させる回数
  tunnelExitFrom: "cell", // トンネルは独房から掘る
};

// 隠しマス（囚人が作ったトンネル出口）。看守には不可視。
export const TUNNEL_EXIT = "tunnel_exit";

export function neighbors(state, nodeId) {
  const base = MAP.edges[nodeId] ? [...MAP.edges[nodeId]] : [];
  // トンネルが開通していれば独房↔トンネル出口を接続
  if (state.prisoner.tunnelOpen) {
    if (nodeId === MAP.tunnelExitFrom) base.push(TUNNEL_EXIT);
    if (nodeId === TUNNEL_EXIT) base.push(MAP.tunnelExitFrom);
  }
  return base;
}
