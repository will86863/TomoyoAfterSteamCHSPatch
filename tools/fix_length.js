'use strict';
/**
 * 修正 length 字段：把 length 改成译文的 GBK 字节数
 *
 * 依据：
 *   - length 原本 = 英文原文字节数（实测确认）
 *   - v0.0.2 有 `translated.size > length → return FALSE`
 *   - length 只传给 CharacterInfo.length，不参与显示裁剪
 *   → 所以只要把 length 改成译文实际字节数，就能正常加载且完整显示
 */
const fs = require('fs');
const path = require('path');
const AL = require('./alignlib.js');

const OUT = process.env.PATCH_OUT || AL.PATCH_DIR; // 默认读仓库 patch/；如需检查 build_patch 的中间产物，设 PATCH_OUT=./out_patch

function gbkLen(s) {
  let n = 0;
  for (const ch of s) n += (ch.codePointAt(0) < 0x80 ? 1 : 2);
  return n;
}

let fixed = 0;
let skipped = 0;

for (const fname of fs.readdirSync(OUT).filter(f => f.endsWith('.txt')).sort()) {
  const fp = path.join(OUT, fname);
  const { prefix, entries } = AL.parseVl(fs.readFileSync(fp, 'utf8'));
  let n = 0;

  for (const e of entries) {
    if (e.meta.index === undefined) continue;
    const tr = (e.trans || '').trim();
    if (!/[\u4e00-\u9fff]/.test(tr)) continue;
    const oldLen = parseInt(e.meta.length || '0', 10);
    if (!oldLen) continue;
    const need = gbkLen(tr);
    if (need <= oldLen) continue;   // 不超长，保持原样

    // 找到 length 行并替换
    const pos = e.hdr.findIndex(h => h.startsWith('length '));
    if (pos < 0) { skipped++; continue; }
    e.hdr[pos] = 'length ' + need;
    e.meta.length = String(need);
    n++; fixed++;
  }

  if (n > 0) {
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

console.log(`修正 length ${fixed} 条，跳过 ${skipped} 条`);
