#!/usr/bin/env bash
# .drawio を PNG / SVG / PDF に書き出す。生成した図を人が目で確認するための入口。
#
#   bash scripts/export-drawio.sh <file.drawio> [png|svg|pdf] [scale]
#
# 書き出しには draw.io 本体が要る。次の順で使えるものを選ぶ。
#   1. drawio コマンド (drawio-desktop がインストールされている場合)
#   2. Docker イメージ rlespinasse/drawio-export
# どちらも手元で完結し、図のデータは外に出ない。

set -euo pipefail

file="${1:?使い方: bash scripts/export-drawio.sh <file.drawio> [png|svg|pdf] [scale]}"
format="${2:-png}"
scale="${3:-1.5}"

if [ ! -f "$file" ]; then
  echo "ファイルがありません: $file" >&2
  exit 1
fi

dir="$(cd "$(dirname "$file")" && pwd)"
base="$(basename "$file")"
stem="${base%.*}"
out="$dir/$stem.$format"

if command -v drawio >/dev/null 2>&1; then
  # drawio-desktop の CLI。GUI を出さずに書き出す。
  drawio --export --format "$format" --scale "$scale" --border 20 \
    --output "$out" "$file" >/dev/null
  echo "書き出し: $out"
  exit 0
fi

if command -v docker >/dev/null 2>&1; then
  docker run --rm -v "$dir:/data" rlespinasse/drawio-export:latest \
    -f "$format" --scale "$scale" --border 20 --remove-page-suffix \
    --on-changes=false "$base" >/dev/null 2>&1 ||
    docker run --rm -v "$dir:/data" rlespinasse/drawio-export:latest \
      -f "$format" --scale "$scale" --remove-page-suffix "$base"

  # このイメージは export/ 配下に出すので、.drawio の隣に移動する。
  if [ -f "$dir/export/$stem.$format" ]; then
    mv "$dir/export/$stem.$format" "$out"
    rmdir "$dir/export" 2>/dev/null || true
  fi

  echo "書き出し: $out"
  exit 0
fi

cat >&2 <<'MSG'
drawio コマンドも docker も見つかりません。どちらかを用意してください。

  brew install --cask drawio     # drawio-desktop (CLI 付き)
  docker                          # rlespinasse/drawio-export を使う
MSG
exit 1
