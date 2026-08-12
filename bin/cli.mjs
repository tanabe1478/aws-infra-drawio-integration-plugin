#!/usr/bin/env node
// npx から使うための入口。scripts/ 配下の各コマンドをサブコマンドとして束ねる。
//
//   npx aws-infra-drawio render <structure.yaml> [--route]
//
// インストールせずに使えるようにするのが目的なので、パッケージ内のスクリプトを
// 子プロセスで起動し、終了コードをそのまま返すだけにしている。

import { spawn } from "node:child_process";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");

const USAGE = `使い方: npx aws-infra-drawio <サブコマンド> [引数...]

  validate <structure.yaml> [...]              構造の検証
  render   <structure.yaml> [-o out] [--route] .drawio の生成
  check    <structure.yaml> [...]              枠のはみ出し・重なりの検査
  export   <file.drawio> [png|svg|pdf] [scale] 画像への書き出し
  setup    [--status|--serve|--stop]           draw.io エディタの起動・状態確認
  mcp                                          draw.io MCP サーバーの起動
  claude   [claude の引数...]                  このプラグインを読み込んだ Claude Code の起動

例:
  npx aws-infra-drawio render diagrams/api/structure.yaml --route
  npx aws-infra-drawio claude          # インストールせずにプラグインを使う
`;

// サブコマンド名 -> [コマンド, 引数]
const COMMANDS = {
  validate: (args) => ["node", [join(ROOT, "scripts", "validate-structure.mjs"), ...args]],
  render: (args) => ["node", [join(ROOT, "scripts", "render-drawio.mjs"), ...args]],
  check: (args) => ["node", [join(ROOT, "scripts", "check-geometry.mjs"), ...args]],
  export: (args) => ["bash", [join(ROOT, "scripts", "export-drawio.sh"), ...args]],
  setup: (args) => ["bash", [join(ROOT, "scripts", "setup.sh"), ...args]],
  mcp: (args) => ["node", [join(ROOT, "bin", "drawio-mcp.mjs"), ...args]],
  claude: (args) => ["claude", ["--plugin-dir", ROOT, ...args]],
};

const [name, ...args] = process.argv.slice(2);

if (!name || name === "help" || name === "--help" || name === "-h") {
  process.stdout.write(USAGE);
  process.exit(name ? 0 : 2);
}

if (name === "--version" || name === "-v") {
  console.log(JSON.parse(readFileSync(join(ROOT, "package.json"), "utf8")).version);
  process.exit(0);
}

const build = COMMANDS[name];

if (!build) {
  console.error(`不明なサブコマンドです: ${name}\n`);
  process.stderr.write(USAGE);
  process.exit(2);
}

const [command, commandArgs] = build(args);
const child = spawn(command, commandArgs, { stdio: "inherit" });

child.on("error", (e) => {
  if (e.code === "ENOENT") {
    console.error(
      command === "claude"
        ? "claude コマンドが見つかりません。Claude Code をインストールしてください。"
        : `${command} が見つかりません。`,
    );
    process.exit(127);
  }
  console.error(e.message);
  process.exit(1);
});

child.on("exit", (code, signal) => {
  process.exit(signal ? 128 : (code ?? 1));
});
