'use strict';
// 找出译文里「说话人名（...）」这种把角色名嵌进正文的情况
// 官方格式里 name 字段已单独显示角色名，正文不该再带
const fs = require('fs');
const path = require('path');
const AL = require('./alignlib.js');
const OUT = process.env.PATCH_OUT || AL.PATCH_DIR; // 默认读仓库 patch/；如需检查 build_patch 的中间产物，设 PATCH_OUT=./out_patch

const KNOWN = ['朋也', '智代', '鹰文', '河南子', '小智', '有子', '管理员', '小川', '直幸', '师傅'];

let cnt = 0;
const list = [];
for (const fn of fs.readdirSync(OUT).filter(f => f.endsWith('.txt'))) {
  const { entries } = AL.parseVl(fs.readFileSync(path.join(OUT, fn), 'utf8'));
  for (const e of entries) {
    const tr = (e.trans || '').trim();
    if (!/[\u4e00-\u9fff]/.test(tr)) continue;
    for (const k of KNOWN) {
      // 形如 朋也（...） 或 朋也「...」
      const re = new RegExp('^' + k + '\\s*[（(「]');
      if (re.test(tr)) {
        cnt++;
        if (list.length < 30) list.push({ f: fn, idx: e.meta.index, name: e.meta.name, tr, k });
        break;
      }
    }
  }
}
console.log(`译文开头带角色名的条目: ${cnt} 条`);
for (const x of list) {
  console.log(`  ${x.f}#${x.idx} name=${x.name}`);
  console.log(`     ${x.tr}`);
}
