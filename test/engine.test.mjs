// エンジンの整合性検証（Nodeで直接実行： node test/engine.test.mjs）
import assert from "node:assert";
import { newGame, submitAction, submitPursuit } from "../src/engine/engine.js";
import { buildView } from "../src/engine/view.js";
import { TUNNEL_EXIT } from "../src/engine/map.js";

let passed = 0;
function test(name, fn) {
  try { fn(); passed++; console.log("  ✓", name); }
  catch (e) { console.error("  ✗", name, "\n   ", e.message); process.exitCode = 1; }
}

// 手札を強制して1ラウンド行動（テスト用に乱数手札を上書き）
function round(state, pCard, pTarget, gCard, gTarget) {
  state.prisoner.hand = [pCard];
  state.guard.hand = [gCard];
  const r1 = submitAction(state, "prisoner", { card: pCard, target: pTarget ?? null });
  assert.ok(r1.ok, `囚人提出失敗: ${r1.err}`);
  const r2 = submitAction(state, "guard", { card: gCard, target: gTarget ?? null });
  assert.ok(r2.ok, `看守提出失敗: ${r2.err}`);
}

console.log("engine tests:");

test("新規ゲームの初期状態", () => {
  const s = newGame(1);
  assert.equal(s.day, 1);
  assert.equal(s.phase, "action");
  assert.equal(s.winner, null);
  assert.equal(s.prisoner.pos, "cell");
});

test("トンネルを掘って脱獄→囚人勝ち", () => {
  const s = newGame(2);
  // 独房で3回掘る（看守は遠くを巡回）
  round(s, "dig", null, "patrol", "corridor");
  round(s, "dig", null, "patrol", "yard");
  round(s, "dig", null, "patrol", "corridor");
  assert.ok(s.prisoner.tunnelOpen, "トンネルが開通しているはず");
  // トンネル出口へ移動
  round(s, "move", TUNNEL_EXIT, "patrol", "cell");
  assert.equal(s.winner, "prisoner");
  assert.match(s.winReason, /脱獄/);
});

test("禁制品の現行犯→追跡→看守が捕縛", () => {
  const s = newGame(3);
  // 囚人に工具を持たせる（禁制品）。独房で看守が検査。
  s.prisoner.contraband = ["tool"];
  s.guard.pos = "cell"; // 同室
  round(s, "dig", null, "inspect", null); // 隠していないので現行犯
  assert.equal(s.phase, "pursuit", "追跡フェーズに入るはず");
  assert.ok(s.prisoner.out);
  // 追跡：囚人は逃走、看守が同じマスに被せる→捕縛
  s.prisoner.hand = []; // 追跡は手札不要
  submitPursuit(s, "prisoner", { type: "flee", to: "corridor" });
  submitPursuit(s, "guard", { type: "chase", to: "corridor" });
  assert.equal(s.winner, "guard");
});

test("隠す＝検査を防げる（模範囚は倒せない）", () => {
  const s = newGame(4);
  s.prisoner.contraband = ["tool"];
  s.guard.pos = "cell";
  round(s, "hide", null, "inspect", null); // 隠蔽成功で現行犯にならない
  assert.notEqual(s.phase, "pursuit", "隠していれば捕まらない");
  assert.equal(s.winner, null);
});

test("14日逃げ切られる→看守勝ち", () => {
  const s = newGame(5);
  // 囚人は無害に独房で作業、看守も無害に巡回（現行犯なし）
  for (let i = 0; i < 20 && !s.winner; i++) {
    round(s, "work", null, "patrol", "corridor");
  }
  assert.equal(s.winner, "guard");
  assert.match(s.winReason, /期日/);
});

test("霧：囚人は未公開マスが見えない／看守はトンネルが見えない", () => {
  const s = newGame(6);
  const pv = buildView(s, "prisoner");
  const unknown = pv.map.nodes.filter((n) => !n.known);
  assert.ok(unknown.length > 0, "囚人には未公開マスがあるはず");
  // トンネル開通後、看守ビューにトンネル出口が含まれない
  s.prisoner.tunnelOpen = true;
  const gv = buildView(s, "guard");
  assert.ok(!gv.map.nodes.find((n) => n.id === TUNNEL_EXIT), "看守にトンネルは不可視");
  // 看守は囚人の手札・禁制品を知らない
  assert.equal(gv.self.contraband, undefined);
});

test("看守はトンネル出口の囚人を見失う", () => {
  const s = newGame(7);
  s.prisoner.tunnelOpen = true;
  s.prisoner.pos = TUNNEL_EXIT;
  const gv = buildView(s, "guard");
  assert.equal(gv.prisonerPos, null, "隠しマスの囚人は看守に見えない");
});

console.log(`\n${passed} passed`);
