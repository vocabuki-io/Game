// MapDef：ゲームが実際に使う正規化マップ。エンジン/ビューは MAP 定数ではなく MapDef を参照する。
// これにより「標準マップ」もマップメーカーで作ったマップも同じ仕組みで対戦できる。
//
// 形：
//  nodes: { id: {id,label,kind,x(0..100),y(0..100),restricted,exit,muster,secret,work} }
//  adj:   { id: [ {to, hidden} ] }   // 無向（両方向を格納）。hidden=囚人の隠し通路
//  roles: { prisonerStart, prisonerDiscovered:[], guardStart, musterNode|null,
//           digSpot|null, tunnelExit|null, tunnelGoal }
//  facilities: [ {x,y,w,h} ]          // 表示専用の部屋ボックス
import { MAP, TUNNEL_EXIT, TUNNEL_EXIT_POS } from "./map.js";

// ---- 標準マップ（現行 map.js と同一挙動を再現） ----
const B = 0.12; // 標準マップは 0..100 座標を 12x12 グリッドへ
function buildBuiltin() {
  const nodes = {};
  for (const id of Object.keys(MAP.nodes)) {
    const n = MAP.nodes[id];
    nodes[id] = { id, label: n.label, kind: n.kind, x: n.x * B, y: n.y * B,
      restricted: !!n.restricted, exit: !!n.exit, muster: !!n.muster, secret: false,
      work: id === "workshop" };
  }
  nodes[TUNNEL_EXIT] = { id: TUNNEL_EXIT, label: "トンネル出口", kind: "tunnel",
    x: TUNNEL_EXIT_POS.x * B, y: TUNNEL_EXIT_POS.y * B, restricted: false, exit: true, muster: false, secret: true };

  const adj = {};
  for (const id of Object.keys(MAP.edges)) adj[id] = MAP.edges[id].map((to) => ({ to, hidden: false }));
  adj[TUNNEL_EXIT] = adj[TUNNEL_EXIT] || [];

  return {
    grid: { cols: 12, rows: 12 },
    nodes, adj,
    roles: {
      prisonerStart: "cell", prisonerDiscovered: ["cell", "corridor"], guardStart: "yard",
      musterNode: MAP.musterNode, digSpot: MAP.tunnelExitFrom, tunnelExit: TUNNEL_EXIT, tunnelGoal: MAP.tunnelGoal,
    },
    facilities: [],
  };
}
export const BUILTIN = buildBuiltin();

// ---- 隣接ヘルパ（動的なトンネル辺を含む） ----
export function edgesOf(state, id) {
  const out = (state.map.adj[id] || []).slice();
  const r = state.map.roles;
  if (state.prisoner.tunnelOpen && r.digSpot && r.tunnelExit) {
    if (id === r.digSpot) out.push({ to: r.tunnelExit, hidden: true });
    if (id === r.tunnelExit) out.push({ to: r.digSpot, hidden: true });
  }
  return out;
}
// role が省略/prisoner なら隠し通路も通れる。guard は可視の辺のみ。
export function neighborsFor(state, id, role) {
  return edgesOf(state, id).filter((e) => role === "prisoner" || !e.hidden).map((e) => e.to);
}
export function canMove(state, from, to, role) {
  return edgesOf(state, from).some((e) => e.to === to && (role === "prisoner" || !e.hidden));
}

// ---- エディタJSON → MapDef ----
const FAC_LABEL = {
  jail: "牢屋", solitary: "独房", canteen: "食堂", factory: "工場", plaza: "広場",
  tower: "監視塔", visit: "面会室", infirmary: "医務室", yard: "中庭", vent: "通気口",
};

export function fromEditor(json) {
  if (!json || !json.grid || !Array.isArray(json.nodes)) throw new Error("マップ形式が不正");
  const cols = json.grid.cols, rows = json.grid.rows;

  const nodes = {};
  for (const n of json.nodes) {
    const isGate = n.kind === "gate";
    const label = n.label || (n.kind === "room" ? (FAC_LABEL[n.facType] || "部屋") : isGate ? "門" : "");
    nodes[n.id] = {
      id: n.id, label, kind: isGate ? "gate" : n.kind, x: n.x, y: n.y,
      restricted: isGate, exit: isGate, muster: n.kind === "room" && (n.facType === "yard" || n.facType === "plaza"),
      secret: false, work: n.kind === "room" && n.facType === "factory", facType: n.facType || null,
    };
  }

  const adj = {};
  for (const id of Object.keys(nodes)) adj[id] = [];
  for (const e of (json.edges || [])) {
    if (!nodes[e.a] || !nodes[e.b]) continue;
    adj[e.a].push({ to: e.b, hidden: !!e.hidden });
    adj[e.b].push({ to: e.a, hidden: !!e.hidden });
  }

  const rooms = json.nodes.filter((n) => n.kind === "room");
  const gates = json.nodes.filter((n) => n.kind === "gate");
  if (gates.length < 1) throw new Error("門（出口）が1つ以上必要です");
  if (rooms.length < 2) throw new Error("施設マス◎が2つ以上必要です");

  const byType = (t) => rooms.find((n) => n.facType === t);
  const exitIds = gates.map((g) => g.id);

  const prisonerStart = (byType("solitary") || rooms[0]).id;
  let guardStart = (byType("tower") || farthestFrom(nodes, adj, exitIds, prisonerStart) || rooms[rooms.length - 1]).id;
  if (guardStart === prisonerStart && rooms.length > 1)
    guardStart = rooms.find((r) => r.id !== prisonerStart).id;
  const musterRoom = byType("yard") || byType("plaza");

  const discovered = [prisonerStart, ...neighborIds(adj, prisonerStart)];

  return {
    grid: { cols, rows },
    nodes, adj,
    roles: {
      prisonerStart, prisonerDiscovered: [...new Set(discovered)], guardStart,
      musterNode: musterRoom ? musterRoom.id : null,
      digSpot: null, tunnelExit: null, tunnelGoal: 0,
    },
    facilities: (json.facilities || []).map((f) => ({ x: f.x, y: f.y, w: f.w, h: f.h })),
  };
}

function neighborIds(adj, id) { return (adj[id] || []).map((e) => e.to); }

// 出口群から最も遠いノード（可視辺のみのBFS）を返す。guardStart候補用。
function farthestFrom(nodes, adj, exitIds, excludeId) {
  const dist = {};
  const q = [];
  for (const g of exitIds) { dist[g] = 0; q.push(g); }
  while (q.length) {
    const cur = q.shift();
    for (const e of (adj[cur] || [])) {
      if (e.hidden) continue;
      if (dist[e.to] === undefined) { dist[e.to] = dist[cur] + 1; q.push(e.to); }
    }
  }
  let best = null, bd = -1;
  for (const id of Object.keys(nodes)) {
    if (id === excludeId || nodes[id].kind !== "room") continue;
    const d = dist[id] === undefined ? 999 : dist[id];
    if (d > bd) { bd = d; best = nodes[id]; }
  }
  return best;
}
