// クライアント：WebSocketで権威サーバ(DO)に繋ぎ、役割別ビューをSVGすごろく盤面で描画・操作する。
const $ = (id) => document.getElementById(id);
let ws = null, myRole = null, view = null, prevView = null, pendingCard = null;

const ROLE_JP = { prisoner: "囚人", guard: "看守" };
const ROLE_CH = { prisoner: "囚", guard: "看" };
const EVENT_JP = { none: "特になし", labor: "刑務作業", inspection: "手荷物検査", construction: "工事", visit: "面会" };

// ---- ロビー ----
function loadSavedMaps() {
  try { return JSON.parse(localStorage.getItem("mapmaker.v1")) || {}; } catch { return {}; }
}
function populateMaps() {
  const maps = loadSavedMaps();
  const sel = $("map-select");
  if (!sel) return;
  sel.innerHTML = `<option value="">標準マップ</option>` +
    Object.keys(maps).map((k) => `<option value="${k}">🗺️ ${k}</option>`).join("");
}
function selectedMap() {
  const sel = $("map-select");
  const name = sel ? sel.value : "";
  if (!name) return null;
  return loadSavedMaps()[name] || null;
}

function initLobby() {
  const saved = location.hash.slice(1);
  if (saved) $("room-input").value = decodeURIComponent(saved);
  populateMaps();
  $("join-btn").addEventListener("click", () => {
    const room = $("room-input").value.trim();
    if (!room) return toast("あいことばを入れてください");
    location.hash = encodeURIComponent(room);
    connect(room, selectedMap());
  });
}

function connect(room, map) {
  const proto = location.protocol === "https:" ? "wss" : "ws";
  ws = new WebSocket(`${proto}://${location.host}/api/room/${encodeURIComponent(room)}`);
  ws.addEventListener("open", () => ws.send(JSON.stringify({ t: "join", map })));
  ws.addEventListener("message", onMessage);
  ws.addEventListener("close", () => toast("接続が切れました"));
  ws.addEventListener("error", () => toast("接続エラー"));
}

function onMessage(ev) {
  const msg = JSON.parse(ev.data);
  if (msg.t === "full") { toast("この部屋は満員です"); return; }
  if (msg.t === "joined") {
    myRole = msg.role;
    $("lobby").classList.add("hidden");
    $("game").classList.remove("hidden");
    const rb = $("role-badge");
    rb.textContent = `あなた：${ROLE_JP[myRole]}`;
    rb.className = "badge " + myRole;
    return;
  }
  if (msg.t === "error") { toast(msg.msg); return; }
  if (msg.t === "state") { view = msg.view; render(); prevView = view; }
}

// ---- 描画 ----
function render() {
  detectBursts();
  $("day-badge").textContent = `Day ${view.day}/${view.maxDay}`;
  $("event-badge").textContent = "📅 " + (EVENT_JP[view.event] || view.event);
  renderStatus();
  renderMap();
  renderLog();
  renderControls();
}

function nodeById(id) { return view.map.nodes.find((n) => n.id === id); }
function nodeLabel(id) { const n = nodeById(id); return n ? (n.label || "？マス") : id; }

function renderStatus() {
  const el = $("status");
  if (myRole === "prisoner") {
    const s = view.self;
    const pct = Math.round((s.tunnelProgress / s.tunnelGoal) * 100);
    const tunnel = s.canDig ? `
      <div class="row"><span class="k">トンネル</span><span>${s.tunnelProgress}/${s.tunnelGoal}${s.tunnelOpen ? " ✅開通" : ""}</span></div>
      <div class="bar"><i style="width:${pct}%"></i></div>` : "";
    el.innerHTML = `${tunnel}
      <div class="row"><span class="k">リソース</span><span>${s.resources}</span></div>
      <div class="row"><span class="k">禁制品</span><span>${s.contraband.length ? s.contraband.join(", ") + (s.concealed ? "（隠蔽中）" : "（無防備！）") : "なし"}</span></div>`;
  } else {
    el.innerHTML = `<div class="row"><span class="k">任務</span><span>${view.maxDay}日目まで監督し現行犯を押さえろ</span></div>
      <div class="row"><span class="k">囚人の位置</span><span>${view.prisonerPos ? nodeLabel(view.prisonerPos) : "見失っている…"}</span></div>`;
  }
}

// ---- SVGすごろく盤面 ----
function renderMap() {
  const nodes = view.map.nodes;
  const pos = {}; nodes.forEach((n) => (pos[n.id] = n));
  const me = view.self.pos;
  const foe = myRole === "prisoner" ? view.guardPos : view.prisonerPos;

  const parts = [];
  // 外壁
  parts.push(`<rect class="wall" x="0" y="0" width="100" height="100" rx="3"/>`);

  // 施設ボックス（マップメーカー由来。あれば描画）
  for (const f of (view.facilities || [])) {
    parts.push(`<rect class="fac-box" x="${f.x}" y="${f.y}" width="${f.w}" height="${f.h}" rx="1.5"/>`);
  }

  // 道（edges）。hidden=囚人の隠し通路は破線
  for (const e of view.map.edges) {
    const pa = pos[e.a], pb = pos[e.b];
    if (!pa || !pb) continue;
    parts.push(`<line class="edge ${e.hidden ? "hidden-edge" : ""}" x1="${pa.x}" y1="${pa.y}" x2="${pb.x}" y2="${pb.y}"/>`);
  }

  // 部屋の囲み（施設ボックスが無い場合のみ＝標準マップ向け）
  if (!(view.facilities || []).length) {
    for (const n of nodes) {
      if (n.kind === "room" || n.kind === "gate") {
        parts.push(`<rect class="room-box" x="${n.x - 10}" y="${n.y - 8}" width="20" height="17" rx="1.5"/>`);
      }
    }
  }

  // マス（ノード）
  for (const n of nodes) {
    const isRoomy = n.kind === "room" || n.kind === "gate";
    const r = n.kind === "tunnel" ? 5 : isRoomy ? 5.4 : 3.8;
    let cls = "n";
    if (n.kind === "space") cls += " n-space";
    if (!n.known) cls += " n-unknown";
    else if (n.kind === "tunnel") cls += " n-tunnel";
    else if (n.exit) cls += " n-exit";
    else if (n.restricted) cls += " n-restricted";
    parts.push(`<circle class="${cls}" cx="${n.x}" cy="${n.y}" r="${r}"/>`);
    if (isRoomy && n.known) parts.push(`<circle class="n-ring" cx="${n.x}" cy="${n.y}" r="${r - 1.7}"/>`);
    if (n.known) {
      // 壁際（下寄り）のゲートはラベルを上に出して壁との被りを避ける
      const ly = n.y >= 80 ? n.y - 8 : n.y + (isRoomy ? 11 : 8);
      parts.push(`<text class="lbl" x="${n.x}" y="${ly}" font-size="3.6">${n.label}${n.muster ? " ⚑" : ""}</text>`);
    } else {
      parts.push(`<text class="q" x="${n.x}" y="${n.y + 1.6}" font-size="5.5">？</text>`);
    }
  }

  // コマ（トークン）
  if (pos[me]) parts.push(token(pos[me], -2.4, -2.6, `tok-me${myRole === "guard" ? " guard" : ""}`, ROLE_CH[myRole]));
  if (foe && pos[foe]) parts.push(token(pos[foe], 2.4, 2.8, "tok-foe", ROLE_CH[myRole === "prisoner" ? "guard" : "prisoner"]));

  $("map").innerHTML =
    `<svg class="board" viewBox="-9 -9 118 122" xmlns="http://www.w3.org/2000/svg">${parts.join("")}</svg>`;
}

function token(n, dx, dy, cls, ch) {
  const x = n.x + dx, y = n.y + dy;
  return `<circle class="tok ${cls}" cx="${x}" cy="${y}" r="3.2"/>` +
         `<text class="tok-lbl" x="${x}" y="${y + 1.1}" font-size="3">${ch}</text>`;
}

function renderLog() {
  $("log").innerHTML = (view.log || []).map((l) => `<div class="l">D${l.day}: ${l.text}</div>`).join("");
}

function renderControls() {
  const el = $("controls");
  pendingCard = null;

  if (view.winner) {
    const win = view.winner === myRole;
    el.innerHTML = `<div class="result">
      <h2 class="win-${view.winner}">${win ? "🎉 勝利！" : "敗北…"}</h2>
      <p>${view.winReason}</p>
      <button class="primary" onclick="reset()">もう一度</button>
    </div>`;
    return;
  }

  if (view.phase === "pursuit") return renderPursuit(el);

  if (view.waiting[myRole]) {
    el.innerHTML = `<div class="waiting">提出済み！ 相手の行動を待っています…</div>`;
    return;
  }
  el.innerHTML = `<div class="title">手札から1つ選ぶ</div>
    <div class="cards">${view.hand.map((c, i) =>
      `<button class="card" onclick="chooseCard(${i})"><div class="cl">${c.label}</div><div class="cd">${c.desc}</div></button>`
    ).join("")}</div>
    <div id="target-area"></div>`;
}

function renderPursuit(el) {
  if (view.waiting[myRole]) { el.innerHTML = `<div class="waiting">追跡中… 相手を待っています</div>`; return; }
  const turns = view.pursuit ? view.pursuit.turnsLeft : 0;
  if (myRole === "prisoner") {
    el.innerHTML = `<div class="title">🏃 追跡フェーズ（残り${turns}手）— 逃げるか刃向かうか</div>
      <div class="targets">
        ${view.legalMoves.map((m) => `<button onclick="pursuit('flee','${m}')">逃走→${nodeLabel(m)}</button>`).join("")}
        <button class="primary" onclick="pursuit('fight')">刃向かう（反撃）</button>
      </div>`;
  } else {
    el.innerHTML = `<div class="title">🚨 追跡フェーズ（残り${turns}手）— マスを被せて捕縛せよ</div>
      <div class="targets">
        ${view.legalMoves.map((m) => `<button onclick="pursuit('chase','${m}')">被せる→${nodeLabel(m)}</button>`).join("")}
      </div>`;
  }
}

// ---- バースト演出 ----
function detectBursts() {
  if (!prevView) return;
  if (prevView.phase !== "pursuit" && view.phase === "pursuit") showBurst("アウト！", "red");
  if (!prevView.winner && view.winner) {
    const r = view.winReason || "";
    if (/脱獄|逃げ切|脱出/.test(r)) showBurst("脱獄！", "orange");
    else if (/撃破/.test(r)) showBurst("撃破！", "red");
    else if (/捕縛|確保|制圧|逃げ道/.test(r)) showBurst("確保！", "blue");
    else if (/期日/.test(r)) showBurst("タイムアップ", "blue");
    else showBurst("決着！", "");
  }
}
let burstTimer = null;
function showBurst(text, color) {
  const b = $("burst"), star = b.querySelector(".burst-star");
  star.textContent = text;
  star.className = "burst-star" + (color ? " " + color : "");
  b.classList.remove("hidden");
  clearTimeout(burstTimer);
  burstTimer = setTimeout(() => b.classList.add("hidden"), 1500);
}
window.showBurst = showBurst;

// ---- 操作 ----
window.chooseCard = (i) => {
  const c = view.hand[i];
  if (!c.needsTarget) return send({ t: "action", card: c.id, target: null });
  pendingCard = c;
  $("target-area").innerHTML = `<div class="title">${c.label}：移動先を選ぶ</div>
    <div class="targets">${view.legalMoves.length
      ? view.legalMoves.map((m) => `<button onclick="chooseTarget('${m}')">${nodeLabel(m)}</button>`).join("")
      : "<span class='waiting'>動けるマスがない</span>"}</div>`;
};
window.chooseTarget = (to) => { if (pendingCard) send({ t: "action", card: pendingCard.id, target: to }); };
window.pursuit = (type, to) => send({ t: "pursuit", type, to: to || null });
window.reset = () => send({ t: "reset" });

function send(obj) { if (ws && ws.readyState === 1) ws.send(JSON.stringify(obj)); }

// ---- toast ----
let toastTimer = null;
function toast(text) {
  const t = $("toast"); t.textContent = text; t.classList.remove("hidden");
  clearTimeout(toastTimer); toastTimer = setTimeout(() => t.classList.add("hidden"), 2600);
}

// PWA
if ("serviceWorker" in navigator) navigator.serviceWorker.register("/sw.js").catch(() => {});
initLobby();
