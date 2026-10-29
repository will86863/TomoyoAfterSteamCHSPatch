'use strict';
/**
 * 完全恢复：把 length 恢复成官方原值，并确保没有 replace_flag
 * 因为 v0.0.2 只有在 replaceFlag 时才检查超长；普通条目超长完全 OK。
 */
const fs = require('fs');
const path = require('path');
const AL = require('./alignlib.js');

const OUT = process.env.PATCH_OUT || AL.PATCH_DIR; // 默认读仓库 patch/；如需检查 build_patch 的中间产物，设 PATCH_OUT=./out_patch
const SRC = AL.PATCH_DIR;

let lenFixed = 0, flagRemoved = 0;

for (const fname of fs.readdirSync(OUT).filter(f => f.endsWith('.txt')).sort()) {
  const fp = path.join(OUT, fname);
  const srcParsed = AL.parseVl(fs.readFileSync(path.join(SRC, fname), 'utf8'));
  const { prefix, entries } = AL.parseVl(fs.readFileSync(fp, 'utf8'));

  // 用 src 的 length 映射
  const srcLenMap = new Map();
  srcParsed.entries.forEach((e, i) => {
    if (e.meta.length !== undefined) srcLenMap.set(i, e.meta.length);
  });

  let changed = 0;
  for (let i = 0; i < entries.length; i++) {
    const e = entries[i];
    // 1. 移除 replace_flag
    const fi = e.hdr.findIndex(h => h.trim() === 'replace_flag');
    if (fi >= 0) { e.hdr.splice(fi, 1); flagRemoved++; changed++; }

    // 2. 恢复 length
    const origLen = srcLenMap.get(i);
    if (origLen !== undefined) {
      const pos = e.hdr.findIndex(h => h.startsWith('length '));
      if (pos >= 0 && e.hdr[pos] !== 'length ' + origLen) {
        e.hdr[pos] = 'length ' + origLen;
        e.meta.length = String(origLen);
        lenFixed++; changed++;
      }
    }
  }

  if (changed) {
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
}

console.log(`恢复 length ${lenFixed} 处，移除 replace_flag ${flagRemoved} 处`);
