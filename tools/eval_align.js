'use strict';
// 对齐质量诊断：对已有中文译文的章节，用「真实译文」检验配对是否正确
const AL = require('./alignlib.js');

const ch = process.argv[2] || '0628';
const files = AL.MAP[ch];
const V = AL.buildV(files);
const P = AL.loadPSP(ch);

const t0 = Date.now();
const { pairs, onlyV, onlyP } = AL.dpAlign(V, P);
const dt = Date.now() - t0;

// 指标
let spkOk = 0, spkBad = 0;
const sims = [];
const rows = [];
for (const [a, b] of pairs) {
  const v = V[a], p = P[b];
  const s = v.g.size ? AL.dice(v.g, p.g) : -1;
  if (s >= 0) sims.push(s);
  const mp = p.spk ? AL.SPK2NAME[p.spk] : null;
  if (v.nm && mp) { if (AL.normName(mp) === AL.normName(v.nm)) spkOk++; else spkBad++; }
  rows.push({ a, b, s, v, p });
}
const sorted = [...sims].sort((x, y) => x - y);
const q = (x) => sorted.length ? sorted[Math.floor(x * (sorted.length - 1))].toFixed(3) : '-';

console.log(`${ch}: V=${V.length} P=${P.length} 配对=${pairs.length} 仅V=${onlyV.length} 仅P=${onlyP.length} 用时=${dt}ms`);
console.log(`  有中文可比的配对 ${sims.length} 条，相似度 中位=${q(0.5)} p10=${q(0.1)} p25=${q(0.25)} p75=${q(0.75)}`);
console.log(`  相似度分布: >=0.5:${sims.filter(s => s >= 0.5).length} 0.3-0.5:${sims.filter(s => s >= 0.3 && s < 0.5).length} 0.15-0.3:${sims.filter(s => s >= 0.15 && s < 0.3).length} <0.15:${sims.filter(s => s < 0.15).length}`);
console.log(`  说话人一致 ${spkOk} / 冲突 ${spkBad}`);

// 长度合理性：PSP 中文字数 vs 英文字数*1.9
let lenOk = 0, lenBad = 0;
for (const r of rows) {
  const exp = r.v.enW * 1.9;
  if (exp < 4) continue;
  const ratio = r.p.n.length / exp;
  if (ratio > 0.45 && ratio < 2.2) lenOk++; else lenBad++;
}
console.log(`  长度合理性 通过 ${lenOk} / 异常 ${lenBad}`);

const show = parseInt(process.argv[3] || '15', 10);
console.log(`\n--- 抽样 ${show} 对 ---`);
for (let k = 0; k < Math.min(show, rows.length); k++) {
  const r = rows[k];
  console.log(`[${r.v.file}#${r.v.i}] ${r.v.nm || '旁白'}(w=${r.v.enW}) s=${r.s < 0 ? 'NA' : r.s.toFixed(2)}`);
  console.log(`  官方英: ${r.v.orig}`);
  console.log(`  官方中: ${r.v.cn || '(未译)'}`);
  console.log(`  PSP   : ${r.p.raw}  [spk=${r.p.spk || '旁白'}]`);
}
