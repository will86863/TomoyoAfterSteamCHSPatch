'use strict';
/**
 * 完整重建 out_patch：
 *   1. 用 map_merged.json 生成 PSP 回填部分
 *   2. 依次应用所有手工翻译表（会覆盖对应条目）
 *   3. 最后修正 length 字段
 */
const fs = require('fs');
const path = require('path');
const AL = require('./alignlib.js');

const OUT = process.env.PATCH_OUT || AL.PATCH_DIR; // 默认读仓库 patch/；如需检查 build_patch 的中间产物，设 PATCH_OUT=./out_patch
const SRC = AL.PATCH_DIR;

// ---- 模板/规则类翻译（需要重新跑脚本）----
// 这里只重建 PSP 部分 + 手工表；模板类（7820/7160/7810等）单独处理

const INLINE_RE = /^(朋也|智代|鹰文|河南子|小智|有子|管理员|小川|直幸|师傅|村人|老人|少女|女子|女性|男|医生)\s*(?=[（(「『])/;
const stripName = (s) => (s || '').trim().replace(INLINE_RE, '');
const MARKER_RE = /^(BAD END|GAME OVER|TO BE CONTINUED|Ending|Epilogue|Prologue|Title|Menu|Save|Load|OK|Cancel|Yes|No|Back|Next)$/i;
const isMarker = (s) => MARKER_RE.test((s || '').replace(/\\"/g, '"').trim());

function renderStrict(prefix, entries) {
  let text = prefix;
  for (const e of entries) {
    text += '\n====================\n' + e.hdr.join('\n') + '\n';
    text += '====================\n' + e.orig + '\n';
    text += '====================\n';
    if (e.trans !== null && e.trans !== undefined) text += e.trans + '\n';
    text += '====================\n';
  }
  return text;
}

// 1) 用 map_merged 重建 PSP 部分
const map = JSON.parse(fs.readFileSync(path.join(__dirname, 'maps', 'map_merged.json'), 'utf8'));
const fileToCh = {};
for (const ch of Object.keys(AL.MAP)) for (const f of AL.MAP[ch]) fileToCh[f] = ch;

fs.mkdirSync(OUT, { recursive: true });
const allFiles = fs.readdirSync(SRC).filter(f => f.endsWith('.txt')).sort();

for (const fname of allFiles) {
  const base = fname.replace('.txt', '');
  const { prefix, entries } = AL.parseVl(fs.readFileSync(path.join(SRC, fname), 'utf8'));
  const ch = fileToCh[base];
  const mp = ch && map[ch] ? map[ch][base] : null;
  const outEntries = entries.map((e, i) => {
    let t = e.trans;
    if (mp && mp[i] !== undefined && !isMarker(e.orig)) t = stripName(mp[i]);
    return { hdr: e.hdr, orig: e.orig, trans: t };
  });
  fs.writeFileSync(path.join(OUT, fname), renderStrict(prefix, outEntries), 'utf8');
}
console.log('步骤1: PSP 回填重建完成');

// 2) 应用所有手工翻译表
const tables = fs.readdirSync('.').filter(f => /^manual_.*\.json$/.test(f)).sort();
const table = {};
for (const f of tables) {
  try {
    const j = JSON.parse(fs.readFileSync(f, 'utf8'));
    for (const [base, kv] of Object.entries(j)) {
      if (base === '说明') continue;
      table[base] = table[base] || {};
      Object.assign(table[base], kv);
    }
  } catch (e) { console.error('读表失败 ' + f + ': ' + e.message); }
}

let applied = 0;
for (const [base, kv] of Object.entries(table)) {
  const fp = path.join(OUT, base + '.txt');
  if (!fs.existsSync(fp)) continue;
  const { prefix, entries } = AL.parseVl(fs.readFileSync(fp, 'utf8'));
  const idxMap = new Map();
  entries.forEach((e, i) => { if (e.meta.index !== undefined) idxMap.set(String(e.meta.index), i); });
  let n = 0;
  for (const [k, v] of Object.entries(kv)) {
    const i = idxMap.get(String(k));
    if (i === undefined) continue;
    entries[i].trans = v;
    n++; applied++;
  }
  fs.writeFileSync(fp, renderStrict(prefix, entries), 'utf8');
}
console.log(`步骤2: 应用 ${applied} 条手工翻译（${tables.length} 个表）`);
