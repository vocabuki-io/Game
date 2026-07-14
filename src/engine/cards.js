// 行動カード定義（暫定セット）。role ごとに山札を持つ。
// needsTarget: 移動先などプレイヤーが対象を選ぶカード
export const CARD_DEFS = {
  // --- 囚人 ---
  move:  { id: "move",  role: "prisoner", label: "移動",   needsTarget: true,
           desc: "隣接する見えているマスへ移動する" },
  dig:   { id: "dig",   role: "prisoner", label: "掘る",   needsTarget: false,
           desc: "独房でトンネルを掘り進める（脱獄準備）" },
  hide:  { id: "hide",  role: "prisoner", label: "隠す",   needsTarget: false,
           desc: "禁制品を隠蔽し、このターンの検査を防ぐ" },
  scout: { id: "scout", role: "prisoner", label: "偵察",   needsTarget: false,
           desc: "隣接する未公開マス（霧）を開く" },
  work:  { id: "work",  role: "prisoner", label: "作業",   needsTarget: false,
           desc: "刑務作業でリソースを得る。工房では工具(禁制品)を入手することも" },

  // --- 看守 ---
  patrol:  { id: "patrol",  role: "guard", label: "巡回",   needsTarget: true,
             desc: "隣接するマスへ移動する" },
  watch:   { id: "watch",   role: "guard", label: "監視",   needsTarget: false,
             desc: "現在地の囚人を目撃。立入禁止区にいれば現行犯→アウト" },
  inspect: { id: "inspect", role: "guard", label: "検査",   needsTarget: false,
             desc: "同室の囚人の手荷物を検査。禁制品が隠されていなければ現行犯→アウト" },
  muster:  { id: "muster",  role: "guard", label: "点呼",   needsTarget: false,
             desc: "今夜の点呼を招集。囚人が点呼マス不在なら現行犯→アウト" },
};

// 山札（重み＝出現しやすさ。暫定）
export const DECKS = {
  prisoner: ["move", "move", "dig", "dig", "hide", "scout", "work", "work"],
  guard:    ["patrol", "patrol", "watch", "inspect", "inspect", "muster"],
};

export const HAND_SIZE = 3;
