'use strict';
// 生成最终缺口清单：out_patch 里仍是英文原文的条目，按文件分类
const fs = require('fs');
const path = require('path');
const AL = require('./alignlib.js');
const OUT = process.env.PATCH_OUT || AL.PATCH_DIR; // 默认读仓库 patch/；如需检查 build_patch 的中间产物，设 PATCH_OUT=./out_patch

const CJK = /[\u4e00-\u9fff]/;
const isMacro = (s) => /^[A-Z0-9&_\-\s.]{4,}$/.test(s.trim());

const byFile = {};
let total = 0, translated = 0, symOnly = 0, macro = 0, needTranslate = 0;
const items = [];

for (const fn of fs.readdirSync(OUT).filter(f => f.endsWith('.txt')).sort()) {
  const { entries } = AL.parseVl(fs.readFileSync(path.join(OUT, fn), 'utf8'));
  for (const e of entries) {
    if (e.meta.index === undefined) continue;
    total++;
    const tr = (e.trans || '').trim();
    if (CJK.test(tr)) { translated++; continue; }
    // 未译：分类
    if (isMacro(tr)) { macro++; continue; }
    const bare = tr.replace(/[^A-Za-z]/g, '');
    if (bare.length === 0) { symOnly++; continue; }
    needTranslate++;
    const base = fn.replace('.txt', '');
    byFile[base] = (byFile[base] || 0) + 1;
    items.push({
      file: base,
      idx: e.meta.index,
      offset: e.meta.offset,
      name: e.meta.name,
      len: e.meta.length,
      en: (e.orig || '').replace(/\\"/g, '"'),
    });
  }
}

console.log(`正文条目 ${total}`);
console.log(`  已译中文 ${translated} (${(100 * translated / total).toFixed(1)}%)`);
console.log(`  纯符号   ${symOnly}`);
console.log(`  程序宏   ${macro}`);
console.log(`  待翻译   ${needTranslate}`);
console.log(`\n待翻译分布（${Object.keys(byFile).length} 个文件）:`);
Object.entries(byFile).sort((a, b) => b[1] - a[1]).forEach(([f, n]) => {
  console.log(`  ${f.padEnd(12)} ${n}`);
});

fs.writeFileSync('todo_translate.json', JSON.stringify(items, null, 1), 'utf8');
console.log(`\n明细 -> todo_translate.json（${items.length} 条）`);
