'use strict';
// 缺口分析：把每章「官方有、PSP 无」的段落列出来，判断是文字缺失还是提取问题
const fs = require('fs');
const path = require('path');
const AL = require('./alignlib.js');

const ch = process.argv[2] || '0716';
const V = AL.buildV(AL.MAP[ch]);
const P = AL.loadPSP(ch);
const { pairs, onlyV } = AL.dpAlign(V, P);
const m = new Map(pairs);

let runs = [], cur = null;
for (let a = 0; a < V.length; a++) {
  if (!m.has(a)) { if (!cur) cur = { s: a, e: a }; else cur.e = a; }
  else if (cur) { runs.push(cur); cur = null; }
}
if (cur) runs.push(cur);

console.log(`${ch}: 官方 ${V.length} 条，PSP ${P.length} 句，未配对 ${onlyV.length} 条，分散在 ${runs.length} 段\n`);

// 统计缺口特征
let byLen = { short: 0, normal: 0 };
let symbols = 0, realText = 0;
for (const r of runs) {
  for (let a = r.s; a <= r.e; a++) {
    const v = V[a];
    const t = (v.orig || '').replace(/\\"/g, '"').trim();
    if (!/[A-Za-z\u4e00-\u9fff]/.test(t)) { symbols++; continue; }
    if (v.enW <= 2) byLen.short++; else byLen.normal++;
    realText++;
  }
}
console.log(`缺口构成：纯符号/省略号 ${symbols} 条，≤2词短句 ${byLen.short} 条，正常句 ${byLen.normal} 条`);
console.log(`=> 真正需要翻译的缺口约 ${byLen.normal} 条\n`);

// 列出所有缺口（按大小）
runs.sort((x, y) => (y.e - y.s) - (x.e - x.s));
for (const r of runs) {
  console.log(`--- [${r.s}..${r.e}] ${r.e - r.s + 1} 条 ---`);
  for (let a = r.s; a <= r.e; a++) {
    const v = V[a];
    const t = (v.orig || '').replace(/\\"/g, '"');
    console.log(`  ${v.nm || '旁白'}(${v.enW}w): ${t}`);
  }
}
