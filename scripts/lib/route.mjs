// draw.io 公式 MCP に同梱されている libavoid 経路探索を、生成した .drawio に直接かける。
//
// MCP の open_drawio_xml は routing="libavoid" を指定するとプレビュー時に経路を整えるが、
// それはファイルには残らない。ここでは同じ実装 (@drawio/mcp の libavoid-pass) を
// 直接呼び、障害物を避ける直交経路をファイルに焼き込む。
//
// 注意: 経路探索コアは初回に viewer.diagrams.net への条件付き GET を試みる
// (5 秒でタイムアウト)。失敗した場合は @drawio/mcp 同梱のコピーに自動で
// フォールバックするため、オフラインでも動作する。完全にネットワークへ出したくない
// 場合はこの処理を使わない (render-drawio.mjs では --route を付けない)。

import { createRequire } from "node:module";

// <object> で包んだ頂点を、id を持つ素の <mxCell> に開いた「経路探索用のビュー」を作る。
// libavoid-pass は <mxCell> の id しか見ないため、この平坦化をしないと
// 頂点が障害物として認識されない。
const OBJECT_RE =
  /<object\b([^>]*)>\s*<mxCell\b([^>]*)>([\s\S]*?)<\/mxCell>\s*<\/object>/g;
const EDGE_RE = /<mxCell\b[^>]*\bedge="1"[^>]*>[\s\S]*?<\/mxCell>/g;

function attr(rawAttrs, name) {
  const m = new RegExp(`\\b${name}="([^"]*)"`).exec(rawAttrs);
  return m ? m[1] : null;
}

function flatten(xml) {
  return xml.replace(OBJECT_RE, (full, objAttrs, cellAttrs, body) => {
    const id = attr(objAttrs, "id");
    const label = attr(objAttrs, "label") ?? "";

    if (!id) return full;

    return `<mxCell id="${id}" value="${label}"${cellAttrs}>${body}</mxCell>`;
  });
}

function edgeBlocksById(xml) {
  const blocks = new Map();

  for (const match of xml.matchAll(EDGE_RE)) {
    const id = attr(match[0], "id");
    if (id) blocks.set(id, match[0]);
  }

  return blocks;
}

/**
 * エッジに障害物回避の直交経路を書き込んだ XML を返す。
 * 経路探索が使えない場合は元の XML をそのまま返す (描画を止めない)。
 */
export async function routeDrawio(xml) {
  const require = createRequire(import.meta.url);
  let routeXml;

  try {
    ({ routeXml } = await import(require.resolve("@drawio/mcp/src/libavoid-pass.js")));
  } catch (e) {
    console.error(`warn: 経路探索を読み込めませんでした (${e.message})。経路整形なしで出力します。`);
    return xml;
  }

  const routed = await routeXml(flatten(xml));
  const byId = edgeBlocksById(routed);

  // 頂点は libavoid では変わらないので、エッジのブロックだけ元の XML に差し戻す。
  return xml.replace(EDGE_RE, (block) => {
    const id = attr(block, "id");
    return (id && byId.get(id)) || block;
  });
}
