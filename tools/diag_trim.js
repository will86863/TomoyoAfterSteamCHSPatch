'use strict';
// 统计超长幅度：判断「精简译文」是否可行
const fs = require('fs');
const path = require('path');
const AL = require('./alignlib.js');

const rows = JSON.parse(fs.readFileSync('overlen_all.json', 'utf8'));

// 按超出字节数分档
const b = { tiny: 0, small: 0, mid: 0, big: 0, huge: 0 };
for (const r of rows) {
  const o = r.g - r.len;
  if (o <= 4) b.tiny++;
  else if (o <= 10) b.small++;
  else if (o <= 25) b.mid++;
  else if (o <= 50) b.big++;
  else b.huge++;
}
console.log(`超长 ${rows.length} 条，超出字节数分布:`);
console.log(`  超 1-4 字节（精简1-2字即可）: ${b.tiny}`);
console.log(`  超 5-10 字节（精简3-5字）: ${b.small}`);
console.log(`  超 11-25 字节（需较大精简）: ${b.mid}`);
console.log(`  超 26-50 字节: ${b.big}`);
console.log(`  超 >50 字节: ${b.huge}`);
console.log(`\n精简 1-5 字可解决的占 ${(100 * (b.tiny + b.small) / rows.length).toFixed(0)}%`);

// 先做可行性评估：如果限制译文字数，需要多少条回退英文
let canTrim = 0, needFallback = 0;
for (const r of rows) {
  // 假设可精简到原长度的 85%（保留语义）
  const targetChars = Math.floor(r.len / 2);
  const curChars = Math.ceil(r.g / 2);
  if (curChars - targetChars <= 5) canTrim++;
  else needFallback++;
}
console.log(`\n若精简 5 字以内可放下: ${canTrim} 条`);
console.log(`需要大改或回退英文: ${needFallback} 条`);
