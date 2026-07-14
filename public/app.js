// クライアント：WebSocketで権威サーバ(DO)に繋ぎ、役割別ビューを描画・操作する。
const $ = (id) => document.getElementById(id);
let ws = null, myRole = null, view = null, pendingCard = null;

const ROLE_JP = { prisoner: "囚人", guard: "看守" };
const EVENT_JP = { none: "特になし", labor: "刑務作業", inspection: "手荷物検査", construction: "工事", visit: "面会" };

// ---- ロビー ----
function initLobby() {
  const saved = location.hash.slice(1);
  if (saved) $("room-input").value = decodeURIComponent(saved);
  $("join-btn").addEventListener("click", () => {
    const room = $("room-input").value.trim();
    if (!room) return toast("あいことばを入れてください");
    location.hash = encodeURIComponent(room);
    connect(room);
  });
}

function connect(room) {
  const proto = location.protocol === "https:" ? "wss" : "ws";
  ws = new WebSocket(`${proto}://${location.host}/api/room/${encodeURIComponent(room)}`);
  ws.addEventListener("open", () => ws.send(JSON.stringify({ t: "join" })));
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
  if (msg.t === "state") { view = msg.view; render(); }
}

// ---- 描画 ----
function render() {
  $("day-badge").textContent = `Day ${view.day}/${view.maxDay}`;
  $("event-badge").textContent = "📅 " + (EVENT_JP[view.event] || view.event);
  renderStatus();
  renderMap();
  renderLog();
  renderControls();
}

function renderStatus() {
  const el = $("status");
  if (myRole === "prisoner") {
    const s = view.self;
    const pct = Math.round((s.tunnelProgress / s.tunnelGoal) * 100);
    el.innerHTML = `
      <div class="row"><span class="k">トンネル</span><span>${s.tunnelProgress}/${s.tunnelGoal}${s.tunnelOpen ? " ✅開通" : ""}</span></div>
      <div class="bar"><i style="width:${pct}%"></i></div>
      <div class="row"><span class="k">リソース</span><span>${s.resources}</span></div>
      <div class="row"><span class="k">禁制品</span><span>${s.contraband.length ? s.contraband.join(", ") + (s.concealed ? "（隠蔽中）" : "（無防備！）") : "なし"}</span></div>`;
  } else {
    el.innerHTML = `<div class="row"><span class="k">任務</span><span>${view.maxDay}日目まで監督し、違反の現行犯を押さえろ</span></div>
      <div class="row"><span class="k">囚人の位置</span><span>${view.prisonerPos ? nodeLabel(view.prisonerPos) : "見失っている…"}</span></div>`;
  }
}

function nodeLabel(id) {
  const n = view.map.nodes.find((x) => x.id === id);
  return n ? n.label : id;
}

function renderMap() {
  const me = view.self.pos;
  const foe = myRole === "prisoner" ? view.guardPos : view.prisonerPos;
  $("map").innerHTML = view.map.nodes.map((n) => {
    const cls = ["node"];
    if (!n.known) cls.push("unknown");
    if (n.restricted) cls.push("restricted");
    if (n.exit) cls.push("exit");
    if (n.hidden) cls.push("hiddenNode");
    const pins = [];
    if (n.id === me) pins.push(`<span class="pin me ${myRole}">あなた</span>`);
    if (foe && n.id === foe) pins.push(`<span class="pin foe">${ROLE_JP[myRole === "prisoner" ? "guard" : "prisoner"]}</span>`);
    const tags = [n.restricted ? "立入禁止" : "", n.exit ? "出口" : "", n.hidden ? "隠しマス" : ""].filter(Boolean).join(" / ");
    return `<div class="${cls.join(" ")}">
      <div class="name">${n.label}</div>
      ${tags ? `<div class="tags">${tags}</div>` : ""}
      <div class="pins">${pins.join("")}</div>
    </div>`;
  }).join("");
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

  // 行動フェーズ
  if (view.waiting[myRole]) {
    el.innerHTML = `<div class="waiting">提出済み。相手の行動を待っています…</div>`;
    return;
  }
  el.innerHTML = `<div class="title">手札から1つ選ぶ</div>
    <div class="cards">${view.hand.map((c, i) =>
      `<button class="card" onclick="chooseCard(${i})"><div class="cl">${c.label}</div><div class="cd">${c.desc}</div></button>`
    ).join("")}</div>
    <div id="target-area"></div>`;
}

function renderPursuit(el) {
  if (view.waiting[myRole]) { el.innerHTML = `<div class="waiting">追跡：相手を待っています…</div>`; return; }
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
