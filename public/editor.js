// マップメーカー：グリッド式レベルエディタ。SVGで盤面を描画し、施設(サイズのみの箱)/施設マス(種類付き◎)/
// 中継マス(・)/門/道/隠し通路を配置。保存/読込(localStorage)、JSON入出力対応。
(() => {
  const CELL = 40;
  const STORE = "mapmaker.v1";
  const $ = (id) => document.getElementById(id);

  // 施設マス(◎)に付ける種類（色・名称）。アイデアは自由に追加可。
  const FAC_TYPES = {
    jail:      { label: "牢屋",   color: "#e7d3a1" },
    solitary:  { label: "独房",   color: "#e6c3b0" },
    canteen:   { label: "食堂",   color: "#cfe0c0" },
    factory:   { label: "工場",   color: "#d9d2c0" },
    plaza:     { label: "広場",   color: "#c9dfe6" },
    tower:     { label: "監視塔", color: "#e6c9d0" },
    visit:     { label: "面会室", color: "#d7cfe6" },
    infirmary: { label: "医務室", color: "#e6e0da" },
    yard:      { label: "中庭",   color: "#cfe6cf" },
    vent:      { label: "通気口", color: "#efe0b8" },
  };
  const SIZES = [[1,1],[2,1],[2,2],[3,2],[4,2],[2,3],[3,3],[4,3]];
  const HINTS = {
    select: "要素をタップで選択、ドラッグで移動。選択中は右で編集・Deleteで削除。",
    facility: "タップで施設（サイズだけの部屋）を配置。大きさは左で選択。",
    room: "施設マス◎を配置。種類は左で選択（マス側に種類が付く）。",
    space: "中継マス・をグリッド交点に配置。",
    gate: "門を外周線上に配置（最寄りの辺にスナップ）。",
    edge: "2つのマス/門を順にタップして道—でつなぐ。",
    hidden: "2つのマスを順にタップして隠し通路┈でつなぐ。",
    erase: "タップした要素（マス/施設）を消す。",
  };

  let map = newMap(10, 15);
  let tool = "select";
  let roomType = "jail";   // 施設マス◎に付ける種類
  let facSize = [2, 2];    // 施設(箱)の大きさ
  let sel = null;          // {kind:'node'|'fac', id}
  let edgeFrom = null;
  let drag = null;
  let idc = 1;
  const uid = (p) => `${p}${idc++}`;

  function newMap(cols, rows) {
    return { name: "新規マップ", grid: { cols, rows }, facilities: [], nodes: [], edges: [] };
  }

  // ---------- 描画（共有レンダラ BOARD を使用＝ゲームと同一の見た目） ----------
  function render() {
    let ov = "";
    if (sel && sel.kind === "fac") {
      const f = map.facilities.find((x) => x.id === sel.id);
      if (f) ov += `<rect class="gb-sel" x="${f.x*CELL-2}" y="${f.y*CELL-2}" width="${f.w*CELL+4}" height="${f.h*CELL+4}" rx="3"/>`;
    } else if (sel && sel.kind === "node") {
      const n = node(sel.id);
      if (n) ov += `<circle class="gb-sel" cx="${n.x*CELL}" cy="${n.y*CELL}" r="${CELL*0.42}"/>`;
    }
    if (edgeFrom) { const n = node(edgeFrom); if (n) ov += `<circle class="gb-pick" cx="${n.x*CELL}" cy="${n.y*CELL}" r="${CELL*0.4}"/>`; }
    $("board-holder").innerHTML = BOARD.renderBoardSVG(map, { overlays: ov });
  }

  const node = (id) => map.nodes.find((n) => n.id === id);

  // ---------- 座標変換 ----------
  function toBoard(ev) {
    const svg = $("board-holder").querySelector("svg");
    const r = svg.getBoundingClientRect();
    const W = map.grid.cols * CELL, H = map.grid.rows * CELL;
    return { px: (ev.clientX - r.left) / r.width * W, py: (ev.clientY - r.top) / r.height * H };
  }
  const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));
  function snapPoint(px, py) {
    return { x: clamp(Math.round(px/CELL), 0, map.grid.cols), y: clamp(Math.round(py/CELL), 0, map.grid.rows) };
  }
  function snapBorder(px, py) {
    const gx = clamp(Math.round(px/CELL), 0, map.grid.cols), gy = clamp(Math.round(py/CELL), 0, map.grid.rows);
    const d = [ ["l", gx], ["r", map.grid.cols-gx], ["t", gy], ["b", map.grid.rows-gy] ].sort((a,b)=>a[1]-b[1])[0][0];
    if (d === "l") return { x: 0, y: gy };
    if (d === "r") return { x: map.grid.cols, y: gy };
    if (d === "t") return { x: gx, y: 0 };
    return { x: gx, y: map.grid.rows };
  }
  function snapCell(px, py) {
    return { x: clamp(Math.floor(px/CELL), 0, map.grid.cols-1), y: clamp(Math.floor(py/CELL), 0, map.grid.rows-1) };
  }

  // ---------- ヒットテスト ----------
  function hitNode(px, py) {
    let best = null, bd = CELL*0.5;
    for (const n of map.nodes) {
      const d = Math.hypot(px - n.x*CELL, py - n.y*CELL);
      if (d < bd) { bd = d; best = n; }
    }
    return best;
  }
  function hitFac(px, py) {
    for (let i = map.facilities.length - 1; i >= 0; i--) {
      const f = map.facilities[i];
      if (px >= f.x*CELL && px <= (f.x+f.w)*CELL && py >= f.y*CELL && py <= (f.y+f.h)*CELL) return f;
    }
    return null;
  }

  // ---------- 操作 ----------
  function onDown(ev) {
    if (!$("board-holder").querySelector("svg")) return;
    ev.preventDefault();
    const { px, py } = toBoard(ev);

    if (tool === "select") {
      const n = hitNode(px, py);
      if (n) { sel = { kind: "node", id: n.id }; drag = { kind: "node", id: n.id }; renderProp(); render(); return; }
      const f = hitFac(px, py);
      if (f) { sel = { kind: "fac", id: f.id }; drag = { kind: "fac", id: f.id, ox: px/CELL - f.x, oy: py/CELL - f.y }; renderProp(); render(); return; }
      sel = null; renderProp(); render(); return;
    }
    if (tool === "facility") {
      const c = snapCell(px, py);
      const w = facSize[0], h = facSize[1];
      map.facilities.push({ id: uid("f"), x: clamp(c.x,0,map.grid.cols-w), y: clamp(c.y,0,map.grid.rows-h), w, h });
      render(); return;
    }
    if (tool === "room") {
      const s = snapPoint(px, py);
      map.nodes.push({ id: uid("n"), kind: "room", facType: roomType, x: s.x, y: s.y, label: "" });
      render(); return;
    }
    if (tool === "space") {
      const s = snapPoint(px, py);
      map.nodes.push({ id: uid("n"), kind: "space", x: s.x, y: s.y, label: "" });
      render(); return;
    }
    if (tool === "gate") {
      const s = snapBorder(px, py);
      map.nodes.push({ id: uid("n"), kind: "gate", x: s.x, y: s.y, label: "門" });
      render(); return;
    }
    if (tool === "edge" || tool === "hidden") {
      const n = hitNode(px, py);
      if (!n) { edgeFrom = null; render(); return; }
      if (!edgeFrom) { edgeFrom = n.id; render(); return; }
      if (edgeFrom !== n.id) addEdge(edgeFrom, n.id, tool === "hidden");
      edgeFrom = null; render(); return;
    }
    if (tool === "erase") {
      const n = hitNode(px, py);
      if (n) return removeNode(n.id);
      const f = hitFac(px, py);
      if (f) { map.facilities = map.facilities.filter((x) => x.id !== f.id); render(); }
      return;
    }
  }

  function onMove(ev) {
    if (!drag) return;
    const { px, py } = toBoard(ev);
    if (drag.kind === "node") {
      const n = node(drag.id); if (!n) return;
      const s = n.kind === "gate" ? snapBorder(px, py) : snapPoint(px, py);
      n.x = s.x; n.y = s.y; render();
    } else {
      const f = map.facilities.find((x) => x.id === drag.id); if (!f) return;
      f.x = clamp(Math.round(px/CELL - drag.ox), 0, map.grid.cols - f.w);
      f.y = clamp(Math.round(py/CELL - drag.oy), 0, map.grid.rows - f.h);
      render();
    }
  }
  function onUp() { drag = null; }

  function addEdge(a, b, hidden) {
    if (map.edges.some((e) => (e.a===a&&e.b===b)||(e.a===b&&e.b===a))) return toast("すでに繋がっています");
    map.edges.push({ id: uid("e"), a, b, hidden: !!hidden });
  }
  function removeNode(id) {
    map.nodes = map.nodes.filter((n) => n.id !== id);
    map.edges = map.edges.filter((e) => e.a !== id && e.b !== id);
    if (sel && sel.id === id) sel = null;
    renderProp(); render();
  }

  // ---------- プロパティ ----------
  function renderProp() {
    const el = $("prop-body");
    if (!sel) { el.innerHTML = `<span class="muted">要素を選択すると編集できます</span>`; return; }
    if (sel.kind === "fac") {
      const f = map.facilities.find((x) => x.id === sel.id); if (!f) return;
      el.innerHTML = `
        <label>幅 <input id="pp-w" type="number" min="1" max="${map.grid.cols}" value="${f.w}"></label>
        <label>高 <input id="pp-h" type="number" min="1" max="${map.grid.rows}" value="${f.h}"></label>
        <button id="pp-del" class="primary">この施設を削除</button>`;
      $("pp-w").onchange = (e) => { f.w = clamp(+e.target.value||1,1,map.grid.cols-f.x); render(); };
      $("pp-h").onchange = (e) => { f.h = clamp(+e.target.value||1,1,map.grid.rows-f.y); render(); };
      $("pp-del").onclick = () => { map.facilities = map.facilities.filter((x)=>x.id!==f.id); sel=null; renderProp(); render(); };
    } else {
      const n = node(sel.id); if (!n) return;
      const typeRow = n.kind === "room" ? `
        <label>種類 <select id="pp-ftype">${Object.entries(FAC_TYPES).map(([k,v]) => `<option value="${k}" ${k===n.facType?"selected":""}>${v.label}</option>`).join("")}</select></label>` : "";
      el.innerHTML = `
        <label>種別 <select id="pp-kind">
          <option value="room" ${n.kind==="room"?"selected":""}>◎ 施設マス</option>
          <option value="space" ${n.kind==="space"?"selected":""}>・ 中継マス</option>
          <option value="gate" ${n.kind==="gate"?"selected":""}>門</option>
        </select></label>
        ${typeRow}
        <label>名称 <input id="pp-label" type="text" value="${n.label||""}" placeholder="${n.kind==="room" ? (FAC_TYPES[n.facType]?.label||"") : ""}"></label>
        <button id="pp-del" class="primary">このマスを削除</button>`;
      $("pp-kind").onchange = (e) => {
        n.kind = e.target.value;
        if (n.kind === "room" && !n.facType) n.facType = roomType;
        if (n.kind === "gate") { const s=snapBorder(n.x*CELL,n.y*CELL); n.x=s.x; n.y=s.y; }
        renderProp(); render();
      };
      if (n.kind === "room") $("pp-ftype").onchange = (e) => { n.facType = e.target.value; render(); };
      $("pp-label").oninput = (e) => { n.label = e.target.value; render(); };
      $("pp-del").onclick = () => removeNode(n.id);
    }
  }

  // ---------- パレット/ツールUI ----------
  function buildPalette() {
    $("room-types").innerHTML = Object.entries(FAC_TYPES).map(([k,v]) =>
      `<span class="chip room-type ${k===roomType?"active":""}" data-k="${k}" style="background:${k===roomType?"":v.color}">${v.label}</span>`).join("");
    $("fac-sizes").innerHTML = SIZES.map((s) =>
      `<span class="chip sz ${s[0]===facSize[0]&&s[1]===facSize[1]?"active":""}" data-w="${s[0]}" data-h="${s[1]}">${s[0]}×${s[1]}</span>`).join("");
    document.querySelectorAll(".room-type").forEach((c) => c.onclick = () => { roomType = c.dataset.k; buildPalette(); });
    document.querySelectorAll(".sz").forEach((c) => c.onclick = () => { facSize = [+c.dataset.w, +c.dataset.h]; buildPalette(); });
  }
  function setTool(t) {
    tool = t; edgeFrom = null;
    document.querySelectorAll(".tool").forEach((b) => b.classList.toggle("active", b.dataset.tool === t));
    $("facility-opts").style.display = (t === "facility") ? "" : "none";
    $("room-opts").style.display = (t === "room") ? "" : "none";
    $("hint").textContent = HINTS[t] || "";
    render();
  }

  // ---------- 保存/読込/JSON ----------
  const loadStore = () => { try { return JSON.parse(localStorage.getItem(STORE)) || {}; } catch { return {}; } };
  const saveStore = (o) => localStorage.setItem(STORE, JSON.stringify(o));
  function refreshSaved() {
    const s = loadStore();
    $("saved-list").innerHTML = `<option value="">— 保存済みマップ —</option>` +
      Object.keys(s).map((k) => `<option value="${k}">${k}</option>`).join("");
  }
  function doSave() {
    const name = ($("map-name").value.trim() || map.name || "map");
    map.name = name;
    const s = loadStore(); s[name] = clone(map); saveStore(s); refreshSaved();
    toast(`「${name}」を保存しました`);
  }
  function doLoad() {
    const name = $("saved-list").value; if (!name) return toast("読み込むマップを選択");
    const s = loadStore(); if (!s[name]) return;
    map = clone(s[name]); reseedIds(); sel = null; edgeFrom = null;
    $("map-name").value = name; renderProp(); render(); toast(`「${name}」を読込`);
  }
  function doDel() {
    const name = $("saved-list").value; if (!name) return;
    const s = loadStore(); delete s[name]; saveStore(s); refreshSaved(); toast(`「${name}」を削除`);
  }
  const clone = (o) => JSON.parse(JSON.stringify(o));
  function reseedIds() {
    let m = 1;
    const all = [...map.nodes, ...map.facilities, ...map.edges];
    for (const o of all) { const num = parseInt(String(o.id).replace(/\D/g,"")) || 0; if (num >= m) m = num + 1; }
    idc = m;
  }

  let modalMode = null;
  function openModal(mode) {
    modalMode = mode;
    $("modal-title").textContent = mode === "export" ? "JSON出力（コピー/ダウンロード）" : "JSON読込（貼り付けてOK）";
    $("modal-text").value = mode === "export" ? JSON.stringify(map, null, 2) : "";
    $("modal-ok").textContent = mode === "export" ? "ダウンロード" : "読み込む";
    $("modal").classList.remove("hidden");
  }
  function modalOk() {
    if (modalMode === "export") {
      const blob = new Blob([$("modal-text").value], { type: "application/json" });
      const a = document.createElement("a");
      a.href = URL.createObjectURL(blob); a.download = (map.name || "map") + ".json"; a.click();
      URL.revokeObjectURL(a.href);
    } else {
      try {
        const obj = JSON.parse($("modal-text").value);
        if (!obj.grid || !Array.isArray(obj.nodes)) throw new Error("形式が不正");
        map = obj; map.facilities ||= []; map.edges ||= []; reseedIds();
        sel = null; edgeFrom = null; $("map-name").value = map.name || ""; renderProp(); render();
        toast("JSONを読み込みました");
      } catch (e) { return toast("JSON解析エラー: " + e.message); }
    }
    $("modal").classList.add("hidden");
  }

  // ---------- toast ----------
  let tt = null;
  function toast(t) { const e = $("toast"); e.textContent = t; e.classList.remove("hidden"); clearTimeout(tt); tt = setTimeout(() => e.classList.add("hidden"), 2200); }

  // ---------- 初期化 ----------
  function init() {
    buildPalette();
    document.querySelectorAll(".tool").forEach((b) => b.onclick = () => setTool(b.dataset.tool));
    const bh = $("board-holder");
    bh.addEventListener("pointerdown", onDown);
    bh.addEventListener("pointermove", onMove);
    window.addEventListener("pointerup", onUp);
    window.addEventListener("keydown", (e) => {
      if ((e.key === "Delete" || e.key === "Backspace") && sel) {
        if (sel.kind === "node") removeNode(sel.id);
        else { map.facilities = map.facilities.filter((x)=>x.id!==sel.id); sel=null; renderProp(); render(); }
      }
    });
    $("btn-save").onclick = doSave;
    $("btn-load").onclick = doLoad;
    $("btn-del").onclick = doDel;
    $("btn-new").onclick = () => { if (confirm("新規マップを作成しますか？（未保存は消えます）")) { map = newMap(map.grid.cols, map.grid.rows); sel=null; $("map-name").value=""; renderProp(); render(); } };
    $("btn-clear").onclick = () => { if (confirm("配置を全消去しますか？")) { map.facilities=[]; map.nodes=[]; map.edges=[]; sel=null; renderProp(); render(); } };
    $("btn-grid").onclick = () => {
      const c = parseInt(prompt("列数（横マス）", map.grid.cols)); const r = parseInt(prompt("行数（縦マス）", map.grid.rows));
      if (c>0 && r>0) { map.grid.cols = clamp(c,3,30); map.grid.rows = clamp(r,3,40); render(); }
    };
    $("btn-export").onclick = () => openModal("export");
    $("btn-import").onclick = () => openModal("import");
    $("modal-ok").onclick = modalOk;
    $("modal-cancel").onclick = () => $("modal").classList.add("hidden");
    refreshSaved();
    setTool("select");
    renderProp();
    render();
  }
  init();
})();
