'use strict';
// 全章节缺口统计
const AL = require('./alignlib.js');

const rows = [];
let T = { V: 0, P: 0, pair: 0, gapReal: 0, gapSym: 0, gapShort: 0 };
for (const ch of Object.keys(AL.MAP)) {
  const V = AL.buildV(AL.MAP[ch]);
  const P = AL.loadPSP(ch);
  const { pairs, onlyV } = AL.dpAlign(V, P);
  const m = new Map(pairs);
  let sym = 0, short = 0, real = 0;
  for (let a = 0; a < V.length; a++) {
    if (m.has(a)) continue;
    const v = V[a];
    const t = (v.orig || '').replace(/\\"/g, '"').trim();
    if (!/[A-Za-z\u4e00-\u9fff]/.test(t)) sym++;
    else if (v.enW <= 2) short++;
    else real++;
  }
  rows.push({ ch, V: V.length, P: P.length, pair: pairs.length, sym, short, real });
  T.V += V.length; T.P += P.length; T.pair += pairs.length;
  T.gapSym += sym; T.gapShort += short; T.gapReal += real;
}
console.log('章    官方   PSP   配对   缺口(符号/短/正句)');
for (const r of rows) {
  console.log(`${r.ch}  ${String(r.V).padStart(5)} ${String(r.P).padStart(5)} ${String(r.pair).padStart(6)}   ${r.sym}/${r.short}/${r.real}`);
}
console.log(`\n合计: 官方 ${T.V} | PSP ${T.P} | 配对 ${T.pair}`);
console.log(`缺口: 纯符号 ${T.gapSym} + 短句 ${T.gapShort} + 正常句 ${T.gapReal} = ${T.gapSym + T.gapShort + T.gapReal}`);
