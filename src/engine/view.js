// 役割別ビュー：本体stateから「その役割が見てよい情報だけ」を抽出する。
// これにより非対称の霧（囚人=未公開マス／看守=囚人の作った隠しマスは不可視）とチート耐性を両立。
import { MAP, TUNNEL_EXIT, neighbors } from "./map.js";
import { CARD_DEFS } from "./cards.js";

function cardView(id) {
  const c = CARD_DEFS[id];
  return { id, label: c.label, needsTarget: c.needsTarget, desc: c.desc };
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
  };
  return role === "prisoner" ? prisonerView(state, base) : guardView(state, base);
}

function prisonerView(state, base) {
  const P = state.prisoner, G = state.guard;
  const known = new Set(P.discovered);
  if (P.tunnelOpen) known.add(TUNNEL_EXIT);

  const nodes = [];
  for (const id of Object.keys(MAP.nodes)) {
    const n = MAP.nodes[id];
    nodes.push(known.has(id)
      ? { id, label: n.label, restricted: !!n.restricted, exit: !!n.exit, known: true }
      : { id, label: "未公開", known: false });
  }
  if (P.tunnelOpen) nodes.push({ id: TUNNEL_EXIT, label: "トンネル出口", exit: true, known: true, hidden: true });

  const edges = [];
  for (const id of known) {
    for (const to of neighbors(state, id)) {
      if (known.has(to)) edges.push([id, to]);
    }
  }

  const legalMoves = neighbors(state, P.pos).filter((n) => known.has(n));

  return {
    ...base,
    map: { nodes, edges },
    self: {
      pos: P.pos, resources: P.resources, contraband: [...P.contraband],
      concealed: P.concealed, tunnelProgress: P.tunnelProgress,
      tunnelGoal: MAP.tunnelGoal, tunnelOpen: P.tunnelOpen,
    },
    hand: P.hand.map(cardView),
    // 看守は自分が見ている（＝発見済み）マスにいる時だけ位置が分かる
    guardPos: known.has(G.pos) ? G.pos : null,
    legalMoves,
  };
}

function guardView(state, base) {
  const P = state.prisoner, G = state.guard;

  const nodes = [];
  for (const id of Object.keys(MAP.nodes)) {
    const n = MAP.nodes[id];
    nodes.push({ id, label: n.label, restricted: !!n.restricted, exit: !!n.exit, known: true });
  }
  // 看守には囚人が作った隠しマス（トンネル）は見えない → nodesに含めない
  const edges = [];
  for (const id of Object.keys(MAP.nodes)) {
    for (const to of (MAP.edges[id] || [])) edges.push([id, to]);
  }

  // 囚人がトンネル出口(隠しマス)にいると看守は見失う
  const prisonerVisible = P.pos !== TUNNEL_EXIT;

  const legalMoves = (MAP.edges[G.pos] || []).slice();

  return {
    ...base,
    map: { nodes, edges },
    self: { pos: G.pos },
    hand: G.hand.map(cardView),
    // 囚人の位置は見えるが、手札・禁制品・脱獄進捗は非公開（現行犯でしか確定できない）
    prisonerPos: prisonerVisible ? P.pos : null,
    legalMoves,
  };
}
