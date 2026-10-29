'use strict';
/**
 * 逐句核验：对每个已映射条目，检查「PSP 译文长度 vs 英文词数」是否合理，
 * 并检查「同一 PSP 句是否被多个条目重复使用」（重复=错位信号）
 */
const fs = require('fs');
const path = require('path');
const AL = require('./alignlib.js');

const OUT = process.env.PATCH_OUT || AL.PATCH_DIR; // 默认读仓库 patch/；如需检查 build_patch 的中间产物，设 PATCH_OUT=./out_patch
const SRC = AL.PATCH_DIR;

const fileToCh = {};
for (const ch of Object.keys(AL.MAP)) for (const f of AL.MAP[ch]) fileToCh[f] = ch;

let total = 0, ok = 0, lenBad = 0, unresolved = 0;
const dupText = {};
const badSamples = [];

for (const fname of fs.readdirSync(SRC).filter(f => f.endsWith('.txt')).sort()) {
  const base = fname.replace('.txt', '');
  const ch = fileToCh[base];
  if (!ch) continue;
  const { entries } = AL.parseVl(fs.readFileSync(path.join(OUT, fname), 'utf8'));
  const seen = new Map();
  for (const e of entries) {
    if (e.meta.index === undefined) continue;
    total++;
    const tr = (e.trans || '').trim();
    if (!/[\u4e00-\u9fff]/.test(tr)) { unresolved++; continue; }
    const enW = AL.enWords(e.orig);
    const cnLen = AL.normCN(tr).length;
    const exp = Math.max(2, enW * 1.85);
    const r = cnLen / exp;
    // 重复检测
    if (seen.has(tr)) {
      if (!dupText[base]) dupText[base] = [];
      dupText[base].push({ idx: e.meta.index, tr: tr.slice(0, 40) });
    } else seen.set(tr, e.meta.index);

    if (r > 0.4 && r < 2.4) ok++;
    else {
      lenBad++;
      if (badSamples.length < 20) badSamples.push({ f: base, idx: e.meta.index, enW, cnLen, r, en: e.orig, tr });
    }
  }
}

console.log(`总条目 ${total}: 已译 ${total - unresolved} | 未译 ${unresolved}`);
console.log(`长度合理 ${ok} | 长度异常 ${lenBad} (${(100 * ok / (ok + lenBad)).toFixed(1)}%)`);

console.log('\n=== 同文件内重复译文（错位信号）===');
let dupTotal = 0;
for (const [f, list] of Object.entries(dupText)) {
  dupTotal += list.length;
  if (list.length <= 3) console.log(`  ${f}: ${list.length} 处  ${list.map(x => x.tr).join(' | ')}`);
  else console.log(`  ${f}: ${list.length} 处`);
}
console.log(`合计重复 ${dupTotal} 处`);

console.log('\n=== 长度异常样例 ===');
for (const x of badSamples.slice(0, 12)) {
  console.log(`  ${x.f}#${x.idx} enW=${x.enW} cn=${x.cnLen} r=${x.r.toFixed(2)}`);
  console.log(`    EN : ${(x.en || '').replace(/\\"/g, '"').slice(0, 60)}`);
  console.log(`    TR : ${x.tr.slice(0, 60)}`);
}
