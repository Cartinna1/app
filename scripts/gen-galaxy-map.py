#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
生成《航空生涯之旅》「全探明星图」——把 50 个节点与全部航道画成一张图。

数据源（唯一真值，不另抄）：
  src/data/galaxy/nodes.ts  → 50 个节点的 id / type / name / x / y
  src/data/galaxy/lanes.ts  → 无向航道对
配色与半径对齐 src/lib/galaxy/nodeStyle.ts（改那边要同步这里的 COLORS / RADII）。

输出：
  docs/星图-全探明.png   1600×1200，可直接投放/做视频底图
  docs/星图-全探明.svg   矢量版，可无限放大

用法：
  python scripts/gen-galaxy-map.py
"""

import math
import os
import random
import re
from pathlib import Path

from PIL import Image, ImageDraw, ImageFilter, ImageFont

ROOT = Path(__file__).resolve().parents[1]
NODES_TS = ROOT / "src" / "data" / "galaxy" / "nodes.ts"
LANES_TS = ROOT / "src" / "data" / "galaxy" / "lanes.ts"
OUT_PNG = ROOT / "docs" / "星图-全探明.png"
OUT_SVG = ROOT / "docs" / "星图-全探明.svg"

# ---- 配色（对齐 lib/galaxy/nodeStyle.ts）----
COLORS = {
    "faction":    {"fill": "#0e7490", "stroke": "#22d3ee", "r": 20, "label": "势力星系"},
    "colony":     {"fill": "#047857", "stroke": "#34d399", "r": 17, "label": "可殖民星球"},
    "ruin":       {"fill": "#6d28d9", "stroke": "#a78bfa", "r": 17, "label": "遗迹星系"},
    "empty":      {"fill": "#334155", "stroke": "#64748b", "r": 12, "label": "空星系"},
    "pirateLair": {"fill": "#b91c1c", "stroke": "#f87171", "r": 12, "label": "海盗老巢"},
    "guild":      {"fill": "#0f766e", "stroke": "#5eead4", "r": 16, "label": "雇佣兵协会"},
}
TYPE_ORDER = ["faction", "colony", "ruin", "empty", "pirateLair", "guild"]

BG_TOP = (10, 16, 32)
BG_BOTTOM = (4, 6, 13)
LANE = (44, 60, 84)
TEXT = (203, 213, 225)
TEXT_DIM = (100, 116, 139)
ACCENT = (34, 211, 238)

W, H = 1600, 1200
SCALE = 1.30
OX, OY = 150, 150

FONT_DIR = Path(os.environ.get("WINDIR", r"C:\Windows")) / "Fonts"


def load_font(name: str, size: int) -> ImageFont.FreeTypeFont:
    for candidate in (FONT_DIR / name, FONT_DIR / "msyh.ttc", FONT_DIR / "simhei.ttf"):
        if candidate.exists():
            try:
                return ImageFont.truetype(str(candidate), size)
            except OSError:
                continue
    return ImageFont.load_default()


def parse_nodes():
    text = NODES_TS.read_text(encoding="utf-8")
    pattern = re.compile(
        r"\{ id: '([^']+)', type: '([^']+)', name: '([^']+)', x: (\d+), y: (\d+)"
    )
    out = []
    for m in pattern.finditer(text):
        out.append(
            {
                "id": m.group(1),
                "type": m.group(2),
                "name": m.group(3),
                "x": int(m.group(4)),
                "y": int(m.group(5)),
            }
        )
    if len(out) != 50:
        raise SystemExit(f"节点数应为 50，实际 {len(out)}")
    return out


def parse_lanes():
    text = LANES_TS.read_text(encoding="utf-8")
    pattern = re.compile(r"\{ a: '([^']+)', b: '([^']+)' \}")
    return [(m.group(1), m.group(2)) for m in pattern.finditer(text)]


def px(node):
    return OX + node["x"] * SCALE, OY + node["y"] * SCALE


def build_starfield(img):
    rnd = random.Random(20260819)
    draw = ImageDraw.Draw(img)
    for _ in range(520):
        x = rnd.uniform(0, W)
        y = rnd.uniform(0, H)
        b = rnd.randint(30, 120)
        size = 1 if rnd.random() < 0.88 else 2
        draw.ellipse([x, y, x + size, y + size], fill=(b, b + 8, b + 20))


def label_layout(nodes, draw, font, font_dim, font_bold):
    """给每个节点排一个标签位置（优先下方，碰撞则上移/下移），返回 id → (x, y, anchor, font)"""
    placed = []  # [(l, t, r, b)]
    result = {}
    order = sorted(nodes, key=lambda n: n["y"])
    for node in order:
        cx, cy = px(node)
        r = COLORS[node["type"]]["r"] * SCALE
        f = font_bold if node["type"] == "faction" else (font_dim if node["type"] == "empty" else font)
        text = node["name"]
        tw = draw.textlength(text, font=f)
        th = f.size
        candidate_ys = [
            cy + r + 8,          # 下方
            cy - r - th - 8,     # 上方
            cy + r + 8 + th + 6,  # 下方再下
            cy - r - th - 8 - th - 6,
        ]
        chosen = None
        for ly in candidate_ys:
            box = (cx - tw / 2 - 3, ly, cx + tw / 2 + 3, ly + th + 4)
            if box[0] < 12 or box[2] > W - 12 or box[1] < 100 or box[3] > H - 90:
                continue
            if any(not (box[2] < p[0] or box[0] > p[2] or box[3] < p[1] or box[1] > p[3]) for p in placed):
                continue
            chosen = (ly, box)
            break
        if chosen is None:
            ly = cy + r + 8
            chosen = (ly, (cx - tw / 2, ly, cx + tw / 2, ly + th))
        placed.append(chosen[1])
        result[node["id"]] = (cx, chosen[0], text, f)
    return result


def render_png(nodes, lanes):
    base = Image.new("RGB", (W, H), BG_BOTTOM)
    draw = ImageDraw.Draw(base)
    for y in range(H):
        t = y / H
        color = tuple(int(BG_TOP[i] * (1 - t) + BG_BOTTOM[i] * t) for i in range(3))
        draw.line([(0, y), (W, y)], fill=color)
    # 中央偏左的星云光
    glow = Image.new("L", (W, H), 0)
    gd = ImageDraw.Draw(glow)
    gd.ellipse([W * 0.18, H * 0.10, W * 0.86, H * 0.95], fill=26)
    glow = glow.filter(ImageFilter.GaussianBlur(160))
    base = Image.composite(Image.new("RGB", (W, H), (18, 30, 52)), base, glow)

    build_starfield(base)

    # 航道
    by_id = {n["id"]: n for n in nodes}
    lane_layer = Image.new("RGBA", (W, H), (0, 0, 0, 0))
    ld = ImageDraw.Draw(lane_layer)
    for a, b in lanes:
        pa, pb = px(by_id[a]), px(by_id[b])
        ld.line([pa, pb], fill=LANE + (210,), width=2)
    base = Image.alpha_composite(base.convert("RGBA"), lane_layer).convert("RGB")

    # 节点光晕
    halo = Image.new("RGBA", (W, H), (0, 0, 0, 0))
    hd = ImageDraw.Draw(halo)
    for node in nodes:
        cx, cy = px(node)
        col = COLORS[node["type"]]
        r = col["r"] * SCALE
        rgb = tuple(int(col["stroke"][i : i + 2], 16) for i in (1, 3, 5))
        for mult, alpha in ((2.6, 14), (1.9, 24), (1.35, 34)):
            hd.ellipse([cx - r * mult, cy - r * mult, cx + r * mult, cy + r * mult], fill=rgb + (alpha,))
    base = Image.alpha_composite(base.convert("RGBA"), halo).convert("RGB")

    draw = ImageDraw.Draw(base)
    font_title = load_font("msyhbd.ttc", 46)
    font_sub = load_font("msyh.ttc", 19)
    font_name = load_font("msyh.ttc", 14)
    font_dim = load_font("msyhl.ttc", 12)
    font_bold = load_font("msyhbd.ttc", 15)
    font_legend = load_font("msyh.ttc", 15)

    labels = label_layout(nodes, draw, font_name, font_dim, font_bold)
    for node in nodes:
        cx, cy = px(node)
        col = COLORS[node["type"]]
        r = col["r"] * SCALE
        draw.ellipse([cx - r, cy - r, cx + r, cy + r], fill=col["fill"], outline=col["stroke"], width=3)

    for node in nodes:
        cx, ly, text, f = labels[node["id"]]
        col = TEXT_DIM if node["type"] == "empty" else TEXT
        draw.text((cx, ly), text, font=f, fill=col, anchor="ma", stroke_width=3, stroke_fill=(5, 8, 16))

    # 标题
    draw.text((60, 46), "航空生涯之旅 · 星图", font=font_title, fill=(226, 232, 240))
    draw.text(
        (64, 104),
        "50 个节点全数探明 ｜ 10 势力 · 10 可殖民星球 · 10 遗迹 · 5 海盗老巢 · 14 空星系 · 1 雇佣兵协会",
        font=font_sub,
        fill=(148, 163, 184),
    )

    # 图例
    lx, ly0 = 60, H - 66
    for i, key in enumerate(TYPE_ORDER):
        col = COLORS[key]
        cx = lx + i * 252
        draw.ellipse([cx, ly0 - 13, cx + 12, ly0 - 1], fill=col["fill"], outline=col["stroke"], width=2)
        draw.text((cx + 20, ly0 - 14), col["label"], font=font_legend, fill=(203, 213, 225))

    # 脚注
    draw.text(
        (W - 60, H - 40),
        "航道由两端坐标推导跃迁回合（TURN_UNIT = 80）",
        font=load_font("msyh.ttc", 14),
        fill=(71, 85, 105),
        anchor="ra",
    )

    # 边框
    draw.rectangle([26, 26, W - 26, H - 26], outline=(30, 41, 59), width=2)

    OUT_PNG.parent.mkdir(parents=True, exist_ok=True)
    base.save(OUT_PNG, "PNG")
    print(f"wrote {OUT_PNG} ({W}x{H})")


def svg_escape(s: str) -> str:
    return s.replace("&", "&amp;").replace("<", "&lt;").replace(">", "&gt;")


def render_svg(nodes, lanes):
    by_id = {n["id"]: n for n in nodes}
    parts = []
    parts.append(f'<svg xmlns="http://www.w3.org/2000/svg" width="{W}" height="{H}" viewBox="0 0 {W} {H}">')
    parts.append(
        "<defs>"
        f'<linearGradient id="bg" x1="0" y1="0" x2="0" y2="1">'
        f'<stop offset="0" stop-color="#0a1020"/><stop offset="1" stop-color="#04060d"/>'
        "</linearGradient>"
        '<radialGradient id="neb" cx="0.5" cy="0.5" r="0.6">'
        '<stop offset="0" stop-color="#12203a" stop-opacity="0.55"/>'
        '<stop offset="1" stop-color="#12203a" stop-opacity="0"/>'
        "</radialGradient>"
        "</defs>"
    )
    parts.append(f'<rect width="{W}" height="{H}" fill="url(#bg)"/>')
    parts.append(f'<ellipse cx="{W*0.52:.0f}" cy="{H*0.52:.0f}" rx="{W*0.46:.0f}" ry="{H*0.46:.0f}" fill="url(#neb)"/>')
    rnd = random.Random(20260819)
    for _ in range(520):
        x, y = rnd.uniform(0, W), rnd.uniform(0, H)
        b = rnd.randint(30, 120)
        s = 1 if rnd.random() < 0.88 else 2
        parts.append(f'<rect x="{x:.1f}" y="{y:.1f}" width="{s}" height="{s}" fill="rgb({b},{b+8},{b+20})"/>')

    for a, b in lanes:
        (x1, y1), (x2, y2) = px(by_id[a]), px(by_id[b])
        parts.append(f'<line x1="{x1:.1f}" y1="{y1:.1f}" x2="{x2:.1f}" y2="{y2:.1f}" stroke="#2c3c54" stroke-width="2" stroke-opacity="0.85"/>')

    for node in nodes:
        cx, cy = px(node)
        col = COLORS[node["type"]]
        r = col["r"] * SCALE
        parts.append(
            f'<circle cx="{cx:.1f}" cy="{cy:.1f}" r="{r*2.2:.1f}" fill="{col["stroke"]}" fill-opacity="0.05"/>'
            f'<circle cx="{cx:.1f}" cy="{cy:.1f}" r="{r*1.5:.1f}" fill="{col["stroke"]}" fill-opacity="0.08"/>'
            f'<circle cx="{cx:.1f}" cy="{cy:.1f}" r="{r:.1f}" fill="{col["fill"]}" stroke="{col["stroke"]}" stroke-width="3"/>'
        )

    # SVG 文字位置：用与 PNG 相同的避让结果（粗略用下方，避免重叠由上往下递增）
    labels = []
    placed = []
    for node in sorted(nodes, key=lambda n: n["y"]):
        cx, cy = px(node)
        r = COLORS[node["type"]]["r"] * SCALE
        size = 15 if node["type"] == "faction" else (12 if node["type"] == "empty" else 14)
        tw = len(node["name"]) * size * 1.02
        th = size + 4
        for ly in (cy + r + 8, cy - r - th - 8, cy + r + 8 + th + 6):
            box = (cx - tw / 2, ly, cx + tw / 2, ly + th)
            if any(not (box[2] < p[0] or box[0] > p[2] or box[3] < p[1] or box[1] > p[3]) for p in placed):
                continue
            if box[1] < 100 or box[3] > H - 90 or box[0] < 12 or box[2] > W - 12:
                continue
            placed.append(box)
            labels.append((cx, ly + size, node, size))
            break
        else:
            placed.append((cx - tw / 2, cy + r + 8, cx + tw / 2, cy + r + 8 + th))
            labels.append((cx, cy + r + 8 + size, node, size))

    for cx, ty, node, size in labels:
        fill = "#64748b" if node["type"] == "empty" else "#cbd5e1"
        weight = "bold" if node["type"] == "faction" else "normal"
        parts.append(
            f'<text x="{cx:.1f}" y="{ty:.1f}" text-anchor="middle" font-family="Microsoft YaHei, Noto Sans SC, sans-serif" '
            f'font-size="{size}" font-weight="{weight}" fill="{fill}" stroke="#05080f" stroke-width="3" paint-order="stroke">{svg_escape(node["name"])}</text>'
        )

    parts.append(
        f'<text x="60" y="92" font-family="Microsoft YaHei, sans-serif" font-size="46" font-weight="bold" fill="#e2e8f0">航空生涯之旅 · 星图</text>'
    )
    parts.append(
        f'<text x="64" y="122" font-family="Microsoft YaHei, sans-serif" font-size="19" fill="#94a3b8">'
        "50 个节点全数探明 ｜ 10 势力 · 10 可殖民星球 · 10 遗迹 · 5 海盗老巢 · 14 空星系 · 1 雇佣兵协会</text>"
    )
    for i, key in enumerate(TYPE_ORDER):
        col = COLORS[key]
        cx = 60 + i * 252
        parts.append(
            f'<circle cx="{cx + 6}" cy="{H - 60}" r="6" fill="{col["fill"]}" stroke="{col["stroke"]}" stroke-width="2"/>'
            f'<text x="{cx + 20}" y="{H - 54}" font-family="Microsoft YaHei, sans-serif" font-size="15" fill="#cbd5e1">{col["label"]}</text>'
        )
    parts.append(
        f'<text x="{W - 60}" y="{H - 40}" text-anchor="end" font-family="Microsoft YaHei, sans-serif" font-size="14" fill="#475569">'
        "航道由两端坐标推导跃迁回合（TURN_UNIT = 80）</text>"
    )
    parts.append(f'<rect x="26" y="26" width="{W - 52}" height="{H - 52}" fill="none" stroke="#1e293b" stroke-width="2"/>')
    parts.append("</svg>")
    OUT_SVG.write_text("\n".join(parts), encoding="utf-8")
    print(f"wrote {OUT_SVG}")


OUT_MD = ROOT / "docs" / "星图-全探明.md"


def render_md(nodes, lanes):
    by_id = {n["id"]: n for n in nodes}
    degree = {n["id"]: [] for n in nodes}
    for a, b in lanes:
        degree[a].append(b)
        degree[b].append(a)

    counts = {k: 0 for k in TYPE_ORDER}
    for n in nodes:
        counts[n["type"]] += 1

    ids_line = "', '".join(n["id"] for n in nodes)
    snippet = (
        "(() => {\n"
        "  const KEY = 'aviation_career_save';\n"
        "  const raw = localStorage.getItem(KEY);\n"
        "  if (!raw) return console.warn('没有存档：先玩一回合让它自动存一次');\n"
        "  const save = JSON.parse(raw);\n"
        "  const g = save.ships?.[0]?.galaxy;\n"
        "  if (!g) return console.warn('存档结构不对');\n"
        f"  g.visitedNodes = ['{ids_line}'];\n"
        "  localStorage.setItem(KEY, JSON.stringify(save));\n"
        "  console.log('已把 50 个节点标为探明，刷新中');\n"
        "  location.reload();\n"
        "})();"
    )

    rows = []
    for n in nodes:
        neighbors = "、".join(by_id[i]["name"] for i in sorted(degree[n["id"]]))
        rows.append(
            f"| `{n['id']}` | {n['name']} | {COLORS[n['type']]['label']} | "
            f"({n['x']}, {n['y']}) | {len(degree[n['id']])} | {neighbors} |"
        )

    md = f"""# 星图 · 全探明（50 个节点）

![星图-全探明](星图-全探明.png)

- 矢量版：[星图-全探明.svg](星图-全探明.svg)（可无限放大，做视频底图用这张）
- 数据源：`src/data/galaxy/nodes.ts`（坐标/名称/类型）+ `src/data/galaxy/lanes.ts`（航道）
- 配色与半径：对齐 `src/lib/galaxy/nodeStyle.ts`（那边改了要同步脚本里的 `COLORS`）
- 规模：**50 节点 / {len(lanes)} 条航道** —— 势力 {counts['faction']} · 可殖民星球 {counts['colony']} · 遗迹 {counts['ruin']} · 空星系 {counts['empty']} · 海盗老巢 {counts['pirateLair']} · 雇佣兵协会 {counts['guild']}
- 重新生成：`python scripts/gen-galaxy-map.py`

> 这是「全探明」状态：每个节点都算已到访，所以没有迷雾、没有占位名。
> 跃迁回合数不画在图上（由两端坐标距离 ÷ `TURN_UNIT`（80）推导，逐条标会糊）。

## 在游戏里看到这张图

星图的迷雾**只认** `ship.galaxy.visitedNodes`（`lib/galaxy/knowledge.isNodeDiscovered`）。所以把 50 个 id 全塞进去，刷新即可——不改物价、不改船位、不改回合数。

**步骤**：先在存档页导出一份备份 → 打开游戏页面 → F12 控制台 → 粘贴下面这段 → 回车。

```js
{snippet}
```

- 只改 `visitedNodes`：星图全亮、所有势力在贸易面板里可见。
- 交易仍要求**母舰停在该势力节点**（跃迁是另一件事），探明不等于到达。
- 若开着多个标签页，先在其它标签页停手，避免它们的自动存档把这次修改盖回去。

## 节点清单

| id | 名称 | 类型 | 坐标 | 航道 | 相邻节点 |
|---|---|---|---|---|---|
{chr(10).join(rows)}
"""
    OUT_MD.write_text(md, encoding="utf-8")
    print(f"wrote {OUT_MD}")


def main():
    nodes = parse_nodes()
    lanes = parse_lanes()
    render_png(nodes, lanes)
    render_svg(nodes, lanes)
    render_md(nodes, lanes)


if __name__ == "__main__":
    main()
