// v0「3つの鍵」：鍵ピッキングの読み合い。
//  囚人＝扉を1つ選んでピッキング（その鍵 +1）。
//  看守＝監視（扉を見張る）or 修理（鍵を1つ −1）。
//  同時提出 → 解決。現行犯（監視が囚人の狙った扉と一致）でその鍵は0に。
//  どれかの鍵が goal に達したら囚人の脱出勝ち。maxTurn 凌げば看守勝ち。
const DOORS = 3;
const GOAL = 3;
const MAX_TURN = 20;

export function newGame(seed = Date.now()) {
  const state = {
    seed: seed >>> 0,
    turn: 1,
    maxTurn: MAX_TURN,
    goal: GOAL,
    doors: DOORS,
    locks: Array(DOORS).fill(0),
    phase: "play",
    pending: { prisoner: null, guard: null },
    log: [],
    winner: null,
    winReason: "",
  };
  log(state, `開始：どれかの鍵を${GOAL}まで開ければ脱獄。看守は${MAX_TURN}ターン凌げば勝ち。`);
  return state;
}

function log(state, text) { state.log.push({ turn: state.turn, text }); }

function endGame(state, winner, reason) {
  state.winner = winner;
  state.winReason = reason;
  state.phase = "ended";
  log(state, `決着：${reason}`);
}

export function submitAction(state, role, action) {
  if (state.phase !== "play" || state.winner) return { ok: false, err: "プレイ中ではない" };
  if (state.pending[role]) return { ok: false, err: "提出済み" };

  if (role === "prisoner") {
    const d = action?.door;
    if (!Number.isInteger(d) || d < 0 || d >= state.doors) return { ok: false, err: "扉を選べ" };
    state.pending.prisoner = { door: d };
  } else if (role === "guard") {
    const t = action?.target;
    if ((action?.type !== "watch" && action?.type !== "repair") || !Number.isInteger(t) || t < 0 || t >= state.doors)
      return { ok: false, err: "監視/修理の対象を選べ" };
    state.pending.guard = { type: action.type, target: t };
  } else {
    return { ok: false, err: "役割不明" };
  }

  if (state.pending.prisoner && state.pending.guard) resolveRound(state);
  return { ok: true };
}

function resolveRound(state) {
  const p = state.pending.prisoner, g = state.pending.guard;
  const d = p.door;
  state.pending = { prisoner: null, guard: null };

  if (g.type === "watch" && g.target === d) {
    // 現行犯：見張られた扉でのピッキングは台無し
    state.locks[d] = 0;
    log(state, `現行犯！扉${d + 1}を見張られ、鍵が台無しに（0/${state.goal}）`);
  } else {
    state.locks[d] += 1;
    log(state, `扉${d + 1}をピッキング（${state.locks[d]}/${state.goal}）`);
    if (g.type === "repair") {
      state.locks[g.target] = Math.max(0, state.locks[g.target] - 1);
      log(state, `看守が扉${g.target + 1}を修理（${state.locks[g.target]}/${state.goal}）`);
    } else {
      log(state, `看守は扉${g.target + 1}を見張ったが空振り`);
    }
  }

  const open = state.locks.findIndex((v) => v >= state.goal);
  if (open >= 0) { endGame(state, "prisoner", `扉${open + 1}を開錠して脱獄成功（囚人勝ち）`); return; }

  if (state.turn >= state.maxTurn) { endGame(state, "guard", "期限到達：脱獄を防ぎきった（看守勝ち）"); return; }
  state.turn += 1;
}

export { DOORS, GOAL, MAX_TURN };
