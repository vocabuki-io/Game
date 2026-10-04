// v0「3つの鍵」エンジンのテスト。実行: node test/engine.test.mjs
import assert from "node:assert";
import { newGame, submitAction } from "../src/engine/engine.js";
import { buildView } from "../src/engine/view.js";

let passed = 0;
function test(name, fn) {
  try { fn(); console.log(`  ✓ ${name}`); passed++; }
  catch (e) { console.log(`  ✗ ${name}\n    ${e.message}`); process.exitCode = 1; }
}

// 1ラウンド：囚人の扉 d を掘り、看守は watch/repair を target に。
function round(s, door, gType, gTarget) {
  submitAction(s, "prisoner", { door });
  submitAction(s, "guard", { type: gType, target: gTarget });
}

console.log("engine tests (v0 3つの鍵):");

test("新規ゲームの初期状態", () => {
  const s = newGame(1);
  assert.deepEqual(s.locks, [0, 0, 0]);
  assert.equal(s.turn, 1);
  assert.equal(s.goal, 3);
  assert.equal(s.winner, null);
});

test("同じ扉を3回ピッキング→脱獄勝ち", () => {
  const s = newGame(1);
  round(s, 0, "repair", 2); // 看守は別の扉を修理（妨害できず）
  round(s, 0, "repair", 2);
  round(s, 0, "repair", 2);
  assert.equal(s.locks[0], 3);
  assert.equal(s.winner, "prisoner");
  assert.match(s.winReason, /脱獄/);
});

test("現行犯：監視が一致で鍵が0に", () => {
  const s = newGame(1);
  round(s, 1, "repair", 0); // 扉2を+1
  assert.equal(s.locks[1], 1);
  round(s, 1, "watch", 1);  // 扉2を見張られ現行犯→0
  assert.equal(s.locks[1], 0);
  assert.equal(s.winner, null);
});

test("修理：看守が鍵を-1できる", () => {
  const s = newGame(1);
  round(s, 2, "repair", 0); // 扉3 +1
  round(s, 2, "repair", 2); // 扉3 +1 したが同扉を修理 → 1-1=... 解決順：先に+1(=2)、その後repair target2 -1 =1
  assert.equal(s.locks[2], 1);
});

test("監視が空振りならピッキング成功", () => {
  const s = newGame(1);
  round(s, 0, "watch", 1); // 扉1を掘る・看守は扉2を見張る→空振り
  assert.equal(s.locks[0], 1);
});

test("maxTurnを凌げば看守勝ち", () => {
  const s = newGame(1);
  // 囚人は毎ターン扉1、看守は毎ターンその扉を監視（ずっと現行犯→0のまま）
  for (let i = 0; i < s.maxTurn; i++) round(s, 0, "watch", 0);
  assert.equal(s.winner, "guard");
  assert.match(s.winReason, /看守勝ち/);
});

test("ビュー：両者とも鍵進捗が見える／提出フラグ", () => {
  const s = newGame(1);
  submitAction(s, "prisoner", { door: 0 });
  const pv = buildView(s, "prisoner"), gv = buildView(s, "guard");
  assert.deepEqual(pv.locks, [0, 0, 0]);
  assert.deepEqual(gv.locks, [0, 0, 0]);
  assert.equal(pv.submitted, true);   // 囚人は提出ずみ
  assert.equal(gv.submitted, false);  // 看守は未提出
});

console.log(`\n${passed} passed`);
