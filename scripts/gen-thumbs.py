#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""列表/网格缩略图批量生成器（`lib/assetThumb.ts` 的 getThumbPath 配套脚本）。

为什么必须有这个脚本：AGENTS 第五节规定「列表/网格里的图一律走缩略图」，
解码开销 = 宽 × 高 × 4 字节、与文件大小无关；而各面板的 `<img onError>`
在缺缩略图时会把整块**静默隐藏**（看起来像布局坏了）。文档一直写「缩略图由脚本生成」，
但这个脚本以前并不存在 —— 本文件就是那句话的落地。

命名规则**不在这里**，唯一真值是 `src/lib/assetThumb.ts` 的 `getThumbPath`：
    /<dir>/<rest...>/<name>.<ext>  ->  /<dir>/thumbs/<rest...>/<name>.webp
本脚本只照抄这条规则（见下方 target_of），**不另立第二张命名表**。

用法（在仓库根目录跑；仓库自带的 Python + Pillow，无需 pip install）：
    python scripts/gen-thumbs.py                      # 只补缺的：扫默认目录，已存在的一律跳过
    python scripts/gen-thumbs.py --force              # 重新生成（覆盖已有的缩略图）
    python scripts/gen-thumbs.py --dir battle         # 只处理 public/battle/**（可给多级路径）
    python scripts/gen-thumbs.py --width 320          # 覆盖缩略图宽度（默认按目录取 DEFAULT_WIDTHS）
    python scripts/gen-thumbs.py --dir battle/units --width 256 --force
    python scripts/gen-thumbs.py --list               # 只打印将要生成什么，不写文件

默认目录 = 游戏里已有缩略图出口的四类（archaeology / expeditions / wonders /
buildings）+ 战斗的**舰船图**（battle/units）—— battle/bosses 与 battle/lairs
是"图本身就是最大出口 / 最大出口远大于 192"的图位，按 AGENTS 第五节不出缩略图。
默认宽度按「该目录既有缩略图的实测宽度」取；--width 可整批覆盖。
宽度语义 = 目标宽度（保比例，**只缩不放**、不裁切），高 = round(原高 × 宽/原宽)。
"""

from __future__ import annotations

import argparse
import os
import sys

try:
    from PIL import Image
except ImportError:  # pragma: no cover - 仓库自带 Pillow；这里只给一句人话
    sys.exit('缺少 Pillow。请用仓库自带的 Python 运行本脚本（见 load_workspace_dependencies），不要 pip install。')

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
PUBLIC = os.path.join(ROOT, 'public')

WEBP_QUALITY = 86  # 82~88 之间：体积与画质平衡
THUMBS_DIR_NAME = 'thumbs'
IMAGE_EXTS = {'.png', '.jpg', '.jpeg', '.webp', '.bmp', '.gif', '.tif', '.tiff'}
#: 源图长边 ≤ 此值 → 本身就是"小图"，不生成缩略图。
#: 依据 AGENTS 第五节：判断标准是「这张图在游戏里最大的那个出口是多大」，
#: 只有 64px 级出口的图（BOSS 头像 112px、母舰、原料图标）直接用原图。
#: 现有素材里受这条约束的 = `public/battle/bosses/*.webp`（112×112）——
#: 代码里的 `bossArtSrc` 直接给原图、`BattleTab` 不再套 getThumbPath，故不需要缩略图。
TINY_SOURCE_MAX = 256

#: 默认目录（相对 public/）→ 默认缩略图宽度。
#: 宽度 = 既有缩略图的实测宽度（不要凭感觉改；改前先量一遍 public/<dir>/thumbs/）。
DEFAULT_DIRS = (
    'archaeology',
    'expeditions',
    'wonders',
    'buildings',
    'battle/units',  # 舰船图：列表/卡库/舰队池的出口走缩略图，必须生成
)
#: 按**顶层目录**取默认宽度；值为 None = 该目录下不出缩略图。
DEFAULT_WIDTHS = {
    'archaeology': 192,
    'expeditions': 480,
    'wonders': 256,
    'buildings': 160,
    'battle': 192,  # 命中 battle/units；battle/bosses 由 TINY_SOURCE_MAX 兜住
}
#: 明确不出缩略图的目录（相对 public/）：图本身就是最大出口，或最大出口远大于 192。
#:   battle/bosses —— 112×112，代码直接给原图（`bossArtSrc`，BattleTab 已去掉 getThumbPath 那一层）
#:   battle/lairs  —— 只按 16:9 全宽显示，1424×800 才是对的；缩到 192×108 反而不清楚
NO_THUMBS_DIRS = (
    'battle/bosses',
    'battle/lairs',
)
FALLBACK_WIDTH = 192


def rel(path: str) -> str:
    """仓库相对路径（只用于打日志）。"""
    return os.path.relpath(path, ROOT).replace(os.sep, '/')


def target_of(src_path: str, base_dir: str, width: int):
    """源图绝对路径 → (缩略图绝对路径, 目标宽, 目标高)；规则照抄 getThumbPath。

    base_dir = 该源图所属的**顶层目录**（getThumbPath 里的 `<dir>` 那一段），例如
    `public/buildings/B32.jpg` 的 base_dir 是 `public/buildings`、rest 是 `('B32.jpg',)`；
    `public/battle/units/h3.webp` 的 base_dir 是 `public/battle`、rest 是 `('units','h3.webp')`
    —— **`--dir` 给多级路径（如 battle/units）时 base 仍取顶层**，否则缩略图会落到
    `battle/units/thumbs/`（getThumbPath 永远输出到 `battle/thumbs/units/`）。
    ⚠ 不要按 '/' 切字符判断层级：`<dir>/<name>` 这种顶层文件只有 2 段，
    切法会把它误判成非法路径而**静默跳过**（buildings 的 3 张缩略图就这样漏过一次）。
    ⚠ 落在任何 `thumbs/` 里的源图一律拒绝：脚本的输出永远是它自己的输入之外
    （否则 `battle/thumbs/bosses/*.webp` 会被再套一层，生成 `thumbs/thumbs/...`）。
    """
    src_abs = os.path.normpath(os.path.abspath(src_path))
    pub_abs = os.path.normpath(os.path.abspath(PUBLIC))
    if not src_abs.startswith(pub_abs + os.sep):
        return None
    inner_pub = os.path.relpath(src_abs, pub_abs)
    if THUMBS_DIR_NAME in inner_pub.split(os.sep)[:-1]:
        return None  # 已经是缩略图，不再当源
    inner = os.path.relpath(src_abs, os.path.normpath(base_dir))
    if inner.startswith('..'):
        return None
    parts = list(inner.split(os.sep))
    parts[-1] = os.path.splitext(parts[-1])[0] + '.webp'
    dst_path = os.path.join(os.path.normpath(base_dir), THUMBS_DIR_NAME, *parts)
    with Image.open(src_abs) as im:
        w, h = im.size
    if max(w, h) <= TINY_SOURCE_MAX:
        return None  # 源图本身就是"小图"（长边 ≤ TINY_SOURCE_MAX），按 AGENTS 第五节直接用原图
    out_w = min(int(width), w)  # 只缩不放
    out_h = int(round(h * out_w / w))
    return dst_path, out_w, max(1, out_h)


def iter_sources(dirnames: list, excludes=()):
    """按给定目录收集源图 → [(源图绝对路径, 顶层目录绝对路径)]；跳过 thumbs/ 自身与 --exclude。

    第二个元素**恒为 `public/<dir>` 的顶层那一段**（getThumbPath 的 `<dir>`），
    这样 `--dir battle/units` 与 `--dir battle` 对同一张图算出同一个输出路径。
    """
    found = []
    seen = set()
    skip = {os.path.normpath(os.path.join(PUBLIC, d)) for d in NO_THUMBS_DIRS}
    skip |= {os.path.normpath(os.path.join(PUBLIC, d)) for d in excludes}
    for dirname in dirnames:
        base = os.path.normpath(os.path.join(PUBLIC, dirname))
        if not os.path.isdir(base):
            print('  跳过（目录不存在）：%s' % rel(base))
            continue
        top_abs = os.path.normpath(os.path.join(PUBLIC, os.path.relpath(base, PUBLIC).split(os.sep)[0]))
        for root, subdirs, files in os.walk(base):
            subdirs[:] = sorted(d for d in subdirs if d != THUMBS_DIR_NAME)
            cur = os.path.normpath(root)
            if any(cur == s or cur.startswith(s + os.sep) for s in skip):
                subdirs[:] = []
                continue
            for name in sorted(files):
                if os.path.splitext(name)[1].lower() not in IMAGE_EXTS:
                    continue
                path = os.path.join(root, name)
                if path in seen:
                    continue
                seen.add(path)
                found.append((path, top_abs))
    return found


def main() -> int:
    ap = argparse.ArgumentParser(
        description='生成 public/<dir>/thumbs/** 缩略图（规则唯一真值 = src/lib/assetThumb.ts 的 getThumbPath）'
    )
    ap.add_argument('--dir', action='append', default=None,
                    help='只处理这些目录（相对 public/，可重复；默认见脚本顶部 DEFAULT_DIRS）')
    ap.add_argument('--width', type=int, default=None,
                    help='缩略图目标宽度（保比例、只缩不放；默认按目录取 DEFAULT_WIDTHS）')
    ap.add_argument('--exclude', action='append', default=None,
                    help='排除这些目录（相对 public/，可重复）。例：--dir battle --exclude battle/lairs')
    ap.add_argument('--force', action='store_true',
                    help='覆盖已存在的缩略图（默认跳过已存在的，绝不重写既有的 31 张 buildings/thumbs）')
    ap.add_argument('--list', action='store_true', dest='list_only',
                    help='只列出将要生成的文件，不写盘')
    args = ap.parse_args()

    dirnames = args.dir if args.dir else list(DEFAULT_DIRS)
    if not os.path.isdir(PUBLIC):
        print('找不到 public/ 目录：%s' % PUBLIC)
        return 1

    if args.list_only:
        print('（--list 模式，不写文件）')
    made, skipped, failed = 0, 0, 0
    print('缩略图生成：源 = %s' % rel(PUBLIC))
    print('目录：%s' % ', '.join(dirnames))
    print('' if args.width else '宽度：按目录默认 %s' % DEFAULT_WIDTHS)
    print('不出缩略图：%s（图本身就是最大出口）' % ', '.join(NO_THUMBS_DIRS))
    print('')

    sources = iter_sources(dirnames, {os.path.normpath(os.path.join(PUBLIC, d)) for d in (args.exclude or [])})
    for src, base in sources:
        src_bytes = os.path.getsize(src)
        try:
            src_rel = rel(src)
            top = src_rel.split('/')[1]
            width = args.width if args.width else DEFAULT_WIDTHS.get(top, FALLBACK_WIDTH)
            plan = target_of(src, base, width)
            if plan is None:
                continue
            dst, out_w, out_h = plan
            if os.path.exists(dst):
                if not args.force:
                    skipped += 1
                    # 跳过是常态（默认模式），只在 --list 时逐条列出，避免刷屏
                    if args.list_only:
                        print('  [skip] %s 跳过（已存在，--force 才覆盖）' % rel(dst))
                    continue
            if args.list_only:
                made += 1
                print('  [plan] %s -> %s  %dx%d' % (src_rel, rel(dst), out_w, out_h))
                continue
            os.makedirs(os.path.dirname(dst), exist_ok=True)
            with Image.open(src) as im:
                if im.mode not in ('RGB', 'RGBA'):
                    im = im.convert('RGBA' if 'A' in im.getbands() else 'RGB')
                thumb = im.resize((out_w, out_h), Image.Resampling.LANCZOS)
                thumb.save(dst, 'WEBP', quality=WEBP_QUALITY, method=6)
            made += 1
            print('  [ok]   %s -> %s  %dx%d  %.1f KB -> %.1f KB'
                  % (src_rel, rel(dst), out_w, out_h, src_bytes / 1024, os.path.getsize(dst) / 1024))
        except Exception as exc:  # 单张失败不中断整批
            failed += 1
            print('  [fail] %s：%s' % (rel(src), exc))

    print('')
    print('=== 生成 %d 张 / 跳过 %d 张 / 失败 %d 张 ===' % (made, skipped, failed))
    return 1 if failed else 0


if __name__ == '__main__':
    sys.exit(main())
