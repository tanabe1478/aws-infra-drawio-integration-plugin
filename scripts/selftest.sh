#!/usr/bin/env bash
# プラグイン自身の検査。CI と、変更後の確認に使う。
#
#   bash scripts/selftest.sh
#
# 検査項目
#   1. shape-map.json が生成結果と一致する (アイコン定義が手で書き換えられていない)
#   2. 同梱の例が検証を通る
#   3. 描画結果の幾何が壊れていない
#   4. 描画が決定論的 (2 回描いて同じ内容になる)

set -euo pipefail

root="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
example="$root/examples/serverless-api/diagrams/orders-api/structure.yaml"
tmp="$(mktemp -d)"
trap 'rm -rf "$tmp"' EXIT

echo "== 1. shape-map.json"
node "$root/scripts/gen-shape-map.mjs" --check >/dev/null
echo "  OK"

echo "== 2. structure.yaml の検証"
node "$root/scripts/validate-structure.mjs" "$example" >/dev/null
echo "  OK"

echo "== 3. 幾何の検証"
node "$root/scripts/check-geometry.mjs" "$example" >/dev/null
echo "  OK"

echo "== 4. 描画の決定性"
node "$root/scripts/render-drawio.mjs" "$example" -o "$tmp/a.drawio" >/dev/null
node "$root/scripts/render-drawio.mjs" "$example" -o "$tmp/b.drawio" >/dev/null

if ! diff -q "$tmp/a.drawio" "$tmp/b.drawio" >/dev/null; then
  echo "  NG: 同じ入力から違う出力が出ました" >&2
  exit 1
fi

# コミット済みの生成物との差も見る (再生成し忘れの検出)
committed="$root/examples/serverless-api/diagrams/orders-api/orders-api.drawio"
if [ -f "$committed" ]; then
  node "$root/scripts/render-drawio.mjs" "$example" --route -o "$tmp/routed.drawio" >/dev/null 2>&1
  if ! diff -q "$tmp/routed.drawio" "$committed" >/dev/null; then
    echo "  NG: 同梱の .drawio が最新ではありません。次を実行してください:" >&2
    echo "    node scripts/render-drawio.mjs $example --route" >&2
    exit 1
  fi
fi

echo "  OK"
echo
echo "すべて通りました。"
