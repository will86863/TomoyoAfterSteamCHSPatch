'use strict';
/**
 * 智能精简：把超长译文压到 length 的 GBK 字节预算内
 *
 * 策略（保留语义优先）：
 *   1. 删「呢/啊/哦/呀/嘛/啦/吧/哟」等语气词
 *   2. 删重复的「、」前的冗余词
 *   3. 缩写常见词（非常→很、因为→因、自己→己…）
 *   4. 仍超长则截断并加…
 */
const fs = require('fs');
const path = require('path');
const AL = require('./alignlib.js');

const OUT = process.env.PATCH_OUT || AL.PATCH_DIR; // 默认读仓库 patch/；如需检查 build_patch 的中间产物，设 PATCH_OUT=./out_patch
const rows = JSON.parse(fs.readFileSync('overlen_all.json', 'utf8'));

function gbkLen(s) {
  let n = 0;
  for (const ch of s) n += (ch.codePointAt(0) < 0x80 ? 1 : 2);
  return n;
}

// 可安全删除的语气词（句尾更安全）
const PARTICLES = ['呢', '啊', '哦', '呀', '嘛', '啦', '吧', '哟', '喔', '噢', '唉', '唔'];
// 常见缩写
const ABBR = [
  ['非常', '很'], ['因为', '因'], ['所以', '故'], ['但是', '但'], ['然后', '后'],
  ['这个', '这'], ['那个', '那'], ['自己', '己'], ['什么', '啥'], ['已经', '已'],
  ['现在', '现'], ['时候', '时'], ['可以', '可'], ['如果', '若'], ['还是', '仍'],
  ['虽然', '虽'], ['而且', '且'], ['并且', '并'], ['不过', '但'], ['只是', '只'],
  ['真的', '真'], ['好像', '似'], ['应该', '应'], ['当然', '自'], ['一定', '必'],
  ['所有', '全'], ['全部', '全'], ['非常', '很'], ['十分', '很'], ['特别', '很'],
  ['一起', '同'], ['互相', '互'], ['立刻', '即'], ['马上', '即'], ['终于', '终'],
];

function trimTo(tr, budget) {
  let s = tr;
  if (gbkLen(s) <= budget) return s;

  // 1. 删句尾语气词
  let guard = 0;
  while (gbkLen(s) > budget && guard++ < 40) {
    const last = s.slice(-1);
    if (PARTICLES.includes(last)) { s = s.slice(0, -1); continue; }
    const last2 = s.slice(-2, -1);
    if (PARTICLES.includes(last2) && s.endsWith('…')) { s = s.slice(0, -2) + '…'; continue; }
    break;
  }

  // 2. 删中间的「啊/呢/哦」等（保留句首）
  if (gbkLen(s) > budget) {
    for (const p of PARTICLES) {
      let idx = s.indexOf(p, 1);
      while (idx > 0 && gbkLen(s) > budget) {
        s = s.slice(0, idx) + s.slice(idx + 1);
        idx = s.indexOf(p, 1);
      }
      if (gbkLen(s) <= budget) break;
    }
  }

  // 3. 缩写
  if (gbkLen(s) > budget) {
    for (const [long, short] of ABBR) {
      while (s.includes(long) && gbkLen(s) > budget) {
        s = s.replace(long, short);
      }
      if (gbkLen(s) <= budget) break;
    }
  }

  // 4. 删掉重复的标点/顿号
  if (gbkLen(s) > budget) {
    s = s.replace(/、+/g, '、').replace(/。+/g, '。').replace(/…+/g, '…');
  }

  // 5. 仍然超长 → 截断
  if (gbkLen(s) > budget) {
    let out = '';
    for (const ch of s) {
      if (gbkLen(out + ch) > budget - 2) break;
      out += ch;
    }
    s = out.replace(/[、，。]$/, '') + '…';
  }
  return s;
}

// 按文件处理
const byFile = {};
for (const r of rows) (byFile[r.f] = byFile[r.f] || []).push(r);

let okTrim = 0, stillOver = 0;
const failed = [];

for (const [base, list] of Object.entries(byFile)) {
  const fp = path.join(OUT, base + '.txt');
  if (!fs.existsSync(fp)) continue;
  const { prefix, entries } = AL.parseVl(fs.readFileSync(fp, 'utf8'));
  const idxMap = new Map();
  entries.forEach((e, i) => { if (e.meta.index !== undefined) idxMap.set(String(e.meta.index), i); });

  for (const r of list) {
    const i = idxMap.get(String(r.idx));
    if (i === undefined) continue;
    const e = entries[i];
    const budget = parseInt(e.meta.length || '0', 10);
    if (!budget) continue;
    const before = e.trans;
    const after = trimTo(before, budget);
    if (gbkLen(after) <= budget) { e.trans = after; okTrim++; }
    else { stillOver++; if (failed.length < 20) failed.push({ f: base, idx: r.idx, before, after }); }
  }

  let text = prefix;
  for (const e of entries) {
    text += '\n====================\n' + e.hdr.join('\n') + '\n';
    text += '====================\n' + e.orig + '\n';
    text += '====================\n';
    if (e.trans !== null && e.trans !== undefined) text += e.trans + '\n';
    text += '====================\n';
  }
  fs.writeFileSync(fp, text, 'utf8');
}

console.log(`精简成功 ${okTrim} 条，仍超长 ${stillOver} 条`);
if (failed.length) {
  console.log('\n仍超长样例:');
  failed.forEach(f => console.log(`  ${f.f}#${f.idx}\n    前: ${f.before.slice(0, 55)}\n    后: ${f.after.slice(0, 55)}`));
}
