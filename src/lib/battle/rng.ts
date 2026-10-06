// ==================== 舰船卡牌战斗 · 可复现随机数 ====================
// 逐字搬移自 carddemo/engine.js 的 makeRng（mulberry32）。
// ⚠ 算法必须与 DEMO 完全一致（含随机数消耗次数），否则与 DEMO 的对拍必然失败。
// DEMO 是唯一真值；本文件不许"顺手优化"。

/** 随机数发生器（[0, 1) 浮点，调用次数必须与 DEMO 一致） */
export type Rng = () => number;

/**
 * mulberry32：同一 seed 产生同一串随机数。
 * seed 不传时的兜底由调用方（createBattle）负责，本函数要求显式数字。
 */
export function makeRng(seed: number): Rng {
  let t = seed >>> 0;
  return function () {
    t += 0x6D2B79F5;
    let r = Math.imul(t ^ (t >>> 15), 1 | t);
    r ^= r + Math.imul(r ^ (r >>> 7), 61 | r);
    return ((r ^ (r >>> 14)) >>> 0) / 4294967296;
  };
}
