'use strict';
// 诊断具体漏翻句：在 PSP 全文中查找对应译文
const fs = require('fs');
const path = require('path');
const AL = require('./alignlib.js');

const queries = [
  { file: 'seen0707', idx: 290, en: 'It smells nice.', spk: 'Young girl' },
  { file: 'seen0707', idx: 657, en: "I hope trouble isn't on the horizon...", spk: 'Tomoya' },
];

const ch = '0707';
const P = AL.loadPSP(ch);
console.log(`PSP 0707 章共 ${P.length} 句\n`);

for (const q of queries) {
  console.log(`=== ${q.file}#${q.idx} [${q.spk}] "${q.en}" ===`);
  // 1) 找说话人匹配的句子
  const spkKey = q.spk === 'Tomoya' ? '朋也' : q.spk === 'Young girl' ? '少女' : null;
  const cands = P.map((p, i) => ({ i, p })).filter(x => x.p.spk === spkKey);
  console.log(`  PSP 中说话人为「${spkKey}」的句子 ${cands.length} 条`);
  // 2) 按长度筛（英文词数*1.85）
  const enW = AL.enWords(q.en);
  const exp = enW * 1.85;
  const byLen = cands.filter(x => {
    const r = (x.p.n.length + 1.5) / (exp + 1.5);
    return r > 0.4 && r < 2.4;
  });
  console.log(`  其中长度合理(${exp.toFixed(1)}字左右)的 ${byLen.length} 条:`);
  byLen.slice(0, 10).forEach(x => console.log(`     [${x.i}] ${x.p.raw}`));
  if (!byLen.length) console.log('     (无)');
  console.log('');
}
