'use strict';
// 复查：超长条目是否都带了 replace_flag（带 flag 的不会导致初始化失败）
const fs = require('fs');
const path = require('path');
const AL = require('./alignlib.js');

const OUT = process.env.PATCH_OUT || AL.PATCH_DIR; // 默认读仓库 patch/；如需检查 build_patch 的中间产物，设 PATCH_OUT=./out_patch

function gbkLen(s) {
  let n = 0;
  for (const ch of s) n += (ch.codePointAt(0) < 0x80 ? 1 : 2);
  return n;
}

let overNoFlag = 0, overWithFlag = 0;
const bad = [];
let total = 0;

for (const fname of fs.readdirSync(OUT).filter(f => f.endsWith('.txt')).sort()) {
  const { entries } = AL.parseVl(fs.readFileSync(path.join(OUT, fname), 'utf8'));
  for (const e of entries) {
    if (e.meta.index === undefined) continue;
    const tr = (e.trans || '').trim();
    if (!/[\u4e00-\u9fff]/.test(tr)) continue;
    const len = parseInt(e.meta.length || '0', 10);
    if (!len) continue;
    total++;
    const g = gbkLen(tr);
    if (g <= len) continue;
    const hasFlag = e.hdr.some(h => h.trim() === 'replace_flag');
    if (hasFlag) overWithFlag++;
    else {
      overNoFlag++;
      if (bad.length < 20) bad.push({ f: fname, idx: e.meta.index, len, g, tr });
    }
  }
}

console.log(`有 length 约束 ${total} 条`);
console.log(`超长但已加 replace_flag: ${overWithFlag}`);
console.log(`超长且未加 flag（会导致初始化失败）: ${overNoFlag}`);
if (bad.length) {
  console.log('\n未加 flag 的超长条目:');
  bad.forEach(b => console.log(`  ${b.f}#${b.idx} ${b.len}→${b.g}`));
}
