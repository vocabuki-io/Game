// 役割別ビュー。v0は情報対称（両者とも鍵の進捗が見える）。
// 隠れているのは「今ターンの相手の選択」だけ＝同時提出で表現。
export function buildView(state, role) {
  return {
    role,
    turn: state.turn,
    maxTurn: state.maxTurn,
    goal: state.goal,
    doors: state.doors,
    locks: [...state.locks],
    phase: state.phase,
    winner: state.winner,
    winReason: state.winReason,
    submitted: !!state.pending[role],
    waiting: { prisoner: !!state.pending.prisoner, guard: !!state.pending.guard },
    log: state.log.slice(-8),
  };
}
