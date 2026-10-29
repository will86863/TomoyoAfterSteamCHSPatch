'use strict';
// 回填质量审计：PSP 句子是否与官方条目长度匹配、是否有明显截断/串句
const fs = require('fs');
const path = require('path');
const AL = require('./alignlib.js');
const OUT = process.env.PATCH_OUT || AL.PATCH_DIR; // 默认读仓库 patch/；如需检查 build_patch 的中间产物，设 PATCH_OUT=./out_patch

const mapCh = {};
for (const ch of Object.keys(AL.MAP)) for (const f of AL.MAP[ch]) mapCh[f] = ch;

const allFiles = fs.readdirSync(OUT).filter(f => f.endsWith('.txt')).sort();
const issues = { tooShort: [], tooLong: [], multiSent: [], unchanged: 0, filled: 0, total: 0 };

for (const fname of allFiles) {
  const base = fname.replace('.txt', '');
  const ch = mapCh[base];
  if (!ch) continue;
  const { entries } = AL.parseVl(fs.readFileSync(path.join(OUT, fname), 'utf8'));
  for (const e of entries) {
    allFiles && issues.total++;
    const tr = e.trans || '';
    if (!/[\u4e00-\u9fff]/.test(tr)) { issues.unchanged++; continue; }
    issues.filled++;
    const enW = AL.enWords(e.orig);
    const cnLen = AL.normCN(tr).length;
    const exp = Math.max(2, enW * 1.85);
    const ratio = cnLen / exp;
    if (exp >= 6 && ratio < 0.35) issues.tooShort.push({ f: fname, en: e.orig, tr, enW, cnLen, ratio });
    if (exp >= 6 && ratio > 3.0) issues.tooLong.push({ f: fname, en: e.orig, tr, enW, cnLen, ratio });
    // 一句里塞了多个 PSP 完整句（应已拆分）
    const dots = (tr.match(/[。！？]/g) || []).length;
    if (dots >= 3 && enW <= 8) issues.multiSent.push({ f: fname, en: e.orig, tr, enW, dots });
  }
}

console.log(`扫描 ${issues.total} 条：已填中文 ${issues.filled}，未填 ${issues.unchanged}`);
console.log(`可疑过短 ${issues.tooShort.length} | 可疑过长 ${issues.tooLong.length} | 疑似合并多句 ${issues.multiSent.length}`);

console.log('\n--- 过短样例 ---');
issues.tooShort.slice(0, 8).forEach(x => console.log(`  ${x.f} enW=${x.enW} cn=${x.cnLen} r=${x.ratio.toFixed(2)}\n    EN: ${x.en.slice(0, 70)}\n    CN: ${x.tr}`));
console.log('\n--- 过长样例 ---');
issues.tooLong.slice(0, 8).forEach(x => console.log(`  ${x.f} enW=${x.enW} cn=${x.cnLen} r=${x.ratio.toFixed(2)}\n    EN: ${x.en.slice(0, 70)}\n    CN: ${x.tr.slice(0, 90)}`));
console.log('\n--- 疑似多句合并 ---');
issues.multiSent.slice(0, 8).forEach(x => console.log(`  ${x.f} enW=${x.enW} dots=${x.dots}\n    EN: ${x.en.slice(0, 70)}\n    CN: ${x.tr.slice(0, 90)}`));
