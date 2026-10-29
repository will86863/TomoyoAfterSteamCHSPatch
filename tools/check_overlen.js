'use strict';
// 精确计算：哪些条目的译文 GBK 字节数超过了 length 字段（v0.0.2 会因此拒绝加载）
const fs = require('fs');
const path = require('path');
const AL = require('./alignlib.js');

const OUT = process.env.PATCH_OUT || AL.PATCH_DIR; // 默认读仓库 patch/；如需检查 build_patch 的中间产物，设 PATCH_OUT=./out_patch
const SRC = AL.PATCH_DIR;

// GBK 字节长度：ASCII=1、其他=2
function gbkLen(s) {
  let n = 0;
  for (const ch of s) n += (ch.codePointAt(0) < 0x80 ? 1 : 2);
  return n;
}

const fileToCh = {};
for (const ch of Object.keys(AL.MAP)) for (const f of AL.MAP[ch]) fileToCh[f] = ch;

let over = 0, total = 0;
const rows = [];
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
    if (g > len) {
      over++;
      rows.push({ f: fname.replace('.txt', ''), idx: e.meta.index, len, g, over: g - len, en: e.orig, tr });
    }
  }
}
console.log(`有 length 约束的条目 ${total}，GBK 字节超长 ${over} 条`);
rows.sort((a, b) => b.over - a.over);
console.log('\n超长最多 20 条:');
rows.slice(0, 20).forEach(r => {
  console.log(`  ${r.f}#${r.idx} len=${r.len} gbk=${r.g} (+${r.over})`);
  console.log(`     EN: ${(r.en || '').replace(/\\"/g, '"').slice(0, 60)}`);
  console.log(`     ZH: ${r.tr.slice(0, 60)}`);
});

// 按文件统计
const byFile = {};
for (const r of rows) byFile[r.f] = (byFile[r.f] || 0) + 1;
console.log('\n按文件:');
Object.entries(byFile).sort((a, b) => b[1] - a[1]).slice(0, 25).forEach(([f, n]) => console.log(`  ${f.padEnd(12)} ${n}`));

fs.writeFileSync('overlen_all.json', JSON.stringify(rows, null, 1), 'utf8');
