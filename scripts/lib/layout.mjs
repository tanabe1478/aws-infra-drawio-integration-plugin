// structure.yaml から座標を決定論的に決める。
//
// 設計の要点: 座標は AI に描かせない。同じ structure.yaml からは必ず同じ座標が出る。
// これにより .drawio の diff が「構成が変わった分だけ」になり、レビューできる。
//
// 配置ルール
//   - 横 (列) = データの流れ。edges の最長経路でランクを決め、左から右へ流す。
//   - 縦 (行) = 所属コンテナ。同じコンテナのノードは連続した行の帯を占める。
//     兄弟コンテナは行の帯が重ならないので、枠が交差しない。
//   - コンテナの枠は中身の外接矩形をパディングぶん広げたもの。入れ子は下から積み上げる。

const DEFAULT_GRID = {
  cellW: 78, // アイコン 1 個の幅 (aws4 の resourceIcon は 78x78)
  cellH: 78,
  colGap: 112, // 横の間隔。エッジラベルが入る余白を確保する
  rowGap: 76, // 縦の間隔。アイコン下のラベル 2 行ぶんを見込む
  pad: 26, // コンテナの左右下パディング
  headerTop: 44, // コンテナ上端のラベル領域
  marginX: 280, // 左端の余白。ネストしたコンテナが左に張り出すぶんを確保する
  marginY: 80,
  gutterRows: 1, // 兄弟コンテナの帯の間に挟む空き行数
  actorX: 40, // AWS Cloud の外に置く登場人物のレーン (marginX より左)
};

/**
 * edges から各ノードのランク (列番号) を求める。
 * 循環があっても止まらないよう、緩和回数を頂点数で打ち切る。
 */
function computeRanks(nodes, edges) {
  const rank = new Map(nodes.map((n) => [n.id, 0]));
  const nodeIds = new Set(rank.keys());
  const flow = edges.filter(
    (e) => nodeIds.has(e.from) && nodeIds.has(e.to) && e.from !== e.to && e.rank !== false
  );

  for (let i = 0; i < nodes.length; i += 1) {
    let changed = false;

    for (const e of flow) {
      const next = rank.get(e.from) + 1;
      if (next > rank.get(e.to)) {
        rank.set(e.to, next);
        changed = true;
      }
    }

    if (!changed) break;
  }

  // rank:false の辺しか持たないノード (証明書・ECR・ログなど) は流れの一部ではない。
  // 列 0 に取り残されると相手から遠くなるので、相手と同じ列に置いて上下に並べる。
  const inFlow = new Set(flow.flatMap((e) => [e.from, e.to]));
  const aside = edges.filter((e) => e.rank === false);

  for (let i = 0; i < aside.length; i += 1) {
    for (const e of aside) {
      for (const [self, other] of [
        [e.from, e.to],
        [e.to, e.from],
      ]) {
        if (!rank.has(self) || inFlow.has(self) || !rank.has(other)) continue;
        rank.set(self, rank.get(other));
      }
    }
  }

  // node.column で明示指定されていればそれを優先する (規約側で流れを固定したい場合)。
  for (const n of nodes) {
    if (Number.isInteger(n.column)) rank.set(n.id, n.column);
  }

  return rank;
}

/**
 * 主要フローを 1 本選ぶ (ランク最大のノードから、ランクが 1 ずつ下がる辺を逆にたどる)。
 * この経路上のノードだけを各コンテナの先頭行に置き、補助的なリソースは下の行へ回す。
 * 「主要フローは水平一直線、補助サービスは上下」という構成図の慣例をそのまま実装したもの。
 */
function mainChain(nodes, edges, rank) {
  if (nodes.length === 0) return new Set();

  const order = new Map(nodes.map((n, i) => [n.id, i]));
  const incoming = new Map(nodes.map((n) => [n.id, []]));
  for (const e of edges) {
    if (incoming.has(e.to) && rank.has(e.from)) incoming.get(e.to).push(e.from);
  }

  let cur = [...nodes].sort(
    (a, b) => rank.get(b.id) - rank.get(a.id) || order.get(a.id) - order.get(b.id)
  )[0].id;

  const chain = new Set([cur]);

  for (;;) {
    const prev = (incoming.get(cur) ?? [])
      .filter((id) => rank.get(id) === rank.get(cur) - 1 && !chain.has(id))
      .sort((a, b) => order.get(a) - order.get(b))[0];

    if (prev == null) break;

    chain.add(prev);
    cur = prev;
  }

  return chain;
}

/**
 * 同じコンテナ内のノードを、列が衝突しない範囲で同じ行に詰める。
 * 主要フロー上のノードは先頭行を占有し、それ以外は 2 行目以降に置く。
 * @returns {Map<string, number>} nodeId -> コンテナ内での行オフセット
 */
function packRows(members, rank, chain) {
  const rows = []; // 各行で使用済みの列集合
  const placed = new Map();
  const byRank = (a, b) => rank.get(a.id) - rank.get(b.id);
  const primary = members.filter((n) => chain.has(n.id)).sort(byRank);
  const secondary = members.filter((n) => !chain.has(n.id)).sort(byRank);

  const put = (node, from) => {
    const col = rank.get(node.id);
    let target = rows.findIndex((used, i) => i >= from && !used.has(col));

    if (target === -1) {
      rows.push(new Set());
      target = rows.length - 1;
    }

    rows[target].add(col);
    placed.set(node.id, target);
  };

  for (const node of primary) put(node, 0);
  // 主要フローが通るコンテナでは 1 行目を主要フロー専用にする。
  const secondaryFrom = primary.length > 0 ? 1 : 0;
  if (secondaryFrom === 1 && rows.length === 0) rows.push(new Set());
  for (const node of secondary) put(node, secondaryFrom);

  return { placed, height: Math.max(rows.length, 1) };
}

export function computeLayout({ structure, layout }) {
  const grid = { ...DEFAULT_GRID, ...(layout.grid ?? {}) };
  const { containers, nodes, edges } = structure;
  const rank = computeRanks(nodes, edges);
  const chain = mainChain(nodes, edges, rank);

  const childContainers = new Map([[null, []]]);
  for (const c of containers) childContainers.set(c.id, []);
  for (const c of containers) {
    const key = c.parent ?? null;
    if (!childContainers.has(key)) childContainers.set(key, []);
    childContainers.get(key).push(c);
  }

  const nodesIn = new Map([[null, []]]);
  for (const c of containers) nodesIn.set(c.id, []);
  for (const n of nodes) {
    const key = n.container ?? null;
    if (!nodesIn.has(key)) nodesIn.set(key, []);
    nodesIn.get(key).push(n);
  }

  // どのコンテナにも属さず、かつ流れの起点 (rank 0) にいるノードは
  // 「AWS Cloud の外側の登場人物」として左端のレーンに縦中央寄せで置く。
  // 行の帯を消費させないことで、AWS Cloud を図の最上段から始められる。
  // 外部システム (流れの途中や終端にある未所属ノード) は右端のレーンに置く。
  const minRank = Math.min(...[...rank.values()], 0);
  const outside = containers.length > 0 ? (nodesIn.get(null) ?? []) : [];
  const actors = outside.filter((n) => rank.get(n.id) === minRank);
  const externals = outside.filter((n) => rank.get(n.id) !== minRank);
  const actorIds = new Set([...actors, ...externals].map((n) => n.id));

  // --- 行の割り当て ---
  // コンテナごとに「自分のノードの行」→「子コンテナの帯」の順に相対行を決める。
  // 列の範囲が重ならない兄弟コンテナは同じ帯に横並びにする。すべてを縦に積むと、
  // 図の右側だけ使う小さなコンテナのために縦へ大きく間延びするため。
  const rowOf = new Map();

  const merge = (a, b) =>
    !a ? b : !b ? a : [Math.min(a[0], b[0]), Math.max(a[1], b[1])];
  const collide = (a, b) => Boolean(a && b && a[0] <= b[1] && b[0] <= a[1]);

  function measure(containerId) {
    const members = (nodesIn.get(containerId) ?? []).filter((n) => !actorIds.has(n.id));
    const { placed, height } = packRows(members, rank, chain);
    const ownHeight = placed.size > 0 ? height : 0;

    const cols = [...placed.keys()].map((id) => rank.get(id));
    let range = cols.length > 0 ? [Math.min(...cols), Math.max(...cols)] : null;

    const bands = [];

    for (const child of (childContainers.get(containerId) ?? []).map((c) => ({
      ...measure(c.id),
      band: c.band,
    }))) {
      // band を明示したコンテナはその帯に置く。列が重ならないだけで前の帯へ
      // 詰められると、論理的な位置から遠くへ飛んで線が追いにくくなる場合がある。
      let band = Number.isInteger(child.band)
        ? bands[child.band]
        : bands.find((b) => !collide(b.range, child.range));

      if (!band && Number.isInteger(child.band)) {
        while (bands.length <= child.band) {
          bands.push({ range: null, height: 0, children: [] });
        }
        band = bands[child.band];
      }

      if (!band) {
        band = { range: null, height: 0, children: [] };
        bands.push(band);
      }

      band.range = merge(band.range, child.range);
      band.height = Math.max(band.height, child.height);
      band.children.push(child);
      range = merge(range, child.range);
    }

    let offset = ownHeight;

    for (const band of bands) {
      if (offset > 0) offset += grid.gutterRows;
      band.offset = offset;
      offset += band.height;
    }

    return { placed, bands, range, height: Math.max(offset, 1) };
  }

  function apply(measured, startRow) {
    for (const [nodeId, offset] of measured.placed) rowOf.set(nodeId, startRow + offset);

    for (const band of measured.bands) {
      for (const child of band.children) apply(child, startRow + band.offset);
    }
  }

  apply(measure(null), 0);

  // --- ノードの絶対座標 ---
  const boxes = new Map();
  for (const n of nodes) {
    if (actorIds.has(n.id)) continue;

    boxes.set(n.id, {
      x: grid.marginX + rank.get(n.id) * (grid.cellW + grid.colGap),
      y: grid.marginY + rowOf.get(n.id) * (grid.cellH + grid.rowGap),
      w: n.w ?? grid.cellW,
      h: n.h ?? grid.cellH,
    });
  }

  // --- コンテナの枠: 子孫の外接矩形を下から積み上げる ---
  const depthOf = new Map();
  for (const c of containers) {
    let d = 0;
    let cur = c.parent ?? null;
    while (cur != null) {
      d += 1;
      cur = containers.find((x) => x.id === cur)?.parent ?? null;
    }
    depthOf.set(c.id, d);
  }

  const byDepthDesc = [...containers].sort((a, b) => depthOf.get(b.id) - depthOf.get(a.id));

  for (const c of byDepthDesc) {
    const members = [
      ...(nodesIn.get(c.id) ?? []).map((n) => boxes.get(n.id)),
      ...(childContainers.get(c.id) ?? []).map((child) => boxes.get(child.id)),
    ].filter(Boolean);

    if (members.length === 0) {
      // 空のコンテナは最小サイズで置く (抽出途中の構造でも壊れないように)。
      boxes.set(c.id, { x: grid.marginX, y: grid.marginY, w: 160, h: 100 });
      continue;
    }

    const minX = Math.min(...members.map((b) => b.x));
    const minY = Math.min(...members.map((b) => b.y));
    const maxX = Math.max(...members.map((b) => b.x + b.w));
    const maxY = Math.max(...members.map((b) => b.y + b.h));

    boxes.set(c.id, {
      x: minX - grid.pad,
      y: minY - grid.headerTop,
      w: maxX - minX + grid.pad * 2,
      h: maxY - minY + grid.headerTop + grid.pad,
    });
  }

  // --- AWS の外側のノードを左右のレーンに縦中央寄せで置く ---
  // 流れの起点 (利用者・クライアント) は左、途中や終端にある外部システムは右。
  const placeLane = (lane, laneX) => {
    if (lane.length === 0) return;

    const others = [...boxes.values()];
    const top = others.length > 0 ? Math.min(...others.map((b) => b.y)) : grid.marginY;
    const bottom = others.length > 0 ? Math.max(...others.map((b) => b.y + b.h)) : grid.marginY;
    const stackH = lane.length * grid.cellH + (lane.length - 1) * grid.rowGap;
    let y = Math.max(grid.marginY, (top + bottom) / 2 - stackH / 2);

    for (const n of lane) {
      boxes.set(n.id, { x: laneX, y, w: n.w ?? grid.cellW, h: n.h ?? grid.cellH });
      y += grid.cellH + grid.rowGap;
    }
  };

  const contentRight = Math.max(...[...boxes.values()].map((b) => b.x + b.w), grid.marginX);

  placeLane(actors, grid.actorX);
  placeLane(externals, contentRight + grid.colGap);

  // --- 全体を平行移動して、負の座標や上端の食い込みをなくす ---
  // コンテナ枠は中身より上/左に張り出すため、素のままだと原点をまたぐことがある。
  const all = [...boxes.values()];
  const dx = Math.max(0, grid.actorX - Math.min(...all.map((b) => b.x)));
  const dy = Math.max(0, grid.marginY - Math.min(...all.map((b) => b.y)));

  if (dx > 0 || dy > 0) {
    for (const b of all) {
      b.x += dx;
      b.y += dy;
    }
  }

  // --- drawio の親子は相対座標なので、親の原点を引く ---
  const parentIdOf = new Map();
  for (const c of containers) parentIdOf.set(c.id, c.parent ?? null);
  for (const n of nodes) parentIdOf.set(n.id, n.container ?? null);

  const geometry = new Map();
  for (const [id, box] of boxes) {
    const parentId = parentIdOf.get(id) ?? null;
    const origin = parentId ? boxes.get(parentId) : { x: 0, y: 0 };

    geometry.set(id, {
      x: box.x - origin.x,
      y: box.y - origin.y,
      w: box.w,
      h: box.h,
      absX: box.x,
      absY: box.y,
      parentId,
    });
  }

  // コンテナは親→子の順に XML へ書き出す必要があるため、深さ昇順を返す。
  const containerOrder = [...containers].sort((a, b) => depthOf.get(a.id) - depthOf.get(b.id));

  return { geometry, rank, rowOf, containerOrder, grid };
}
