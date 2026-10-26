#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""A11b · 只修正 u8 的卡面文案：DEMO 里 `text: ''` → `text: '—'`。

原因：导出脚本对空文案统一出 `—`（与其它无技能卡一致），DEMO 写空串会让
`audit-battle-port` 报 `卡 u8.text 不一致`（唯一残留红点）。

用法：python scripts/apply-a11b-u8text.py [--dry-run]
退出码：0 成功 / 已应用；1 异常（不唯一则不写盘）。
"""

import io
import os
import shutil
import subprocess
import sys

try:
    sys.stdout.reconfigure(encoding="utf-8", errors="replace")
except Exception:  # noqa: BLE001
    pass

DEMO = r"E:\生涯之旅游戏\carddemo\engine.js"
BACKUP = DEMO + ".bak-a11b"
NODE = r"C:\Users\Master\.dsh\dsh-runtimes\dsh-primary-runtime\dependencies\node\bin\node.exe"

OLD = "def({ id: 'u8', name: '装甲巡防舰', cost: 4, atk: 4, shield: 5, structure: 2, series: '通用', rarity: '白',\n  text: '', kw: {} });"
NEW = "def({ id: 'u8', name: '装甲巡防舰', cost: 4, atk: 4, shield: 5, structure: 2, series: '通用', rarity: '白',\n  text: '—', kw: {} });"


def main():
    dry = "--dry-run" in sys.argv
    raw = open(DEMO, "rb").read()
    has_bom = raw.startswith(b"\xef\xbb\xbf")
    text = raw.decode("utf-8-sig")
    if "text: '—', kw: {} });" in text and "id: 'u8'" in text:
        print("[=] 已应用（u8 文案已是 —）。")
        return 0
    n = text.count(OLD)
    if n != 1:
        print("[x] u8 的旧 def 命中 %d 次（要求 1），未写盘。" % n)
        return 1
    if dry:
        print("[dry-run] u8 文案 '' → '—' 命中 1 次，未写盘。")
        return 0
    if not os.path.exists(BACKUP):
        shutil.copyfile(DEMO, BACKUP)
        print("[+] 已备份 " + BACKUP)
    data = text.replace(OLD, NEW, 1).encode("utf-8")
    if has_bom:
        data = b"\xef\xbb\xbf" + data
    open(DEMO, "wb").write(data)
    print("[+] 已写回 " + DEMO)
    r = subprocess.run([NODE, "--check", DEMO], capture_output=True, text=True)
    if r.returncode != 0:
        print("[x] node --check 失败：\n" + (r.stderr or r.stdout))
        return 1
    print("[✓] node --check 语法通过；u8 文案 = '—'")
    return 0


if __name__ == "__main__":
    sys.exit(main())
