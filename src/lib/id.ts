// ==================== 唯一 id 生成（唯一真值） ====================
// 为什么集中：建筑实例 / 生产任务 / 贷款 / 事件日志原先各有各的拼法
// （`${id}_${Date.now()}_${Math.random()}`、`${turn}-${Date.now()}`、`loan_...`…），
// 其中生产任务 id 还被当作 React key 使用，靠未截断的 Math.random() 全文保唯一。
// 说明：**全库没有任何地方解析 id 的格式**（只按相等性查找 / 当 key），故统一格式是安全的。

let uidCounter = 0;

/** 生成唯一 id：`前缀_时间戳36进制_自增序号_随机段`。
 *  带自增序号是为了防"同一毫秒内连续创建"（连点建造/生产）时只靠时间戳+随机数相撞。 */
export function createUid(prefix: string): string {
  uidCounter = (uidCounter + 1) % 1_000_000;
  return `${prefix}_${Date.now().toString(36)}_${uidCounter.toString(36)}_${Math.random().toString(36).slice(2, 6)}`;
}
