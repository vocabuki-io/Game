// 役割別ビュー：本体stateから「その役割が見てよい情報だけ」を抽出する（state.map駆動）。
//  - 囚人：未探索マスは伏せマス（位置は見えるが中身=ラベル不明）。隠しマス/隠し通路は囚人だけ見える。
//  - 看守：全マス・囚人位置は見えるが、手札/禁制品/脱獄進捗は不明。隠しマス・隠し通路は不可視。
import { neighborsFor, edgesOf } from "./mapdef.js";
import { CARD_DEFS } from "./cards.js";

function cardView(id) {
  const c = CARD_DEFS[id];
  return { id, label: c.label, needsTarget: c.needsTarget, desc: c.desc };
}

function meta(n, extra) {
  return { id: n.id, x: n.x, y: n.y, kind: n.kind, restricted: !!n.restricted, exit: !!n.exit, muster: !!n.muster, ...extra };
}

export function buildView(state, role) {
  const base = {
    role,
    day: state.day, maxDay: state.maxDay,
    phase: state.phase, event: state.event,
    winner: state.winner, winReason: state.winReason,
    waiting: { prisoner: !!state.pending.prisoner, guard: !!state.pending.guard },
    pursuit: state.pursuit ? { turnsLeft: state.pursuit.turnsLeft } : null,
    log: state.log.slice(-8),
    facilities: state.map.facilities || [],
  };
  return role === "prisoner" ? prisonerView(state, base) : guardView(state, base);
}

function prisonerView(state, base) {
  const P = state.prisoner, G = state.guard, M = state.map;
  const known = new Set(P.discovered);

  const visible = (id) => !(M.nodes[id].secret && !P.tunnelOpen); // 隠しマスは開通後のみ

  const nodes = [];
  for (const id of Object.keys(M.nodes)) {
    const n = M.nodes[id];
    if (!visible(id)) continue;
    const isKnown = known.has(id) || n.secret;
    nodes.push(meta(n, { hidden: !!n.secret, known: isKnown, label: isKnown ? n.label : null }));
  }

  const edges = [];
  const seen = new Set();
  for (const id of Object.keys(M.nodes)) {
    if (!visible(id)) continue;
    for (const e of edgesOf(state, id)) {
      if (!visible(e.to)) continue;
      const key = id < e.to ? `${id}|${e.to}` : `${e.to}|${id}`;
      if (seen.has(key)) continue;
      seen.add(key);
      edges.push({ a: id, b: e.to, hidden: !!e.hidden });
    }
  }

  return {
    ...base,
    map: { nodes, edges },
    self: {
      pos: P.pos, resources: P.resources, contraband: [...P.contraband],
      concealed: P.concealed, tunnelProgress: P.tunnelProgress,
      tunnelGoal: M.roles.tunnelGoal, tunnelOpen: P.tunnelOpen, canDig: !!M.roles.digSpot,
    },
    hand: P.hand.map(cardView),
    guardPos: known.has(G.pos) ? G.pos : null, // 発見済みマスにいる看守だけ見える
    legalMoves: neighborsFor(state, P.pos, "prisoner"),
  };
}

function guardView(state, base) {
  const P = state.prisoner, G = state.guard, M = state.map;

  const nodes = [];
  for (const id of Object.keys(M.nodes)) {
    if (M.nodes[id].secret) continue; // 隠しマスは看守に見えない
    nodes.push(meta(M.nodes[id], { known: true, label: M.nodes[id].label }));
  }

  const edges = [];
  const seen = new Set();
  for (const id of Object.keys(M.nodes)) {
    if (M.nodes[id].secret) continue;
    for (const e of (M.adj[id] || [])) {
      if (e.hidden || M.nodes[e.to]?.secret) continue; // 隠し通路は看守に見えない
      const key = id < e.to ? `${id}|${e.to}` : `${e.to}|${id}`;
      if (seen.has(key)) continue;
      seen.add(key);
      edges.push({ a: id, b: e.to, hidden: false });
    }
  }

  const prisonerVisible = !M.nodes[P.pos]?.secret; // 隠しマスの囚人は見失う

  return {
    ...base,
    map: { nodes, edges },
    self: { pos: G.pos },
    hand: G.hand.map(cardView),
    prisonerPos: prisonerVisible ? P.pos : null,
    legalMoves: neighborsFor(state, G.pos, "guard"),
  };
}
