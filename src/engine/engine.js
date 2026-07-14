// ゲーム状態遷移エンジン（純ロジック / Cloudflare非依存＝Nodeでテスト可能）
// 権威サーバ（Durable Object）側でのみ本体stateを持ち、クライアントには霧フィルタ後を配る。
import { makeRng } from "./rng.js";
import { CARD_DEFS, DECKS, HAND_SIZE } from "./cards.js";
import { BUILTIN, neighborsFor, canMove } from "./mapdef.js";

const EVENTS = ["none", "labor", "inspection", "construction", "visit"];
const EVENT_LABEL = {
  none: "特になし", labor: "刑務作業", inspection: "手荷物検査",
  construction: "工事", visit: "面会",
};

// --- 乱数（stateにtickを持たせて再現可能＆シリアライズ可能に） ---
function rngFor(state) {
  const r = makeRng((state.seed + state.tick) >>> 0);
  state.tick = (state.tick + 1) >>> 0;
  return r;
}

function draw(state, role) {
  const deck = DECKS[role];
  const r = rngFor(state);
  const hand = [];
  for (let i = 0; i < HAND_SIZE; i++) hand.push(deck[Math.floor(r() * deck.length)]);
  return hand;
}

function log(state, text) {
  state.log.push({ day: state.day, phase: state.phase, text });
  if (state.log.length > 100) state.log.shift();
}

// --- 新規ゲーム ---
export function newGame(seed = Date.now(), mapDef = BUILTIN) {
  const roles = mapDef.roles;
  const state = {
    seed: seed >>> 0,
    tick: 0,
    day: 1,
    maxDay: 14, // 暫定14日
    phase: "action",
    event: "none",
    musterCalledTonight: false,
    map: mapDef,
    prisoner: {
      pos: roles.prisonerStart, hand: [], resources: 0, contraband: [],
      concealed: false, tunnelProgress: 0, tunnelOpen: false,
      discovered: [...roles.prisonerDiscovered], out: false, escaped: false,
    },
    guard: {
      pos: roles.guardStart, hand: [],
    },
    pending: { prisoner: null, guard: null },
    pursuit: null,
    log: [],
    winner: null, winReason: "",
  };
  startDay(state, true);
  return state;
}

function startDay(state, first = false) {
  if (!first) state.day += 1;
  if (state.day > state.maxDay) {
    endGame(state, "guard", "期日到達：囚人を監督しきった（看守勝ち）");
    return;
  }
  const r = rngFor(state);
  state.event = first ? "none" : EVENTS[Math.floor(r() * EVENTS.length)];
  state.phase = "action";
  state.pending = { prisoner: null, guard: null };
  state.prisoner.concealed = false;
  state.prisoner.hand = draw(state, "prisoner");
  state.guard.hand = draw(state, "guard");
  log(state, `${state.day}日目。イベント：${EVENT_LABEL[state.event]}`);
}

function endGame(state, winner, reason) {
  state.winner = winner;
  state.winReason = reason;
  state.phase = "ended";
  log(state, `決着：${reason}`);
}

// --- 行動フェーズ：提出 ---
export function submitAction(state, role, action) {
  if (state.phase !== "action" || state.winner) return { ok: false, err: "行動フェーズではない" };
  if (state.pending[role]) return { ok: false, err: "提出済み" };
  const card = CARD_DEFS[action?.card];
  if (!card || card.role !== role || !state[role].hand.includes(action.card)) {
    return { ok: false, err: "その手札は出せない" };
  }
  state.pending[role] = { card: action.card, target: action.target ?? null };
  if (state.pending.prisoner && state.pending.guard) resolveRound(state);
  return { ok: true };
}

function resolveRound(state) {
  const P = state.prisoner, G = state.guard;
  const pa = state.pending.prisoner, ga = state.pending.guard;
  const roles = state.map.roles;

  // 1) 移動を同時解決
  if (pa.card === "move" && pa.target && canMove(state, P.pos, pa.target, "prisoner")) {
    P.pos = pa.target;
    if (!P.discovered.includes(P.pos)) P.discovered.push(P.pos);
  }
  if (ga.card === "patrol" && ga.target && canMove(state, G.pos, ga.target, "guard")) {
    G.pos = ga.target;
  }

  // 2) 囚人の非移動アクション
  if (pa.card === "dig" && roles.digSpot && P.pos === roles.digSpot) {
    P.tunnelProgress += 1;
    if (P.tunnelProgress >= roles.tunnelGoal && !P.tunnelOpen) {
      P.tunnelOpen = true;
      log(state, "トンネルが開通した（囚人にのみ見える隠しマス）");
    }
  }
  if (pa.card === "hide") P.concealed = true;
  if (pa.card === "scout") {
    for (const n of neighborsFor(state, P.pos, "prisoner")) {
      if (!P.discovered.includes(n)) P.discovered.push(n);
    }
  }
  if (pa.card === "work") {
    const gain = state.event === "labor" ? 2 : 1;
    P.resources += gain;
    // 工房/工場での作業は工具(禁制品)を得ることがある
    if (state.map.nodes[P.pos]?.work) {
      const r = rngFor(state);
      if (r() < 0.5 && !P.contraband.includes("tool")) P.contraband.push("tool");
    }
  }

  // 3) 看守の非移動アクション＝現行犯判定
  const coLocated = G.pos === P.pos;
  let caught = null;
  const inspectHappens = ga.card === "inspect" || (state.event === "inspection" && coLocated);
  if (inspectHappens && coLocated && P.contraband.length > 0 && !P.concealed) {
    caught = "禁制品の現行犯";
  }
  if (!caught && ga.card === "watch" && coLocated && state.map.nodes[P.pos]?.restricted) {
    caught = "立入禁止区での現行犯";
  }
  if (ga.card === "muster") state.musterCalledTonight = true;

  // 4) 脱獄チェック（出口マスに到達で脱獄成功）
  if (!caught && state.map.nodes[P.pos]?.exit) {
    const via = state.map.nodes[P.pos]?.kind === "tunnel" ? "トンネルから脱獄成功（囚人勝ち）" : "門から脱獄成功（囚人勝ち）";
    endGame(state, "prisoner", via);
    return;
  }

  // 5) アウト→追跡フェーズ
  if (caught) {
    P.out = true;
    log(state, `アウト：${caught}`);
    startPursuit(state);
    return;
  }

  // 6) 夜：点呼チェック
  if (state.musterCalledTonight && roles.musterNode && P.pos !== roles.musterNode) {
    P.out = true;
    log(state, "アウト：点呼不在の現行犯");
    startPursuit(state);
    return;
  }
  state.musterCalledTonight = false;

  // 次の日へ
  startDay(state);
}

// --- 追跡フェーズ ---
function startPursuit(state) {
  state.phase = "pursuit";
  state.pending = { prisoner: null, guard: null };
  state.pursuit = { turnsLeft: 3 };
  log(state, "追跡フェーズ開始：囚人は逃走 or 刃向かう、看守は封鎖・捕縛");
}

export function submitPursuit(state, role, action) {
  if (state.phase !== "pursuit" || state.winner) return { ok: false, err: "追跡フェーズではない" };
  if (state.pending[role]) return { ok: false, err: "提出済み" };
  state.pending[role] = action || {};
  if (state.pending.prisoner && state.pending.guard) resolvePursuit(state);
  return { ok: true };
}

function resolvePursuit(state) {
  const P = state.prisoner, G = state.guard;
  const pa = state.pending.prisoner, ga = state.pending.guard;
  state.pending = { prisoner: null, guard: null };

  // 刃向かう：工具があれば反撃成功の目
  if (pa.type === "fight") {
    if (P.contraband.includes("tool")) {
      const r = rngFor(state);
      if (r() < 0.5) { endGame(state, "prisoner", "看守に刃向かい撃破（囚人勝ち）"); return; }
    }
    endGame(state, "guard", "反撃を制圧して捕縛（看守勝ち）");
    return;
  }

  // 逃走
  if (pa.type === "flee" && pa.to && canMove(state, P.pos, pa.to, "prisoner")) {
    P.pos = pa.to;
    if (!P.discovered.includes(P.pos)) P.discovered.push(P.pos);
  }
  // 出口に到達すれば逃げ切り
  if (state.map.nodes[P.pos]?.exit) {
    endGame(state, "prisoner", "追跡を振り切って脱出（囚人勝ち）");
    return;
  }
  // 看守：追う or マスを被せる（同一マスに到達で捕縛）
  if ((ga.type === "chase" || ga.type === "block") && ga.to && canMove(state, G.pos, ga.to, "guard")) {
    G.pos = ga.to;
  }
  if (G.pos === P.pos) {
    endGame(state, "guard", "マスを被せて捕縛（看守勝ち）");
    return;
  }
  state.pursuit.turnsLeft -= 1;
  if (state.pursuit.turnsLeft <= 0) {
    endGame(state, "guard", "逃げ道を塞ぎきり捕縛（看守勝ち）");
    return;
  }
  log(state, `追跡継続（残り${state.pursuit.turnsLeft}手）`);
}

export { EVENT_LABEL };
