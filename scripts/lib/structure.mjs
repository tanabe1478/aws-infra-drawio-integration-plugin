// structure.yaml の読み込みと検証。
//
// この層が「人間が管理するデータ」の唯一の入口。レンダラはここを通ったものしか見ない。
// 検証は落とすためではなく、AI が書いた構造の取りこぼし (存在しない id への参照、
// 未知の trigger、未マップのリソース型) を人間に見せるためにある。

import { existsSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { parse as parseYaml } from "yaml";
import { CONTAINER_KIND_NAMES, CONTAINER_KINDS } from "./containers.mjs";
import { PLUGIN_ROOT } from "./shape-index.mjs";

// ZOZO 記事の語彙をベースに、AWS で頻出のものを足した既定の trigger 集合。
// 追加したい場合は layout.yaml の triggers に定義を足せば拡張できる。
export const DEFAULT_TRIGGER_STYLES = {
  api_call: { label: "API 呼び出し", stroke: "#232F3E", dashed: 0 },
  invoke: { label: "同期呼び出し", stroke: "#232F3E", dashed: 0 },
  send: { label: "送信", stroke: "#232F3E", dashed: 0 },
  read: { label: "参照", stroke: "#545B64", dashed: 1 },
  write: { label: "書き込み", stroke: "#545B64", dashed: 0 },
  schedule: { label: "定期実行", stroke: "#B0084D", dashed: 1 },
  s3_event: { label: "S3 イベント", stroke: "#7AA116", dashed: 1 },
  webhook_event: { label: "Webhook", stroke: "#7AA116", dashed: 1 },
  stream: { label: "ストリーム", stroke: "#8C4FFF", dashed: 0 },
  poll: { label: "ポーリング", stroke: "#8C4FFF", dashed: 1 },
  queue: { label: "キュー経由", stroke: "#CD2264", dashed: 0 },
  notify: { label: "通知", stroke: "#CD2264", dashed: 1 },
};

let shapeMapCache = null;

export function loadShapeMap() {
  if (!shapeMapCache) {
    shapeMapCache = JSON.parse(
      readFileSync(join(PLUGIN_ROOT, "scripts", "shape-map.json"), "utf-8")
    );
  }

  return shapeMapCache;
}

/**
 * structure.yaml と、同ディレクトリの任意の layout.yaml を読む。
 * layout.yaml は機械可読な描画設定 (trigger の見た目、間隔など) の上書き。
 * conventions.md は人間/AI 向けの規約文書なのでレンダラは読まない。
 */
export function loadStructure(structurePath) {
  const raw = parseYaml(readFileSync(structurePath, "utf-8")) ?? {};
  const layoutPath = join(dirname(structurePath), "layout.yaml");
  const layout = existsSync(layoutPath)
    ? (parseYaml(readFileSync(layoutPath, "utf-8")) ?? {})
    : {};

  return {
    structure: {
      version: raw.version ?? 1,
      metadata: raw.metadata ?? {},
      containers: raw.containers ?? [],
      nodes: raw.nodes ?? [],
      edges: raw.edges ?? [],
    },
    layout: {
      ...layout,
      triggers: { ...DEFAULT_TRIGGER_STYLES, ...(layout.triggers ?? {}) },
    },
    layoutPath: existsSync(layoutPath) ? layoutPath : null,
  };
}

/**
 * 構造を検証する。
 * @returns {{errors: string[], warnings: string[]}}
 */
export function validateStructure({ structure, layout }) {
  const errors = [];
  const warnings = [];
  const { containers, nodes, edges } = structure;
  const shapeMap = loadShapeMap();

  const ids = new Map();
  const claim = (id, where) => {
    if (id == null || id === "") {
      errors.push(`${where}: id が空です。`);
      return;
    }
    if (ids.has(id)) {
      errors.push(`id が重複しています: "${id}" (${ids.get(id)} と ${where})`);
      return;
    }
    ids.set(id, where);
  };

  containers.forEach((c, i) => claim(c.id, `containers[${i}]`));
  nodes.forEach((n, i) => claim(n.id, `nodes[${i}]`));

  const containerIds = new Set(containers.map((c) => c.id));
  const nodeIds = new Set(nodes.map((n) => n.id));

  for (const [i, c] of containers.entries()) {
    if (!CONTAINER_KIND_NAMES.includes(c.kind)) {
      errors.push(
        `containers[${i}] "${c.id}": 未知の kind "${c.kind}"。使用可能: ${CONTAINER_KIND_NAMES.join(", ")}`
      );
    }
    if (c.parent != null && !containerIds.has(c.parent)) {
      errors.push(`containers[${i}] "${c.id}": parent "${c.parent}" が containers にありません。`);
    }
  }

  // 親子の循環検出。
  const parentOf = new Map(containers.map((c) => [c.id, c.parent ?? null]));
  for (const c of containers) {
    const seen = new Set([c.id]);
    let cur = parentOf.get(c.id) ?? null;

    while (cur != null) {
      if (seen.has(cur)) {
        errors.push(`containers "${c.id}": parent が循環しています。`);
        break;
      }
      seen.add(cur);
      cur = parentOf.get(cur) ?? null;
    }
  }

  for (const [i, n] of nodes.entries()) {
    if (n.container != null && !containerIds.has(n.container)) {
      errors.push(`nodes[${i}] "${n.id}": container "${n.container}" が containers にありません。`);
    }
    if (!n.type && !n.style) {
      errors.push(`nodes[${i}] "${n.id}": type か style のどちらかが必要です。`);
    } else if (n.type && !shapeMap[n.type] && !n.style) {
      warnings.push(
        `nodes[${i}] "${n.id}": type "${n.type}" は shape-map.json に未登録です。` +
          `drawio MCP の search_shapes で style を引いて node.style に貼るか、scripts/gen-shape-map.mjs に型を追加してください。`
      );
    }
    if (!n.name) warnings.push(`nodes[${i}] "${n.id}": name が空です。`);
  }

  for (const [i, e] of edges.entries()) {
    for (const side of ["from", "to"]) {
      const ref = e[side];
      if (!nodeIds.has(ref) && !containerIds.has(ref)) {
        errors.push(`edges[${i}]: ${side} "${ref}" に対応する node/container がありません。`);
      }
    }
    if (e.trigger != null && !layout.triggers[e.trigger]) {
      errors.push(
        `edges[${i}] (${e.from} -> ${e.to}): 未知の trigger "${e.trigger}"。` +
          `使用可能: ${Object.keys(layout.triggers).join(", ")}`
      );
    }
  }

  // 図に登場しない孤立ノードは、抽出漏れか不要リソースのどちらかなので知らせる。
  const touched = new Set(edges.flatMap((e) => [e.from, e.to]));
  for (const n of nodes) {
    if (!touched.has(n.id)) {
      warnings.push(`nodes "${n.id}": edges に一度も現れません (関係の抽出漏れの可能性)。`);
    }
  }

  return { errors, warnings };
}

export function containerStyle(kind) {
  return CONTAINER_KINDS[kind]?.style ?? CONTAINER_KINDS.generic.style;
}
