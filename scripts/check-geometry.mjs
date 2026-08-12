#!/usr/bin/env node
// レイアウトの幾何的な健全性を検査する。
//
//   node scripts/check-geometry.mjs diagrams/api/structure.yaml [...]
//
// 図の「見た目が壊れていないこと」を目視ではなく機械で担保するための検査。
// 検査項目
//   1. 座標が負でない (draw.io のページ外に飛び出さない)
//   2. 各セルが親コンテナの内側に収まっている
//   3. 同じ親を持つセル同士が重なっていない

import { computeLayout } from "./lib/layout.mjs";
import { loadStructure } from "./lib/structure.mjs";

function boxesOf(structurePath) {
  const loaded = loadStructure(structurePath);
  const { geometry } = computeLayout(loaded);
  const labelOf = new Map([
    ...loaded.structure.containers.map((c) => [c.id, `container ${c.id}`]),
    ...loaded.structure.nodes.map((n) => [n.id, `node ${n.id}`]),
  ]);

  return { geometry, labelOf };
}

function overlaps(a, b) {
  return (
    a.absX < b.absX + b.w &&
    b.absX < a.absX + a.w &&
    a.absY < b.absY + b.h &&
    b.absY < a.absY + a.h
  );
}

const paths = process.argv.slice(2).filter((a) => !a.startsWith("-"));

if (paths.length === 0) {
  console.error("使い方: node scripts/check-geometry.mjs <structure.yaml> [...]");
  process.exit(2);
}

let failures = 0;

for (const path of paths) {
  const { geometry, labelOf } = boxesOf(path);
  const problems = [];

  for (const [id, g] of geometry) {
    if (g.absX < 0 || g.absY < 0) {
      problems.push(`${labelOf.get(id)}: 座標が負です (x=${g.absX}, y=${g.absY})`);
    }

    if (g.parentId) {
      const p = geometry.get(g.parentId);

      if (
        g.absX < p.absX ||
        g.absY < p.absY ||
        g.absX + g.w > p.absX + p.w ||
        g.absY + g.h > p.absY + p.h
      ) {
        problems.push(`${labelOf.get(id)}: 親 "${g.parentId}" の枠から出ています`);
      }
    }
  }

  // 同じ親を持つセル同士の重なり。
  const byParent = new Map();
  for (const [id, g] of geometry) {
    const key = g.parentId ?? "__root__";
    if (!byParent.has(key)) byParent.set(key, []);
    byParent.get(key).push([id, g]);
  }

  for (const [parent, siblings] of byParent) {
    for (let i = 0; i < siblings.length; i += 1) {
      for (let j = i + 1; j < siblings.length; j += 1) {
        const [idA, a] = siblings[i];
        const [idB, b] = siblings[j];

        if (overlaps(a, b)) {
          problems.push(
            `${labelOf.get(idA)} と ${labelOf.get(idB)} が重なっています (共通の親: ${parent})`
          );
        }
      }
    }
  }

  console.log(`\n== ${path}`);

  if (problems.length === 0) {
    console.log(`  OK (${geometry.size} セル)`);
  } else {
    for (const p of problems) console.log(`  NG: ${p}`);
    failures += problems.length;
  }
}

process.exit(failures > 0 ? 1 : 0);
