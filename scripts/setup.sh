#!/usr/bin/env bash
# ローカル完結で動かすためのセットアップ。
#
#   bash scripts/setup.sh            # 依存の導入と shape インデックスの配置
#   bash scripts/setup.sh --status   # 現在の状態だけを表示する
#   bash scripts/setup.sh --serve    # セルフホストの draw.io をコンテナで起動する
#   bash scripts/setup.sh --stop     # 起動した draw.io を止める
#
# ネットワークへ出るのは初回の npm install と shape インデックスの取得だけ。
# それ以降は図のデータも検索も手元で完結する。

set -euo pipefail

root="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
index_url="https://cdn.jsdelivr.net/gh/jgraph/drawio-mcp@main/shape-search/search-index.json"
vendor_index="$root/vendor/search-index.json"
mcp_index="$root/node_modules/@drawio/mcp/src/search-index.json"
container="aws-infra-drawio-editor"
port="${DRAWIO_PORT:-8080}"

status() {
  echo "== aws-infra-drawio の状態"

  if [ -d "$root/node_modules/@drawio/mcp" ]; then
    echo "  [ok] @drawio/mcp: $(node "$root/node_modules/@drawio/mcp/src/index.js" --version)"
  else
    echo "  [--] @drawio/mcp: 未導入 (bash scripts/setup.sh)"
  fi

  if [ -f "$mcp_index" ]; then
    echo "  [ok] shape インデックス: ローカル配置済み (search_shapes はオフラインで動く)"
  else
    echo "  [--] shape インデックス: 未配置 (search_shapes は CDN を見に行く)"
  fi

  if command -v drawio >/dev/null 2>&1; then
    echo "  [ok] 書き出し: drawio コマンド"
  elif command -v docker >/dev/null 2>&1; then
    echo "  [ok] 書き出し: docker (rlespinasse/drawio-export)"
  else
    echo "  [--] 書き出し: drawio コマンドも docker もない"
  fi

  if curl -sf -o /dev/null "http://localhost:$port/"; then
    echo "  [ok] セルフホスト draw.io: http://localhost:$port/ で応答"
  else
    echo "  [--] セルフホスト draw.io: 未起動 (bash scripts/setup.sh --serve)"
    echo "       未起動でも図の生成と PNG 書き出しはできる。open_drawio_xml だけが使えない"
  fi
}

serve() {
  if ! command -v docker >/dev/null 2>&1; then
    echo "docker が必要です。" >&2
    exit 1
  fi

  if docker ps --format '{{.Names}}' | grep -qx "$container"; then
    echo "すでに起動しています: http://localhost:$port/"
    exit 0
  fi

  docker rm -f "$container" >/dev/null 2>&1 || true
  docker run -d --name "$container" -p "$port:8080" jgraph/drawio >/dev/null
  echo "起動しました: http://localhost:$port/"
  echo "MCP からこれを使うには DRAWIO_BASE_URL=http://localhost:$port/ (既定値)"
}

case "${1:-}" in
  --status)
    status
    exit 0
    ;;
  --serve)
    serve
    exit 0
    ;;
  --stop)
    docker rm -f "$container" >/dev/null 2>&1 && echo "停止しました。" || echo "起動していません。"
    exit 0
    ;;
esac

echo "== 依存を導入します"
(cd "$root" && npm install --silent)

echo "== shape インデックスを配置します"
if [ ! -f "$vendor_index" ]; then
  mkdir -p "$root/vendor"
  curl -sSL -o "$vendor_index" "$index_url"
  echo "  取得しました: $vendor_index"
fi

# @drawio/mcp は src/search-index.json があればそれを読み、なければ CDN を見る。
# ここへ置くことで search_shapes がオフラインで動く。
if [ -f "$vendor_index" ] && [ -d "$root/node_modules/@drawio/mcp/src" ]; then
  cp "$vendor_index" "$mcp_index"
  echo "  配置しました: $mcp_index"
fi

echo
status
echo
echo "図を作るには Claude Code で /aws-diagram を使ってください。"
