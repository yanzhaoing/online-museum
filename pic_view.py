# -*- coding: utf-8 -*-
# 像素读取器 v2：灰度字符画 + 分块主色（纯文本输出，可直接读）
# 用法: python pic_view.py <图片路径> [列数] [输出文件]
import sys
import numpy as np
from PIL import Image

CHARS = " .:-=+*#%@"

def main():
    path = sys.argv[1]
    cols = int(sys.argv[2]) if len(sys.argv) > 2 else 100
    out_path = sys.argv[3] if len(sys.argv) > 3 else None
    im = Image.open(path).convert("RGB")
    w, h = im.size
    rows = max(10, int(cols * h / w / 2.1))
    small = im.resize((cols, rows))
    a = np.asarray(small, dtype=np.float32)
    lum = 0.299 * a[:, :, 0] + 0.587 * a[:, :, 1] + 0.114 * a[:, :, 2]
    lines = []
    lines.append(f"图片 {w}x{h} -> 字符画 {cols}x{rows}")
    lines.append("字符:  .:-=+*#%@ 从暗到亮")

    for y in range(rows):
        line = []
        for x in range(cols):
            l = lum[y, x]
            line.append(CHARS[min(9, int(l / 255 * 9.99))])
        lines.append("".join(line))

    # 分块主色 8x8
    lines.append("")
    lines.append("== 8x8 分块主色 (RGB) ==")
    block = im.resize((8, 8))
    ba = np.asarray(block, dtype=np.float32)
    for by in range(8):
        cells = []
        for bx in range(8):
            r, g, b = int(ba[by, bx, 0]), int(ba[by, bx, 1]), int(ba[by, bx, 2])
            cells.append(f"({r},{g},{b})")
        lines.append(" ".join(cells))

    # 全局统计
    big = np.asarray(im.resize((100, 100)), dtype=np.float32)
    bl = 0.299 * big[:, :, 0] + 0.587 * big[:, :, 1] + 0.114 * big[:, :, 2]
    lines.append(f"\n亮度: 均值={bl.mean():.0f} 暗5%={np.percentile(bl,5):.0f} 亮5%={np.percentile(bl,95):.0f}")
    # 暗区（可能是文字）位置分布
    dark_mask = bl < 90
    ys, xs = np.nonzero(dark_mask)
    if len(ys):
        lines.append(f"暗区(<90): {len(ys)}/{10000} 像素, x范围[{xs.min()}-{xs.max()}], y范围[{ys.min()}-{ys.max()}]")
        # 暗区聚类：按 y 分段看 x 分布（找文字行）
        lines.append("暗区按行分布(每10行): " + " ".join(
            f"{int((dark_mask[y:y+10, :].sum()) / max(1, 10*100) * 100)}%" for y in range(0, 100, 10)))

    text = "\n".join(lines)
    if out_path:
        with open(out_path, "w", encoding="utf-8") as f:
            f.write(text)
        print("已写出:", out_path)
    else:
        print(text)

main()
