// 役割別ビュー：本体stateから「その役割が見てよい情報だけ」を抽出する。
// 盤面（壁・部屋・道・座標）は両者に見せるが、"中身"は非対称にマスクする：
//  - 囚人：未探索マスは伏せマス（位置は見えるが中身=ラベル不明）。自作トンネルは自分だけ見える。
//  - 看守：全マス・囚人位置は見えるが、手札/禁制品/脱獄進捗は不明。囚人の作ったトンネルは不可視。
import { MAP, TUNNEL_EXIT, TUNNEL_EXIT_POS, neighbors } from "./map.js";
import { CARD_DEFS } from "./cards.js";

function cardView(id) {
  const c = CARD_DEFS[id];
  return { id, label: c.label, needsTarget: c.needsTarget, desc: c.desc };
}

function baseEdges() {
  const seen = new Set();
  const out = [];
  for (const a of Object.keys(MAP.edges)) {
    for (const b of MAP.edges[a]) {
      const key = a < b ? `${a}|${b}` : `${b}|${a}`;
      if (!seen.has(key)) { seen.add(key); out.push([a, b]); }
    }
  }
  return out;
}

function nodeMeta(id) {
  const n = MAP.nodes[id];
  return { id, x: n.x, y: n.y, kind: n.kind, restricted: !!n.restricted, exit: !!n.exit, muster: !!n.muster };
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

  const nodes = Object.keys(MAP.nodes).map((id) => {
    const m = nodeMeta(id);
    const isKnown = known.has(id);
    return { ...m, known: isKnown, label: isKnown ? MAP.nodes[id].label : null };
  });
  const edges = baseEdges();

  if (P.tunnelOpen) {
    nodes.push({ id: TUNNEL_EXIT, x: TUNNEL_EXIT_POS.x, y: TUNNEL_EXIT_POS.y, kind: "tunnel",
                 exit: true, restricted: false, muster: false, hidden: true, known: true, label: "トンネル出口" });
    edges.push([MAP.tunnelExitFrom, TUNNEL_EXIT]);
  }

  return {
    ...base,
    map: { nodes, edges },
    self: {
      pos: P.pos, resources: P.resources, contraband: [...P.contraband],
      concealed: P.concealed, tunnelProgress: P.tunnelProgress,
      tunnelGoal: MAP.tunnelGoal, tunnelOpen: P.tunnelOpen,
    },
    hand: P.hand.map(cardView),
    // 看守は自分が発見済みのマスにいる時だけ位置が分かる（それ以外は見失う）
    guardPos: known.has(G.pos) ? G.pos : null,
    legalMoves: neighbors(state, P.pos),
  };
}

function guardView(state, base) {
  const P = state.prisoner, G = state.guard;

  // 看守には囚人が作った隠しマス（トンネル）は見えない → 通常マスのみ
  const nodes = Object.keys(MAP.nodes).map((id) => ({ ...nodeMeta(id), known: true, label: MAP.nodes[id].label }));
  const edges = baseEdges();

  // 囚人がトンネル出口(隠しマス)にいると看守は見失う
  const prisonerVisible = P.pos !== TUNNEL_EXIT;

  return {
    ...base,
    map: { nodes, edges },
    self: { pos: G.pos },
    hand: G.hand.map(cardView),
    // 位置は見えるが、手札・禁制品・脱獄進捗は非公開（現行犯でしか確定できない）
    prisonerPos: prisonerVisible ? P.pos : null,
    legalMoves: (MAP.edges[G.pos] || []).slice(),
  };
}
