// 共有の盤面レンダラ：マップメーカーとゲームで「同じ見た目・同じサイズ」にするための単一実装。
// グリッド単位(CELL=40)で描画する。map = { grid:{cols,rows}, nodes:[], edges:[], facilities:[] }。
// node: {id,x,y,kind, facType?, label?, restricted?, exit?, muster?, hidden?, known?(既定true)}
// opts: { tokens:[{x,y,cls,ch}], overlays:"<svg片>", showGrid:bool }
(function () {
  const CELL = 40;
  const FAC_COLOR = {
    jail: "#e7d3a1", solitary: "#e6c3b0", canteen: "#cfe0c0", factory: "#d9d2c0", plaza: "#c9dfe6",
    tower: "#e6c9d0", visit: "#d7cfe6", infirmary: "#e6e0da", yard: "#cfe6cf", vent: "#efe0b8",
  };
  const FAC_LABEL = {
    jail: "牢屋", solitary: "独房", canteen: "食堂", factory: "工場", plaza: "広場",
    tower: "監視塔", visit: "面会室", infirmary: "医務室", yard: "中庭", vent: "通気口",
  };

  function renderBoardSVG(map, opts) {
    opts = opts || {};
    const cols = map.grid.cols, rows = map.grid.rows;
    const W = cols * CELL, H = rows * CELL;
    const byId = {}; (map.nodes || []).forEach((n) => (byId[n.id] = n));
    const p = [];

    if (opts.showGrid !== false) {
      for (let x = 0; x <= cols; x++) p.push(`<line class="gb-grid" x1="${x * CELL}" y1="0" x2="${x * CELL}" y2="${H}"/>`);
      for (let y = 0; y <= rows; y++) p.push(`<line class="gb-grid" x1="0" y1="${y * CELL}" x2="${W}" y2="${y * CELL}"/>`);
    }
    for (const f of (map.facilities || []))
      p.push(`<rect class="gb-fac" x="${f.x * CELL}" y="${f.y * CELL}" width="${f.w * CELL}" height="${f.h * CELL}" rx="3"/>`);
    p.push(`<rect class="gb-field" x="1.5" y="1.5" width="${W - 3}" height="${H - 3}"/>`);

    for (const e of (map.edges || [])) {
      const a = byId[e.a], b = byId[e.b];
      if (!a || !b) continue;
      p.push(`<line class="gb-edge ${e.hidden ? "gb-hidden" : ""}" x1="${a.x * CELL}" y1="${a.y * CELL}" x2="${b.x * CELL}" y2="${b.y * CELL}"/>`);
    }

    for (const n of (map.nodes || [])) {
      const cx = n.x * CELL, cy = n.y * CELL;
      if (n.known === false) {
        p.push(`<circle class="gb-n gb-unknown" cx="${cx}" cy="${cy}" r="${CELL * 0.34}"/>`);
        p.push(`<text class="gb-q" x="${cx}" y="${cy + CELL * 0.14}" font-size="${CELL * 0.5}">？</text>`);
        continue;
      }
      if (n.kind === "room") {
        p.push(`<circle class="gb-n gb-room" cx="${cx}" cy="${cy}" r="${CELL * 0.34}" fill="${FAC_COLOR[n.facType] || "#fff"}"/>`);
        p.push(`<circle class="gb-ring" cx="${cx}" cy="${cy}" r="${CELL * 0.21}"/>`);
        const name = n.label || FAC_LABEL[n.facType] || "";
        if (name) p.push(`<text class="gb-lbl" x="${cx}" y="${cy + CELL * 0.5}" font-size="${CELL * 0.28}">${name}${n.muster ? " ⚑" : ""}</text>`);
      } else if (n.kind === "gate") {
        const s = CELL * 0.44;
        p.push(`<rect class="gb-n gb-gate" x="${cx - s / 2}" y="${cy - s / 2}" width="${s}" height="${s}" rx="2"/>`);
      } else if (n.kind === "tunnel") {
        p.push(`<circle class="gb-n gb-tunnel" cx="${cx}" cy="${cy}" r="${CELL * 0.3}"/>`);
        if (n.label) p.push(`<text class="gb-lbl" x="${cx}" y="${cy + CELL * 0.5}" font-size="${CELL * 0.28}">${n.label}</text>`);
      } else {
        p.push(`<circle class="gb-n gb-space" cx="${cx}" cy="${cy}" r="${CELL * 0.16}"/>`);
        if (n.label) p.push(`<text class="gb-lbl" x="${cx}" y="${cy + CELL * 0.4}" font-size="${CELL * 0.26}">${n.label}</text>`);
      }
    }

    if (opts.overlays) p.push(opts.overlays);

    for (const t of (opts.tokens || [])) {
      const x = t.x * CELL, y = t.y * CELL;
      p.push(`<circle class="gb-tok ${t.cls}" cx="${x}" cy="${y}" r="${CELL * 0.24}"/>`);
      p.push(`<text class="gb-tlbl" x="${x}" y="${y + CELL * 0.09}" font-size="${CELL * 0.22}">${t.ch}</text>`);
    }

    return `<svg class="gb" viewBox="0 0 ${W} ${H}" width="${W}" height="${H}" xmlns="http://www.w3.org/2000/svg">${p.join("")}</svg>`;
  }

  window.BOARD = { renderBoardSVG, CELL, FAC_COLOR, FAC_LABEL };
})();
