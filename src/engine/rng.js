// 決定的な擬似乱数（seed固定で再現可能＝テスト/権威サーバ向き）
export function makeRng(seed) {
  let a = seed >>> 0;
  return function next() {
    // mulberry32
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function pick(rng, arr) {
  return arr[Math.floor(rng() * arr.length)];
}
