// エンジンの整合性検証（Nodeで直接実行： node test/engine.test.mjs）
import assert from "node:assert";
import { newGame, submitAction, submitPursuit } from "../src/engine/engine.js";
import { buildView } from "../src/engine/view.js";
import { TUNNEL_EXIT } from "../src/engine/map.js";
import { fromEditor } from "../src/engine/mapdef.js";

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

// エディタJSON（小さなマップ）：独房s・監視塔t・門g・中継m、s-m,m-g,m-t solid＋s-g隠し通路
const EDITOR_MAP = {
  name: "test", grid: { cols: 10, rows: 10 },
  facilities: [{ x: 1, y: 1, w: 2, h: 2 }],
  nodes: [
    { id: "s", kind: "room", facType: "solitary", x: 2, y: 2 },
    { id: "t", kind: "room", facType: "tower", x: 8, y: 8 },
    { id: "m", kind: "space", x: 5, y: 5 },
    { id: "g", kind: "gate", x: 5, y: 0 },
  ],
  edges: [
    { a: "s", b: "m", hidden: false },
    { a: "m", b: "g", hidden: false },
    { a: "m", b: "t", hidden: false },
    { a: "s", b: "g", hidden: true },
  ],
};

test("fromEditor: 変換とロール推定", () => {
  const md = fromEditor(EDITOR_MAP);
  assert.equal(md.roles.prisonerStart, "s", "独房が囚人スタート");
  assert.equal(md.roles.guardStart, "t", "監視塔が看守スタート");
  assert.equal(md.nodes.g.exit, true);
  assert.equal(md.nodes.g.restricted, true);
  assert.equal(md.grid.cols, 10);
  assert.equal(md.nodes.s.x, 2); // グリッド単位のまま
  assert.ok(md.adj.s.some((e) => e.to === "g" && e.hidden), "隠し通路が hidden で入る");
  assert.equal(md.facilities[0].w, 2);
});

test("カスタムマップで門から脱獄→囚人勝ち", () => {
  const s = newGame(11, fromEditor(EDITOR_MAP));
  assert.equal(s.prisoner.pos, "s");
  assert.equal(s.guard.pos, "t");
  round(s, "move", "m", "patrol", "m");  // P:s→m, G:t→m
  round(s, "move", "g", "patrol", "t");  // P:m→g(門), G:m→t（離れる）
  assert.equal(s.winner, "prisoner");
  assert.match(s.winReason, /脱獄/);
});

test("カスタムマップ：隠し通路は看守ビューに出ない", () => {
  const s = newGame(12, fromEditor(EDITOR_MAP));
  const gv = buildView(s, "guard");
  const hiddenShown = gv.map.edges.some((e) => (e.a === "s" && e.b === "g") || (e.a === "g" && e.b === "s"));
  assert.ok(!hiddenShown, "看守には隠し通路が見えない");
  const pv = buildView(s, "prisoner");
  const hiddenP = pv.map.edges.some((e) => e.hidden);
  assert.ok(hiddenP, "囚人には隠し通路が見える");
});

console.log(`\n${passed} passed`);
