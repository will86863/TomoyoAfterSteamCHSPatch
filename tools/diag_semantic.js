'use strict';
// 语义级排查：不依赖说话人，直接在 PSP 全文找「意思相近」的句子
const AL = require('./alignlib.js');

// 人工给出的关键词（日→中常见译法）
const probes = [
  { q: 'It smells nice', keys: ['好香', '很香', '香气', '闻起来'], enW: 3, spk: null },
  { q: "I hope trouble isn't on the horizon", keys: ['不要有', '麻烦', '但愿', '希望', '别出事', '风波'], enW: 7, spk: '朋也' },
];

for (const ch of ['0707']) {
  const P = AL.loadPSP(ch);
  console.log(`\n######## PSP ${ch} (${P.length} 句) ########`);
  for (const pr of probes) {
    console.log(`\n=== 搜「${pr.q}」 关键词: ${pr.keys.join('/')} ===`);
    const hits = P.map((p, i) => ({ i, p })).filter(x => pr.keys.some(k => x.p.raw.includes(k)));
    console.log(`  命中 ${hits.length} 条:`);
    for (const h of hits.slice(0, 20)) {
      const exp = pr.enW * 1.85;
      const r = (h.p.n.length + 1.5) / (exp + 1.5);
      const spkOk = !pr.spk || h.p.spk === pr.spk;
      console.log(`   [${h.i}] spk=${h.p.spk || '旁白'}${spkOk ? ' ✓' : ''} len比=${r.toFixed(2)} :: ${h.p.raw}`);
    }
  }
}
