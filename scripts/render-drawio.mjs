#!/usr/bin/env node
// structure.yaml (+ layout.yaml) -> .drawio (mxfile XML)
//
//   node scripts/render-drawio.mjs diagrams/api/structure.yaml
//   node scripts/render-drawio.mjs diagrams/api/structure.yaml -o out/api.drawio
//   node scripts/render-drawio.mjs diagrams/api/structure.yaml --stdout
//
// 出力は決定論的 (タイムスタンプを埋め込まない) なので、同じ入力なら diff が出ない。

import { writeFileSync } from "node:fs";
import { basename, dirname, join } from "node:path";
import { computeLayout } from "./lib/layout.mjs";
import { containerStyle, loadShapeMap, loadStructure, validateStructure } from "./lib/structure.mjs";
import { CONTAINER_KINDS } from "./lib/containers.mjs";

function xmlAttr(value) {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

// draw.io の style 文字列に混ざると壊れる文字だけ落とす。
function safeStyle(style) {
  return String(style).replace(/[\r\n]+/g, "");
}

function edgeAnchors(from, to) {
  const dx = to.absX - from.absX;
  const dy = to.absY - from.absY;

  if (Math.abs(dx) >= Math.abs(dy)) {
    return dx >= 0
      ? { exitX: 1, exitY: 0.5, entryX: 0, entryY: 0.5 }
      : { exitX: 0, exitY: 0.5, entryX: 1, entryY: 0.5 };
  }

  return dy >= 0
    ? { exitX: 0.5, exitY: 1, entryX: 0.5, entryY: 0 }
    : { exitX: 0.5, exitY: 0, entryX: 0.5, entryY: 1 };
}

function edgeStyle(trigger, triggers) {
  const t = triggers[trigger] ?? { stroke: "#232F3E", dashed: 0 };

  return (
    "edgeStyle=orthogonalEdgeStyle;rounded=0;html=1;jettySize=auto;orthogonalLoop=1;" +
    "endArrow=block;endFill=1;strokeWidth=1.5;fontSize=10;labelBackgroundColor=#FFFFFF;" +
    `strokeColor=${t.stroke};fontColor=${t.stroke};dashed=${t.dashed ?? 0};`
  );
}

export function renderDrawio({ structure, layout }) {
  const { geometry, containerOrder, grid } = computeLayout({ structure, layout });
  const shapeMap = loadShapeMap();
  const view = structure.metadata?.view ?? "diagram";
  const lines = [];

  const cell = (id, { label, style, geo, parent, tooltip, attrs = {} }) => {
    const g = `<mxGeometry x="${Math.round(geo.x)}" y="${Math.round(geo.y)}" width="${Math.round(
      geo.w
    )}" height="${Math.round(geo.h)}" as="geometry" />`;
    const mxCell = `<mxCell style="${xmlAttr(safeStyle(style))}" vertex="1" parent="${xmlAttr(
      parent
    )}">${g}</mxCell>`;

    // <object> で包むと、図側に構造の出自 (リソース型・ソース位置) を残せる。
    const extra = Object.entries(attrs)
      .filter(([, v]) => v != null && v !== "")
      .map(([k, v]) => ` ${k}="${xmlAttr(v)}"`)
      .join("");

    lines.push(
      `        <object id="${xmlAttr(id)}" label="${xmlAttr(label)}"` +
        (tooltip ? ` tooltip="${xmlAttr(tooltip)}"` : "") +
        `${extra}>`
    );
    lines.push(`          ${mxCell}`);
    lines.push("        </object>");
  };

  // --- コンテナ (親から順に) ---
  for (const c of containerOrder) {
    const geo = geometry.get(c.id);
    cell(c.id, {
      label: c.name ?? CONTAINER_KINDS[c.kind]?.defaultName ?? c.kind,
      style: c.style ?? containerStyle(c.kind),
      geo,
      parent: geo.parentId ?? "1",
      tooltip: c.description,
      attrs: { awsContainerKind: c.kind },
    });
  }

  // --- ノード ---
  for (const n of structure.nodes) {
    const geo = geometry.get(n.id);
    const mapped = n.type ? shapeMap[n.type] : null;
    // 優先順: node.style (search_shapes の結果を貼ったもの) > shape-map > 素の矩形
    const style =
      n.style ??
      mapped?.style ??
      "rounded=0;whiteSpace=wrap;html=1;strokeColor=#879196;fillColor=#FFFFFF;";

    cell(n.id, {
      label: n.name ?? n.id,
      style,
      geo,
      parent: geo.parentId ?? "1",
      tooltip: n.description,
      attrs: { awsType: n.type, source: n.source },
    });
  }

  // --- エッジ ---
  // ラベルの位置は 2 つの失敗を避ける必要がある。
  //   - 常に中点に置くと、長く迂回した線のラベルが無関係なリソースの真横に来る
  //   - 常に始点寄りに置くと、短い線ではラベルがノード名 (アイコン下) と重なる
  // そこで短い線は中点、長い線は始点寄りにし、端点を共有する線どうしはずらす。
  const SHORT_EDGE = 360; // 始点と終点のマンハッタン距離 (px)
  const LABEL_X = [-0.65, -0.4, -0.85, -0.25];
  const LABEL_Y = [-14, 14, -32, 32];
  const labelSlot = new Map();

  for (const [i, e] of structure.edges.entries()) {
    const from = geometry.get(e.from);
    const to = geometry.get(e.to);
    const a = edgeAnchors(from, to);
    const anchors = Object.entries(a)
      .map(([k, v]) => `${k}=${v};`)
      .join("");
    const style = edgeStyle(e.trigger, layout.triggers) + anchors;
    const label = e.label ?? (e.trigger ? (layout.triggers[e.trigger]?.label ?? "") : "");

    lines.push(
      `        <mxCell id="edge-${i}" value="${xmlAttr(label)}" style="${xmlAttr(
        safeStyle(style)
      )}" edge="1" parent="1" source="${xmlAttr(e.from)}" target="${xmlAttr(e.to)}">`
    );
    // 端点を共有する線は同じ位置にラベルが集まるため、順番でずらす。
    const slot = Math.max(labelSlot.get(e.from) ?? 0, labelSlot.get(e.to) ?? 0);
    labelSlot.set(e.from, slot + 1);
    labelSlot.set(e.to, slot + 1);

    const span = Math.abs(to.absX - from.absX) + Math.abs(to.absY - from.absY);
    // x は線上の位置 (-1 = 始点, 0 = 中点, 1 = 終点)、y は線からの距離。
    const lx = span < SHORT_EDGE ? 0 : LABEL_X[slot % LABEL_X.length];
    const ly = LABEL_Y[slot % LABEL_Y.length];

    lines.push(`          <mxGeometry x="${lx}" y="${ly}" relative="1" as="geometry" />`);
    lines.push("        </mxCell>");
  }

  const maxX = Math.max(...[...geometry.values()].map((g) => g.absX + g.w), 800);
  const maxY = Math.max(...[...geometry.values()].map((g) => g.absY + g.h), 600);
  const pageW = Math.ceil((maxX + grid.marginX) / 10) * 10;
  const pageH = Math.ceil((maxY + grid.marginY) / 10) * 10;

  return [
    '<mxfile host="aws-infra-drawio" agent="aws-infra-drawio-integration-plugin" type="device">',
    `  <diagram id="${xmlAttr(view)}" name="${xmlAttr(view)}">`,
    `    <mxGraphModel dx="1200" dy="800" grid="1" gridSize="10" guides="1" tooltips="1" connect="1" arrows="1" fold="1" page="1" pageScale="1" pageWidth="${pageW}" pageHeight="${pageH}" math="0" shadow="0">`,
    "      <root>",
    '        <mxCell id="0" />',
    '        <mxCell id="1" parent="0" />',
    ...lines,
    "      </root>",
    "    </mxGraphModel>",
    "  </diagram>",
    "</mxfile>",
    "",
  ].join("\n");
}

// --- CLI ---
if (import.meta.url === `file://${process.argv[1]}`) {
  const args = process.argv.slice(2);
  const structurePath = args.find((a) => !a.startsWith("-"));

  if (!structurePath) {
    console.error("使い方: node scripts/render-drawio.mjs <structure.yaml> [-o out.drawio] [--stdout]");
    process.exit(2);
  }

  const loaded = loadStructure(structurePath);
  const { errors, warnings } = validateStructure(loaded);

  for (const w of warnings) console.error(`warn: ${w}`);

  if (errors.length > 0) {
    for (const e of errors) console.error(`error: ${e}`);
    console.error(`\n${errors.length} 件のエラーがあるため描画を中止しました。`);
    process.exit(1);
  }

  let xml = renderDrawio(loaded);

  // --route: 障害物を避ける直交経路をエッジに焼き込む (@drawio/mcp の libavoid を利用)。
  if (args.includes("--route")) {
    const { routeDrawio } = await import("./lib/route.mjs");
    xml = await routeDrawio(xml);
  }

  const outIndex = args.indexOf("-o");
  const view = loaded.structure.metadata?.view ?? basename(dirname(structurePath));
  const outPath =
    outIndex !== -1 ? args[outIndex + 1] : join(dirname(structurePath), `${view}.drawio`);

  if (args.includes("--stdout")) {
    process.stdout.write(xml);
  } else {
    writeFileSync(outPath, xml);
    console.log(`書き出し: ${outPath}`);
  }
}
