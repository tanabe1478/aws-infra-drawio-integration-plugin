// 依存 (yaml / @drawio/mcp) を解決できる状態にする。
//
// Claude Code のプラグインとして入れると、パッケージの実体は
//   ~/.claude/plugins/cache/<marketplace>/<plugin>/<version>/
// に置かれる一方、依存は
//   ~/.claude/plugins/npm-cache/node_modules/
// に入る。Node は読み込み元から親を辿って node_modules を探すため、この配置では
// bare specifier (import "yaml") が解決できない。
//
// 見つけた node_modules へのシンボリックリンクをパッケージ直下に張って解決する。
// npx / npm install / git clone のときは最初の require.resolve で足りるので何もしない。

import { createRequire } from "node:module";
import { existsSync, symlinkSync } from "node:fs";
import { dirname, join } from "node:path";

const REQUIRED = ["yaml", "@drawio/mcp"];

/**
 * 依存が解決できるなら true。できない場合はリンクを張って再確認する。
 *
 * @param {string} root パッケージのルート
 * @returns {boolean} 解決できる状態になったか
 */
export function ensureDependencies(root) {
  if (resolvable(root)) {
    return true;
  }

  const found = findDepsDir(root);

  if (!found) {
    return false;
  }

  try {
    symlinkSync(found, join(root, "node_modules"), "dir");
  } catch {
    // 競合 (同時起動) や書き込み不可の配置では黙って諦め、呼び出し元に判断させる。
    return resolvable(root);
  }

  return resolvable(root);
}

function resolvable(root) {
  const require = createRequire(join(root, "package.json"));

  return REQUIRED.every((name) => {
    try {
      require.resolve(`${name}/package.json`);
      return true;
    } catch {
      return false;
    }
  });
}

/** root から親を辿り、必要な依存が揃っている node_modules を探す。 */
function findDepsDir(root) {
  let dir = root;

  for (;;) {
    for (const candidate of [join(dir, "node_modules"), join(dir, "npm-cache", "node_modules")]) {
      if (REQUIRED.every((name) => existsSync(join(candidate, name)))) {
        return candidate;
      }
    }

    const parent = dirname(dir);

    if (parent === dir) {
      return null;
    }

    dir = parent;
  }
}
