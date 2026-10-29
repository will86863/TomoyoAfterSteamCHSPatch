'use strict';
// 诊断超长原因：区分「JP→CN 正常膨胀」与「对齐错位」
const fs = require('fs');
const path = require('path');
const AL = require('./alignlib.js');

const rows = JSON.parse(fs.readFileSync('overlen_all.json', 'utf8'));

// 分析：超长比例分布
const buckets = { mild: 0, mid: 0, severe: 0 };
for (const r of rows) {
  const ratio = r.g / r.len;
  if (ratio < 1.5) buckets.mild++;
  else if (ratio < 3) buckets.mid++;
  else buckets.severe++;
}
console.log(`超长 ${rows.length} 条:`);
console.log(`  轻度 (<1.5倍) ${buckets.mild}`);
console.log(`  中度 (1.5-3倍) ${buckets.mid}`);
console.log(`  严重 (>3倍，疑似错位) ${buckets.severe}`);

// 严重超长的样例（这些多半是错位）
console.log('\n=== 严重超长（很可能错位）前 15 ===');
rows.filter(r => r.g / r.len >= 3).slice(0, 15).forEach(r => {
  console.log(`${r.f}#${r.idx}  ${r.len}→${r.g} (${(r.g / r.len).toFixed(1)}x)`);
  console.log(`   EN: ${(r.en || '').replace(/\\"/g, '"').slice(0, 65)}`);
  console.log(`   ZH: ${r.tr.slice(0, 65)}`);
});

// 只有轻微膨胀的（这些是正常翻译膨胀）
console.log('\n=== 轻度超长（正常膨胀）前 10 ===');
rows.filter(r => r.g / r.len < 1.5).slice(0, 10).forEach(r => {
  console.log(`${r.f}#${r.idx}  ${r.len}→${r.g}`);
  console.log(`   EN: ${(r.en || '').replace(/\\"/g, '"').slice(0, 65)}`);
  console.log(`   ZH: ${r.tr.slice(0, 65)}`);
});
