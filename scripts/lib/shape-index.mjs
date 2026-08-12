// draw.io の shape 検索インデックス (search-index.json) を読むための共通処理。
//
// このインデックスは @drawio/mcp が search_shapes で使うものと同一ファイル。
// 約 10,000 件の shape が {style, w, h, title, tags, type} 形式で入っており、
// style をそのまま mxCell の style 属性に使える。
// ネットワークに出ないよう、setup.sh でローカルへ取得済みのものを読む。

import { existsSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const HERE = dirname(fileURLToPath(import.meta.url));
export const PLUGIN_ROOT = join(HERE, "..", "..");

// 探索順: プラグイン同梱 vendor → @drawio/mcp が使うローカルパス。
const CANDIDATES = [
  join(PLUGIN_ROOT, "vendor", "search-index.json"),
  join(PLUGIN_ROOT, "node_modules", "@drawio", "mcp", "src", "search-index.json"),
];

export function shapeIndexPath() {
  return CANDIDATES.find((p) => existsSync(p)) ?? null;
}

export function loadShapeIndex() {
  const path = shapeIndexPath();

  if (!path) {
    throw new Error(
      "shape インデックスが見つかりません。`bash scripts/setup.sh` を実行してください。\n" +
        "探索したパス:\n  " + CANDIDATES.join("\n  ")
    );
  }

  return JSON.parse(readFileSync(path, "utf-8"));
}

const STOPWORDS = new Set(["aws", "amazon", "service", "the", "of", "for"]);

function tokens(text) {
  return String(text)
    .toLowerCase()
    .split(/[^a-z0-9]+/)
    .filter((t) => t.length > 0);
}

/**
 * クエリ語にもっとも一致する aws4 リソースアイコンを返す。
 *
 * search_shapes MCP ツールと同じインデックスを引くが、こちらは
 * 「aws4 の resourceIcon に限定して 1 件を決定論的に選ぶ」用途に絞っている。
 *
 * @param {Array<object>} index loadShapeIndex() の戻り値
 * @param {string} query 空白区切りのキーワード (例: "lambda function")
 * @returns {object|null} {style, w, h, title} または null
 */
export function findAwsResourceShape(index, query) {
  const qs = tokens(query).filter((t) => !STOPWORDS.has(t));
  let best = null;

  for (const shape of index) {
    const style = shape.style ?? "";

    if (!style.includes("mxgraph.aws4.")) continue;
    // グループ (コンテナ) 系は別扱いなので除外する。
    if (style.includes("mxgraph.aws4.group")) continue;

    const title = tokens(shape.title);
    const tags = tokens(shape.tags).filter((t) => !STOPWORDS.has(t));
    const hay = new Set([...title, ...tags]);

    let score = 0;
    for (const q of qs) {
      if (title.includes(q)) score += 3;
      else if (hay.has(q)) score += 2;
      else if ([...hay].some((h) => h.startsWith(q) || q.startsWith(h))) score += 1;
    }

    if (score === 0) continue;

    // 全語一致を強く優先し、次に余計な語が少ないもの、最後に title の短さで決める。
    const matchedAll = qs.every((q) => hay.has(q) || title.includes(q));
    const key = [matchedAll ? 1 : 0, score, -tags.length, -shape.title.length];

    if (!best || compareKey(key, best.key) > 0) {
      best = { key, shape };
    }
  }

  if (!best) return null;

  const { style, w, h, title } = best.shape;
  return { style, w, h, title };
}

/**
 * shape 名 (mxgraph.aws4.<icon>) を直接指定して 1 件を取る。
 * キーワード検索が別バリアント (例: "EC2 M1 Mac Instance") を選んでしまう型は
 * こちらでアイコンを固定する。
 *
 * @param {Array<object>} index
 * @param {string} icon resIcon= または shape= の末尾 (例: "ec2", "ecs_service")
 */
export function findShapeByIcon(index, icon) {
  const needles = [`resIcon=mxgraph.aws4.${icon};`, `shape=mxgraph.aws4.${icon};`];

  for (const shape of index) {
    const style = shape.style ?? "";
    if (needles.some((n) => style.includes(n))) {
      return { style, w: shape.w, h: shape.h, title: shape.title };
    }
  }

  return null;
}

function compareKey(a, b) {
  for (let i = 0; i < a.length; i += 1) {
    if (a[i] !== b[i]) return a[i] - b[i];
  }
  return 0;
}
