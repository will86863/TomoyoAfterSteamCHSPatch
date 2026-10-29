'use strict';
// 结构完整性校验：out_patch vs 原始 patch，除译文块外必须逐字节一致
const fs = require('fs');
const path = require('path');
const AL = require('./alignlib.js');

const SRC = AL.PATCH_DIR;
const OUT = process.env.PATCH_OUT || AL.PATCH_DIR; // 默认读仓库 patch/；如需检查 build_patch 的中间产物，设 PATCH_OUT=./out_patch

const files = fs.readdirSync(SRC).filter(f => f.endsWith('.txt')).sort();
let ok = 0, bad = [];

for (const f of files) {
  const a = fs.readFileSync(path.join(SRC, f), 'utf8');
  const b = fs.readFileSync(path.join(OUT, f), 'utf8');

  // 归一化换行后逐块比对
  const norm = (s) => s.replace(/\r\n/g, '\n');
  const A = norm(a), B = norm(b);

  // 提取「非译文」部分：把第 3 块（译文）抹掉后比较
  const stripTrans = (text) => {
    const { prefix, entries } = AL.parseVl(text);
    let out = prefix;
    for (const e of entries) {
      out += '|HDR|';
      if (e.meta.index !== undefined) out += 'index ' + e.meta.index + ';';
      if (e.meta.offset !== undefined) out += 'offset ' + e.meta.offset + ';';
      if (e.meta.name !== undefined) out += 'name ' + e.meta.name + ';';
      if (e.meta.length !== undefined) out += 'length ' + e.meta.length + ';';
      out += '|ORIG|' + e.orig + '|END|\n';
    }
    return out;
  };

  const sa = stripTrans(A), sb = stripTrans(B);
  if (sa === sb) ok++;
  else {
    // 找第一个差异
    let i = 0;
    while (i < Math.min(sa.length, sb.length) && sa[i] === sb[i]) i++;
    bad.push({ f, at: i, a: sa.slice(Math.max(0, i - 60), i + 60), b: sb.slice(Math.max(0, i - 60), i + 60) });
  }
}

console.log(`结构校验：${ok}/${files.length} 文件除译文块外完全一致`);
if (bad.length) {
  console.log(`\n不一致 ${bad.length} 个：`);
  for (const x of bad.slice(0, 5)) {
    console.log(`\n--- ${x.f} @${x.at} ---`);
    console.log(`原: ${JSON.stringify(x.a)}`);
    console.log(`新: ${JSON.stringify(x.b)}`);
  }
}
