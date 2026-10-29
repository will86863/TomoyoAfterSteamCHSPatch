'use strict';
// 排查：patch 文件里哪些字符无法用 GBK 编码
const fs = require('fs');
const path = require('path');
const AL = require('./alignlib.js');

const OUT = process.env.PATCH_OUT || AL.PATCH_DIR; // 默认读仓库 patch/；如需检查 build_patch 的中间产物，设 PATCH_OUT=./out_patch

// 用 Node 的 TextDecoder 反查 GBK 可编码字符：构建 GBK 码表
// Node 没有 GBK 编码器，用 Windows 的方式：检查字符是否在 GBK 范围内
// 简化：GBK 能表示的字符集 ≈ CJK统汉字 + 常用标点 + 全角字母数字 + 部分符号
function canGbk(ch) {
  const c = ch.codePointAt(0);
  // ASCII
  if (c < 0x80) return true;
  // GBK 区域大致范围
  if (c >= 0x4E00 && c <= 0x9FFF) return true;      // CJK 统一汉字
  if (c >= 0x3000 && c <= 0x303F) return true;      // CJK 标点（部分）
  if (c >= 0xFF01 && c <= 0xFF5E) return true;      // 全角 ASCII
  if (c >= 0xFF61 && c <= 0xFF9F) return true;      // 半角片假名
  if (c >= 0x2000 && c <= 0x206F) return true;      // 常用标点（…—等）
  if (c >= 0x3040 && c <= 0x30FF) return true;      // 日文假名（GBK有部分）
  if (c >= 0x3105 && c <= 0x3129) return true;      // 注音符号
  if (c >= 0xE000 && c <= 0xF8FF) return false;     // 私用区
  // 其他可疑区域
  return false;
}

const bad = new Map();
let files = 0;

for (const fname of fs.readdirSync(OUT).filter(f => f.endsWith('.txt')).sort()) {
  const text = fs.readFileSync(path.join(OUT, fname), 'utf8');
  files++;
  for (const ch of text) {
    if (!canGbk(ch)) {
      const k = ch;
      if (!bad.has(k)) bad.set(k, { cp: ch.codePointAt(0), count: 0, files: new Set() });
      const rec = bad.get(k);
      rec.count++;
      rec.files.add(fname);
    }
  }
}

console.log(`扫描 ${files} 个文件`);
console.log(`非 GBK 字符种类: ${bad.size}`);
const arr = [...bad.entries()].sort((a, b) => b[1].count - a[1].count);
for (const [ch, rec] of arr.slice(0, 40)) {
  console.log(`  U+${rec.cp.toString(16).toUpperCase().padStart(4, '0')} '${ch}' × ${rec.count}  文件: ${[...rec.files].slice(0, 3).join(',')}`);
}
