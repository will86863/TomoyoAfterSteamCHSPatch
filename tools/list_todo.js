'use strict';
// 精确列出需要人工翻译的条目（PSP 覆盖范围内的漏网条目 + 明确分类）
const fs = require('fs');
const path = require('path');
const AL = require('./alignlib.js');

const OUT = process.env.PATCH_OUT || AL.PATCH_DIR; // 默认读仓库 patch/；如需检查 build_patch 的中间产物，设 PATCH_OUT=./out_patch
const SRC = AL.PATCH_DIR;

const MARKER_RE = /^(BAD END|GAME OVER|TO BE CONTINUED|Ending|Epilogue|Prologue|Title|Menu|Save|Load|OK|Cancel|Yes|No|Back|Next)$/i;

const fileToCh = {};
for (const ch of Object.keys(AL.MAP)) for (const f of AL.MAP[ch]) fileToCh[f] = ch;

const todo = [];
const stats = { symbol: 0, macro: 0, real: 0 };

for (const fname of fs.readdirSync(OUT).filter(f => f.endsWith('.txt')).sort()) {
  const base = fname.replace('.txt', '');
  const ch = fileToCh[base];
  const { entries } = AL.parseVl(fs.readFileSync(path.join(OUT, fname), 'utf8'));
  entries.forEach((e, i) => {
    if (e.meta.index === undefined) return;
    const tr = (e.trans || '').trim();
    if (/[\u4e00-\u9fff]/.test(tr)) return;
    const bare = tr.replace(/[^A-Za-z]/g, '');
    if (bare.length === 0) { stats.symbol++; return; }
    if (/^[A-Z0-9&_\-\s.]{4,}$/.test(tr.trim())) { stats.macro++; return; }
    if (MARKER_RE.test((e.orig || '').trim())) { stats.macro++; return; }
    stats.real++;
    todo.push({
      file: base,
      ch: ch || null,
      idx: e.meta.index,
      entryIdx: i,
      name: e.meta.name === 'NULL' ? null : e.meta.name,
      len: parseInt(e.meta.length || '0', 10),
      en: (e.orig || '').replace(/\\"/g, '"'),
    });
  });
}

console.log(`扫描结果:`);
console.log(`  纯符号 ${stats.symbol} 条（不需翻译）`);
console.log(`  程序宏/标记 ${stats.macro} 条（保留原文）`);
console.log(`  需翻译 ${stats.real} 条`);

// 按 PSP 有无覆盖分组
const covered = new Set();
for (const ch of Object.keys(AL.MAP)) for (const f of AL.MAP[ch]) covered.add(f);

const inPsp = todo.filter(x => x.ch !== null);
const outPsp = todo.filter(x => x.ch === null);

console.log(`\n  其中 PSP 覆盖范围内（漏网）: ${inPsp.length} 条`);
console.log(`  其中 PSP 无覆盖（D&T/结局等）: ${outPsp.length} 条`);

const byFile = {};
for (const x of inPsp) byFile[x.file] = (byFile[x.file] || 0) + 1;
console.log('\nPSP 覆盖范围内的漏网分布:');
Object.entries(byFile).sort((a, b) => b[1] - a[1]).forEach(([f, n]) => console.log(`  ${f.padEnd(12)} ${n}`));

fs.writeFileSync('todo_final.json', JSON.stringify(todo, null, 1), 'utf8');
console.log(`\n全部 ${todo.length} 条明细 -> todo_final.json`);
