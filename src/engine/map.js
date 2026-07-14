// すごろく風ノードグラフ（データ駆動＝将来のランダム生成に備える）
// 座標(x,y: 0..100)・種別(kind)・所属部屋(room)は表示用メタデータ。ロジックは隣接(edges)のみ使用。
// restricted: 囚人が立ち入ると看守に目撃されればアウト対象になる区画
// muster: 点呼マス / exit: 脱獄できる出口（門）
export const MAP = {
  nodes: {
    cell:     { id: "cell",     label: "独房",   kind: "room",  x: 18, y: 30 },
    corridor: { id: "corridor", label: "廊下",   kind: "space", x: 50, y: 50 },
    yard:     { id: "yard",     label: "中庭",   kind: "room",  x: 50, y: 24, muster: true },
    workshop: { id: "workshop", label: "工房",   kind: "room",  x: 26, y: 72 },
    canteen:  { id: "canteen",  label: "食堂",   kind: "room",  x: 74, y: 70 },
    visit:    { id: "visit",    label: "面会室", kind: "room",  x: 80, y: 34 },
    gate:     { id: "gate",     label: "門A",    kind: "gate",  x: 90, y: 10, restricted: true, exit: true },
    gate_b:   { id: "gate_b",   label: "門B",    kind: "gate",  x: 10, y: 90, restricted: true, exit: true },
  },
  edges: {
    cell:     ["corridor"],
    corridor: ["cell", "yard", "workshop", "canteen"],
    yard:     ["corridor", "gate"],
    workshop: ["corridor", "visit", "gate_b"],
    canteen:  ["corridor", "visit", "gate_b"],
    visit:    ["workshop", "canteen"],
    gate:     ["yard"],
    gate_b:   ["workshop", "canteen"],
  },
  musterNode: "yard",
  // 脱獄関連の暫定パラメータ（要プレイテスト）
  tunnelGoal: 3,          // 独房で「掘る」を成功させる回数
  tunnelExitFrom: "cell", // トンネルは独房から掘る
};

// 隠しマス（囚人が作ったトンネル出口）。看守には不可視。壁の外側に配置。
export const TUNNEL_EXIT = "tunnel_exit";
export const TUNNEL_EXIT_POS = { x: 2, y: 22 };

export function neighbors(state, nodeId) {
  const base = MAP.edges[nodeId] ? [...MAP.edges[nodeId]] : [];
  // トンネルが開通していれば独房↔トンネル出口を接続
  if (state.prisoner.tunnelOpen) {
    if (nodeId === MAP.tunnelExitFrom) base.push(TUNNEL_EXIT);
    if (nodeId === TUNNEL_EXIT) base.push(MAP.tunnelExitFrom);
  }
  return base;
}
