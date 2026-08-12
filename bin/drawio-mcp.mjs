#!/usr/bin/env node
// draw.io 公式 MCP サーバー (@drawio/mcp) の起動ラッパー。
//
// パッケージの置き場所を固定で書かず require.resolve で引くため、
// npm/npx が依存をどこへ配置しても (プラグイン直下でもホイスト先でも) 起動できる。
// あわせて、search_shapes をオフラインで動かすための shape インデックスを配置する。

import { spawn } from "node:child_process";
import { copyFileSync, existsSync } from "node:fs";
import { createRequire } from "node:module";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import { ensureDependencies } from "./lib/deps.mjs";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");

// プラグインとして入れると依存が別の場所に置かれるため、先に解決できる状態にする。
ensureDependencies(ROOT);

const require = createRequire(join(ROOT, "package.json"));

let entry;

try {
  entry = require.resolve("@drawio/mcp/src/index.js");
} catch (e) {
  console.error(`@drawio/mcp を解決できませんでした: ${e.message}`);
  process.exit(127);
}

// @drawio/mcp は src/search-index.json があればそれを読み、なければ CDN を見る。
// 同梱のインデックスを置いて search_shapes をネットワークなしで動かす。
const vendored = join(ROOT, "vendor", "search-index.json");
const target = join(dirname(entry), "search-index.json");

if (existsSync(vendored) && existsSync(target) === false) {
  try {
    copyFileSync(vendored, target);
  } catch (e) {
    // 書き込めない配置 (読み取り専用の cache 等) では CDN 参照のまま動かす。
    console.error(`warn: shape インデックスを配置できませんでした (${e.message})。`);
  }
}

const child = spawn(process.execPath, [entry, ...process.argv.slice(2)], { stdio: "inherit" });

child.on("exit", (code, signal) => {
  process.exit(signal ? 128 : (code ?? 1));
});
