// クライアント：WebSocketで権威サーバ(DO)に繋ぎ、役割別UIで「3つの鍵」を操作する。
const $ = (id) => document.getElementById(id);
let ws = null, myRole = null, view = null, prevView = null;

const ROLE_JP = { prisoner: "囚人", guard: "看守" };

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
  if (msg.t === "error") { toast(msg.msg || "エラー"); return; }
  if (msg.t === "joined") {
    myRole = msg.role;
    $("lobby").classList.add("hidden");
    $("game").classList.remove("hidden");
    const rb = $("role-badge");
    rb.textContent = `あなた：${ROLE_JP[myRole]}`;
    rb.className = "badge " + myRole;
    return;
  }
  if (msg.t === "state") {
    prevView = view;
    view = msg.view;
    maybeBurst();
    render();
  }
}

// ---- 描画 ----
function render() {
  $("turn-badge").textContent = `T ${Math.min(view.turn, view.maxTurn)}/${view.maxTurn}`;
  renderLocks();
  renderControls();
  renderLog();
}

function renderLocks() {
  const g = view.goal;
  $("locks").innerHTML = view.locks.map((v, i) => {
    const pips = Array.from({ length: g }, (_, k) => `<span class="pip ${k < v ? "on" : ""}"></span>`).join("");
    const open = v >= g;
    return `<div class="lock ${open ? "open" : ""}">
      <span class="ico">${open ? "🔓" : "🔒"}</span>
      <div class="body"><div class="name">扉 ${i + 1}</div><div class="pips">${pips}</div></div>
      <span class="num">${v}/${g}</span>
    </div>`;
  }).join("");
}

function renderControls() {
  const el = $("controls");
  const hint = $("hint-line");

  if (view.winner) {
    const win = view.winner === myRole;
    hint.textContent = "";
    el.innerHTML = `<div class="result">
      <h2 class="win-${view.winner}">${win ? "🎉 勝利！" : "敗北…"}</h2>
      <p>${view.winReason}</p>
      <button class="primary" id="reset-btn">もう一度</button>
    </div>`;
    $("reset-btn").addEventListener("click", () => ws.send(JSON.stringify({ t: "reset" })));
    return;
  }

  if (view.submitted) {
    hint.textContent = "";
    el.innerHTML = `<div class="waiting">提出ずみ。相手を待っています…</div>`;
    return;
  }

  if (myRole === "prisoner") {
    hint.textContent = "どの扉をピッキングする？（鍵+1 / 看守に見張られると0）";
    el.innerHTML = `<div class="ctrl-group">
      <div class="btn-row">${btns("pick", "鍵", (i) => ({ t: "act", door: i }))}</div>
    </div>`;
  } else {
    hint.textContent = "監視（当てれば現行犯＝0に）か、修理（鍵-1）か。どこを狙う？";
    el.innerHTML = `<div class="ctrl-group">
      <div class="glabel">👁 監視する扉</div>
      <div class="btn-row">${btns("watch", "扉", (i) => ({ t: "act", type: "watch", target: i }))}</div>
      <div class="glabel">🔧 修理する扉</div>
      <div class="btn-row">${btns("repair", "扉", (i) => ({ t: "act", type: "repair", target: i }))}</div>
    </div>`;
  }
  bindActs();
}

function btns(cls, label, payloadFor) {
  return view.locks.map((_, i) =>
    `<button class="act ${cls}" data-payload='${JSON.stringify(payloadFor(i))}'>${label} ${i + 1}</button>`
  ).join("");
}

function bindActs() {
  document.querySelectorAll("#controls .act").forEach((b) => {
    b.addEventListener("click", () => {
      ws.send(b.dataset.payload);
      document.querySelectorAll("#controls .act").forEach((x) => (x.disabled = true));
    });
  });
}

function renderLog() {
  $("log").innerHTML = (view.log || []).map((l) => `<div class="l">T${l.turn}: ${l.text}</div>`).join("");
}

// ---- バースト演出 ----
function maybeBurst() {
  if (!prevView) return;
  if (view.winner && !prevView.winner) {
    showBurst(view.winner === myRole ? "勝利！" : "敗北…");
    return;
  }
  const last = view.log[view.log.length - 1];
  if (last && /現行犯/.test(last.text) && (!prevView.log.length || prevView.log[prevView.log.length - 1].text !== last.text)) {
    showBurst("確保！");
  }
}

function showBurst(text) {
  $("burst-text").textContent = text;
  const b = $("burst");
  b.classList.remove("hidden");
  b.querySelector(".burst-star").style.animation = "none";
  void b.offsetWidth;
  b.querySelector(".burst-star").style.animation = "";
  clearTimeout(showBurst._t);
  showBurst._t = setTimeout(() => b.classList.add("hidden"), 900);
}

// ---- ユーティリティ ----
function toast(text) {
  const el = $("toast");
  el.textContent = text;
  el.classList.remove("hidden");
  clearTimeout(toast._t);
  toast._t = setTimeout(() => el.classList.add("hidden"), 2600);
}

if ("serviceWorker" in navigator) {
  window.addEventListener("load", () => navigator.serviceWorker.register("/sw.js").catch(() => {}));
}

initLobby();
