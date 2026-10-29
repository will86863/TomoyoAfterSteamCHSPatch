'use strict';
// 长度风险检查：中文 GBK 字节数 vs 原 length 字段
// 补丁按 length 决定走 short_text_map 还是 long_text，超长可能截断
const fs = require('fs');
const path = require('path');
const AL = require('./alignlib.js');
const OUT = process.env.PATCH_OUT || AL.PATCH_DIR; // 默认读仓库 patch/；如需检查 build_patch 的中间产物，设 PATCH_OUT=./out_patch
const SRC = path.join(__dirname, '..', 'patch');

// GBK 字节长度（近似：ASCII=1, 其他=2）
function gbkLen(s) {
  let n = 0;
  for (const ch of s) {
    const c = ch.codePointAt(0);
    n += (c < 0x80 ? 1 : 2);
  }
  return n;
}

const mapCh = {};
for (const ch of Object.keys(AL.MAP)) for (const f of AL.MAP[ch]) mapCh[f] = ch;

const rows = [];
let over = 0, total = 0;
for (const fname of fs.readdirSync(SRC).filter(f => f.endsWith('.txt'))) {
  const { entries } = AL.parseVl(fs.readFileSync(path.join(OUT, fname), 'utf8'));
  const orig = AL.parseVl(fs.readFileSync(path.join(SRC, fname), 'utf8')).entries;
  entries.forEach((e, i) => {
    const tr = e.trans || '';
    if (!/[\u4e00-\u9fff]/.test(tr)) return;
    const len = parseInt(e.meta.length || '0', 10);
    if (!len) return;
    total++;
    const g = gbkLen(tr);
    if (g > len) {
      over++;
      rows.push({ f: fname, idx: e.meta.index, len, g, over: g - len, en: e.orig, tr });
    }
  });
}
console.log(`有 length 约束的条目 ${total}，其中 GBK 字节超长 ${over} 条 (${(100 * over / total).toFixed(1)}%)`);
rows.sort((a, b) => b.over - a.over);
console.log('\n超长最多 15 条:');
for (const r of rows.slice(0, 15)) {
  console.log(`  ${r.f}#${r.idx} len=${r.len} gbk=${r.g} (+${r.over})`);
  console.log(`     EN: ${r.en.slice(0, 60)}`);
  console.log(`     CN: ${r.tr.slice(0, 60)}`);
}
fs.writeFileSync('overlen.json', JSON.stringify(rows, null, 1), 'utf8');
console.log(`\n全部 ${rows.length} 条 -> overlen.json`);
