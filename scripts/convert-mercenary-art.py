"""把 Downloads\\battle 的原图转成项目规格的 WebP 美术资源。
规格（来自 docs/03-雇佣兵协会.md §4.8 资产表）：
  units/*.png  → public/battle/units/<id>.webp     640x316   （缩略图另由 scripts/gen-thumbs.py 生成）
  bosses/*.png → public/battle/bosses/<id>.webp    112x112   （112px 级出口，不出缩略图）
  guild/guild-hall.png → public/battle/guild/guild-hall.webp  1424x800
  guild/flag-*.png     → public/battle/guild/flag-*.webp      512x512
"""
from PIL import Image
import os

SRC = r"C:\Users\Master\Downloads\battle"
OUT = r"E:\生涯之旅游戏\app\public\battle"
QUALITY = 85

def cover(img: Image.Image, w: int, h: int) -> Image.Image:
    """等比缩放后居中裁切到目标尺寸（不拉伸变形）。"""
    sw, sh = img.size
    scale = max(w / sw, h / sh)
    nw, nh = max(1, round(sw * scale)), max(1, round(sh * scale))
    img = img.resize((nw, nh), Image.LANCZOS)
    left, top = (nw - w) // 2, (nh - h) // 2
    return img.crop((left, top, left + w, top + h))

def convert(src_path: str, dst_path: str, size) -> tuple:
    os.makedirs(os.path.dirname(dst_path), exist_ok=True)
    with Image.open(src_path) as im:
        src_size = im.size
        im = im.convert("RGB")
        out = cover(im, *size) if size else im
        out.save(dst_path, "WEBP", quality=QUALITY, method=4)
    return src_size, out.size, os.path.getsize(dst_path)

jobs = []
units_dir = os.path.join(SRC, "units")
for name in sorted(os.listdir(units_dir)):
    if name.lower().endswith(".png"):
        stem = os.path.splitext(name)[0]
        jobs.append((os.path.join(units_dir, name),
                     os.path.join(OUT, "units", stem + ".webp"), (640, 316)))

boss_dir = os.path.join(SRC, "bosses")
for name in sorted(os.listdir(boss_dir)):
    if name.lower().endswith(".png"):
        stem = os.path.splitext(name)[0]
        jobs.append((os.path.join(boss_dir, name),
                     os.path.join(OUT, "bosses", stem + ".webp"), (112, 112)))

guild_dir = os.path.join(SRC, "guild")
for name in sorted(os.listdir(guild_dir)):
    if not name.lower().endswith(".png"):
        continue
    stem = os.path.splitext(name)[0]
    if stem.startswith("flag-"):
        jobs.append((os.path.join(guild_dir, name),
                     os.path.join(OUT, "guild", stem + ".webp"), (512, 512)))
    elif stem == "guild-hall":
        jobs.append((os.path.join(guild_dir, name),
                     os.path.join(OUT, "guild", "guild-hall.webp"), (1424, 800)))

print(f"{'输出文件':<34}{'源尺寸':>12}{'目标尺寸':>12}{'体积':>10}")
total = 0
for src, dst, size in jobs:
    ss, ds, b = convert(src, dst, size)
    total += b
    rel = os.path.relpath(dst, OUT)
    print(f"{rel:<34}{ss[0]}x{ss[1]:>8}{ds[0]}x{ds[1]:>8}{b/1024:>9.0f}K")
print(f"\n共 {len(jobs)} 个文件，合计 {total/1024/1024:.2f} MB")
