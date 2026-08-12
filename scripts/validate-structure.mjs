#!/usr/bin/env node
// structure.yaml の検証のみを行う。CI と、AI が自己チェックするための入口。
//
//   node scripts/validate-structure.mjs diagrams/api/structure.yaml [...]
//
// 終了コード: 0 = エラーなし / 1 = エラーあり / 2 = 使い方の誤り

import { loadStructure, validateStructure } from "./lib/structure.mjs";

const paths = process.argv.slice(2).filter((a) => !a.startsWith("-"));

if (paths.length === 0) {
  console.error("使い方: node scripts/validate-structure.mjs <structure.yaml> [...]");
  process.exit(2);
}

let errorCount = 0;
let warnCount = 0;

for (const path of paths) {
  const { errors, warnings } = validateStructure(loadStructure(path));

  console.log(`\n== ${path}`);

  for (const w of warnings) console.log(`  warn : ${w}`);
  for (const e of errors) console.log(`  error: ${e}`);

  if (errors.length === 0 && warnings.length === 0) console.log("  OK");

  errorCount += errors.length;
  warnCount += warnings.length;
}

console.log(`\nエラー ${errorCount} 件 / 警告 ${warnCount} 件`);
process.exit(errorCount > 0 ? 1 : 0);
