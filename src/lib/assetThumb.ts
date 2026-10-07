// ==================== 列表/网格缩略图路径（唯一真值） ====================
// 为什么必须有：图片的解码开销 = 宽 × 高 × 4 字节，**与文件大小无关**。
// 用 1200×675 的图去填 96px 的格子，等于每张多解 3 MB（实测：考古列表位浪费 18.8 倍、
// 图鉴网格 11.1 倍、建筑列表 6.7 倍）。所以「列表 / 网格 / 小卡片」位一律走缩略图，
// 「详情 / 全宽 / 大图鉴卡」位才用原图。
//
// 目录规则（缩略图由 `scripts/gen-thumbs.py` 统一生成，别在别处手写第二套命名）：
//   python scripts/gen-thumbs.py            # 补缺（已存在的一律跳过）
//   python scripts/gen-thumbs.py --force    # 重新生成（覆盖）
// 目标宽度按目录给（archaeology 192 / expeditions 480 / wonders 256 / buildings 160 / battle 192），
// `--dir` `--width` 可覆盖。脚本只照抄下面这条规则，命名唯一真值仍是本函数：
//   /<dir>/<rest...>/<name>.<ext>  ->  /<dir>/thumbs/<rest...>/<name>.webp
//   例：/archaeology/bell_tower/cover.webp -> /archaeology/thumbs/bell_tower/cover.webp
//       /expeditions/L1/A1.webp            -> /expeditions/thumbs/L1/A1.webp
//       /wonders/dyson.webp                -> /wonders/thumbs/dyson.webp
//       /buildings/B1.jpg                  -> /buildings/thumbs/B1.webp
//       /battle/units/h3.webp              -> /battle/thumbs/units/h3.webp
//
// ⚠ 缺缩略图时各面板的 `<img onError>` 会把整块**静默隐藏**，所以新增一类图片时：
//   先出缩略图，再改代码。⚠ 反向也要注意：出口只有 64px 级的图（BOSS 头像 112px、
//   母舰/原料图标）**直接给原图**，不要为它多生成一套缩略图（`bossArtSrc` 就这样用）。

/** 把原图路径映射为对应的缩略图路径；路径为空或不以 / 开头时原样返回 */
export function getThumbPath(src: string | null | undefined): string {
  if (!src) return '';
  if (!src.startsWith('/')) return src;
  const parts = src.split('/'); // ['', '<dir>', ...rest]
  if (parts.length < 3) return src;
  const rest = parts.slice(2);
  rest[rest.length - 1] = rest[rest.length - 1].replace(/\.[^.]+$/, '') + '.webp';
  return `/${parts[1]}/thumbs/${rest.join('/')}`;
}
