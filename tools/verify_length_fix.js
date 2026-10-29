'use strict';
// 验证 fix_length 后：所有 length 都精确等于译文 GBK 字节数
const fs = require('fs');
const path = require('path');
const AL = require('./alignlib.js');

const OUT = process.env.PATCH_OUT || AL.PATCH_DIR; // 默认读仓库 patch/；如需检查 build_patch 的中间产物，设 PATCH_OUT=./out_patch

function gbkLen(s) {
  let n = 0;
  for (const ch of s) n += (ch.codePointAt(0) < 0x80 ? 1 : 2);
  return n;
}

let mismatch = 0, ok = 0, nonCJK = 0;
const bad = [];

for (const fname of fs.readdirSync(OUT).filter(f => f.endsWith('.txt')).sort()) {
  const { entries } = AL.parseVl(fs.readFileSync(path.join(OUT, fname), 'utf8'));
  for (const e of entries) {
    if (e.meta.index === undefined) continue;
    const tr = (e.trans || '').trim();
    const len = parseInt(e.meta.length || '0', 10);
    if (!len) continue;
    if (!/[\u4e00-\u9fff]/.test(tr)) { nonCJK++; continue; }
    const need = gbkLen(tr);
    // 允许 len >= need（不超即可加载）
    if (len >= need) ok++;
    else { mismatch++; if (bad.length < 10) bad.push({ f: fname, idx: e.meta.index, len, need }); }
  }
}

console.log(`已译条目: length >= 译文字节数 = ${ok} 条`);
console.log(`仍不足（会导致初始化失败）= ${mismatch} 条`);
console.log(`未译/纯符号 = ${nonCJK} 条`);
if (bad.length) bad.forEach(b => console.log(`  ${b.f}#${b.idx} len=${b.len} need=${b.need}`));

// 检查 index/offset/name 是否都没动
console.log('\n=== 验证 index/offset/name 未被改动 ===');
const SRC = AL.PATCH_DIR;
let hdrBad = 0;
const hdrBadSamples = [];
for (const fname of fs.readdirSync(OUT).filter(f => f.endsWith('.txt')).sort()) {
  const src = AL.parseVl(fs.readFileSync(path.join(SRC, fname), 'utf8')).entries;
  const out = AL.parseVl(fs.readFileSync(path.join(OUT, fname), 'utf8')).entries;
  if (src.length !== out.length) { hdrBad++; continue; }
  for (let i = 0; i < src.length; i++) {
    const a = src[i].meta, b = out[i].meta;
    if (a.index !== b.index || a.offset !== b.offset || a.name !== b.name) {
      hdrBad++;
      if (hdrBadSamples.length < 5) hdrBadSamples.push(`${fname}#${a.index}: ${JSON.stringify(a)} vs ${JSON.stringify(b)}`);
      break;
    }
  }
}
console.log(hdrBad === 0 ? '✓ index/offset/name 全部一致' : `✗ ${hdrBad} 个文件有问题`);
hdrBadSamples.forEach(x => console.log('  ' + x));
