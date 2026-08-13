#!/usr/bin/env bash
# 在可正常访问外网的网络下运行：把挑好的公开图 URL 填入 URLS，自动下载并校验
# 用法：bash fetch-hall-images.sh
set -e
cd "$(dirname "$0")"

# 角色_文件名 = 图片直链（Unsplash 用 ?w=1600&q=80，Pexels 用 ?w=1600）
URLS=(
  # "01-序厅|https://images.unsplash.com/photo-xxxx?w=1600&q=80"
  # "04-器物厅|https://images.pexels.com/photos/1234567/pexels-photo-1234567.jpeg?w=1600"
)

if [ ${#URLS[@]} -eq 0 ]; then
  echo "请先在脚本 URLS 数组里填入图片直链（参考 README.md 的搜索链接挑图）"
  exit 1
fi

for entry in "${URLS[@]}"; do
  name="${entry%%|*}"
  url="${entry#*|}"
  out="hall-${name}.jpg"
  curl -sL --max-time 30 -A "Mozilla/5.0" "$url" -o "$out"
  size=$(stat -c%s "$out" 2>/dev/null || stat -f%z "$out")
  head_hex=$(head -c 3 "$out" | od -An -tx1 | tr -d ' \n')
  if [ "$size" -lt 30000 ] || [[ ! "$head_hex" =~ ^ffd8ff|^89504e|^524946 ]]; then
    echo "✗ $name 下载异常（${size}B），请检查链接"; rm -f "$out"; continue
  fi
  echo "✓ $out $((size/1024))KB"
done
echo "完成。图片在 $(pwd)，接入展厅请复制到 online-museum/textures/"
