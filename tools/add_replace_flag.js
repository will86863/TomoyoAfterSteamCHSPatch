'use strict';
/**
 * 为超长条目插入 replace_flag 控制行
 *
 * v0.0.2 的 InitPatchData：
 *   if (pArray->pointer[j].translated.size > pArray->pointer[j].length) return FALSE;
 * 但只要该条目带 replaceFlag，就改为直接覆盖原始缓冲区，不检查长度。
 *
 * 格式：在 length N 行之后加一行 replace_flag
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

// 按文件分组
const byFile = {};
for (const r of rows) (byFile[r.f] = byFile[r.f] || []).push(r);

let added = 0;
for (const [base, list] of Object.entries(byFile)) {
  const fp = path.join(OUT, base + '.txt');
  if (!fs.existsSync(fp)) continue;
  const { prefix, entries } = AL.parseVl(fs.readFileSync(fp, 'utf8'));
  const idxMap = new Map();
  entries.forEach((e, i) => { if (e.meta.index !== undefined) idxMap.set(String(e.meta.index), i); });

  let n = 0;
  for (const r of list) {
    const i = idxMap.get(String(r.idx));
    if (i === undefined) continue;
    const e = entries[i];
    // 检查 hdr 里是否已有 replace_flag
    if (e.hdr.some(h => h.trim() === 'replace_flag')) continue;
    // 在 length 行后插入
    const pos = e.hdr.findIndex(h => h.startsWith('length '));
    if (pos < 0) continue;
    e.hdr.splice(pos + 1, 0, 'replace_flag');
    n++; added++;
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
  if (n) console.log(`${base}: 加 replace_flag ${n} 条`);
}
console.log(`\n合计 ${added} 条`);
