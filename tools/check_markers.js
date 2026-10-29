'use strict';
// 找出「标记类」条目被错误填充的情况
const fs = require('fs');
const path = require('path');
const AL = require('./alignlib.js');
const OUT = process.env.PATCH_OUT || AL.PATCH_DIR; // 默认读仓库 patch/；如需检查 build_patch 的中间产物，设 PATCH_OUT=./out_patch
const SRC = path.join(__dirname, '..', 'patch');

const mapCh = {};
for (const ch of Object.keys(AL.MAP)) for (const f of AL.MAP[ch]) mapCh[f] = 1;

const CJK = /[\u4e00-\u9fff]/;
let cnt = 0;
const list = [];

for (const fn of fs.readdirSync(SRC).filter(f => f.endsWith('.txt'))) {
  if (!mapCh[fn.replace('.txt', '')]) continue;
  const { entries } = AL.parseVl(fs.readFileSync(path.join(OUT, fn), 'utf8'));
  for (const e of entries) {
    const en = (e.orig || '').replace(/\\"/g, '"').trim();
    const tr = (e.trans || '').trim();
    if (!CJK.test(tr)) continue;

    // 标记类判定：全大写缩写、*音效*、或极短陈述（无引号）
    const isAllCap = /^[A-Z][A-Z0-9 &!'.,\-]*$/.test(en) && en.length >= 3;
    const isSound = /^\*.*\*$/.test(en);
    const isTiny = AL.enWords(en) <= 2 && !/["'!?]/.test(en) && en.length <= 14;
    if (isAllCap || isSound || isTiny) {
      cnt++;
      if (list.length < 40) list.push({ f: fn, idx: e.meta.index, en, tr, kind: isAllCap ? '全大写' : isSound ? '音效' : '极短' });
    }
  }
}

console.log(`标记类条目被填充: ${cnt} 条`);
for (const x of list) {
  console.log(`  [${x.kind}] ${x.f}#${x.idx}`);
  console.log(`      EN: ${x.en}`);
  console.log(`      CN: ${x.tr}`);
}
