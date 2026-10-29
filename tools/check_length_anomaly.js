'use strict';
// 检查 length 字段是否异常（过大/过小）
const fs = require('fs');
const path = require('path');
const AL = require('./alignlib.js');

const OUT = process.env.PATCH_OUT || AL.PATCH_DIR; // 默认读仓库 patch/；如需检查 build_patch 的中间产物，设 PATCH_OUT=./out_patch
// 对照基线：默认取 git HEAD 的 patch/（即未改译文的官方版本）。
// 用法：先把工作区的 patch/ 换成你的译文，再运行，即可看出哪些条目的 length 被改过。
const SRC = process.env.PATCH_BASE
  ? path.resolve(process.env.PATCH_BASE)
  : AL.PATCH_DIR;

function gbkLen(s) {
  let n = 0;
  for (const ch of s) n += (ch.codePointAt(0) < 0x80 ? 1 : 2);
  return n;
}

let stats = [];
for (const fname of fs.readdirSync(OUT).filter(f => f.endsWith('.txt')).sort()) {
  const src = AL.parseVl(fs.readFileSync(path.join(SRC, fname), 'utf8')).entries;
  const out = AL.parseVl(fs.readFileSync(path.join(OUT, fname), 'utf8')).entries;
  for (let i = 0; i < out.length; i++) {
    const e = out[i];
    if (e.meta.index === undefined) continue;
    const len = parseInt(e.meta.length || '0', 10);
    const srcLen = src[i] ? parseInt(src[i].meta.length || '0', 10) : 0;
    const tr = (e.trans || '').trim();
    const need = /[\u4e00-\u9fff]/.test(tr) ? gbkLen(tr) : 0;
    if (len !== srcLen) {
      stats.push({ f: fname.replace('.txt', ''), idx: e.meta.index, srcLen, len, need, delta: len - srcLen });
    }
  }
}

console.log(`length 被修改的条目: ${stats.length}`);
if (!stats.length) {
  console.log('（没有差异：SRC 与 OUT 指向同一份文件。若要比对官方基线，'
    + '先用 git show HEAD:patch/xxx.txt 导出到别处，再设 PATCH_BASE=<该目录>。）');
  process.exit(0);
}
const huge = stats.filter(s => s.delta > 100);
const neg = stats.filter(s => s.delta < 0);
console.log(`  增幅 >100 字节: ${huge.length}`);
console.log(`  减小（异常）: ${neg.length}`);

const max = stats.reduce((a, b) => a.delta > b.delta ? a : b, stats[0]);
console.log(`\n最大增幅: ${max.f}#${max.idx} ${max.srcLen} -> ${max.len} (+${max.delta})`);

console.log('\n增幅最大 15 条:');
stats.sort((a, b) => b.delta - a.delta).slice(0, 15).forEach(s => {
  console.log(`  ${s.f}#${s.idx}  ${s.srcLen} -> ${s.len} (+${s.delta})`);
});

// 检查是否存在 length 与译文字节数不匹配的情况
const mismatch = stats.filter(s => s.len !== s.need);
console.log(`\nlength != 译文字节数: ${mismatch.length} 条`);
mismatch.slice(0, 10).forEach(s => console.log(`  ${s.f}#${s.idx} len=${s.len} need=${s.need}`));
