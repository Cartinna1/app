/**
 * 确定性伪随机数生成器（Seeded PRNG）
 * 
 * 核心原理：相同的种子 + 相同的调用顺序 → 完全相同的"随机"序列
 * 用于课堂场景：6组学生输入相同种子，价格波动100%一致
 * 
 * 算法：Mulberry32 - 高质量、快速、适合游戏
 */

export class SeededPRNG {
  private seed: number;

  constructor(seed: string | number) {
    // 字符串种子转为32位整数
    if (typeof seed === 'string') {
      let hash = 0;
      for (let i = 0; i < seed.length; i++) {
        const char = seed.charCodeAt(i);
        hash = ((hash << 5) - hash + char) | 0;
      }
      this.seed = hash;
    } else {
      this.seed = seed | 0;
    }
  }

  // 生成下一个 0~1 的伪随机数
  next(): number {
    let t = (this.seed += 0x6d2b79f5);
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  }

  // 生成范围内随机数 [min, max)
  range(min: number, max: number): number {
    return min + this.next() * (max - min);
  }

  // 生成整数 [min, max]
  intRange(min: number, max: number): number {
    return Math.floor(this.range(min, max + 1));
  }
}

// 全局PRNG实例（游戏初始化时设置seed）
let globalPRNG: SeededPRNG | null = null;

export function setSeed(seed: string) {
  globalPRNG = new SeededPRNG(seed);
}

export function getPRNG(): SeededPRNG {
  if (!globalPRNG) {
    // 兜底：如果没有设置种子，用当前时间作为种子（传统随机行为）
    globalPRNG = new SeededPRNG(Date.now());
  }
  return globalPRNG;
}

// 替代 Math.random()
export function rng(): number {
  return getPRNG().next();
}

// 生成范围内随机数
export function rngRange(min: number, max: number): number {
  return getPRNG().range(min, max);
}

// 重置PRNG（新游戏时调用）
export function resetPRNG() {
  globalPRNG = null;
}
