'use strict';
/**
 * 对齐 v3：按「文件」为单位独立对齐
 * 理由：整章合并时大文件会抢占 PSP 句，导致小分支文件（18xx/28xx/38xx/48xx）整段失配。
 * 做法：
 *   1. 每个文件独立与所属章的全部 PSP 句做 DP 对齐，得到候选配对
 *   2. 以「置信分」做全局互斥分配（一个 PSP 句只归一个条目）
 *   3. 写回官方格式，只改译文块
 */
const fs = require('fs');
const path = require('path');
const AL = require('./alignlib.js');

const OUT = process.env.PATCH_OUT || AL.PATCH_DIR; // 默认读仓库 patch/；如需检查 build_patch 的中间产物，设 PATCH_OUT=./out_patch
const SRC = AL.PATCH_DIR;

// ---------------- 工具 ----------------
const INLINE_RE = /^(朋也|智代|鹰文|河南子|小智|有子|管理员|小川|直幸|师傅|村人|老人|少女|女子|女性|男|医生)\s*(?=[（(「『])/;
function stripName(s) { return (s || '').trim().replace(INLINE_RE, ''); }

const MARKER_RE = /^(BAD END|GAME OVER|TO BE CONTINUED|Ending|Epilogue|Prologue|Title|Menu|Save|Load|OK|Cancel|Yes|No|Back|Next)$/i;
function isMarker(s) {
  const t = (s || '').replace(/\\"/g, '"').trim();
  return MARKER_RE.test(t);
}

function renderStrict(prefix, entries) {
  let out = prefix;
  for (const e of entries) {
    out += '\n====================\n';
    out += e.hdr.join('\n') + '\n';
    out += '====================\n';
    out += e.orig + '\n';
    out += '====================\n';
    if (e.trans !== null && e.trans !== undefined) out += e.trans + '\n';
    out += '====================\n';
  }
  return out;
}

// ---------------- 文件 → 章 ----------------
const fileToCh = {};
for (const ch of Object.keys(AL.MAP)) for (const f of AL.MAP[ch]) fileToCh[f] = ch;

// ---------------- 逐章处理 ----------------
const result = {};
const stats = [];
const THRESHOLD = 2;

for (const ch of Object.keys(AL.MAP)) {
  const P = AL.loadPSP(ch);
  const files = AL.MAP[ch];
  const claims = [];

  for (const f of files) {
    const V = AL.buildV([f]);
    if (!V.length) continue;
    const { pairs } = AL.dpAlign(V, P);
    for (const [a, b] of pairs) {
      const v = V[a], p = P[b];
      const se = AL.spkEquiv(v.nm, p.spk);
      const exp = Math.max(2, v.enW * 1.85);
      const lr = (p.n.length + 1.5) / (exp + 1.5);

      let score = 0;
      if (se === 'ok') score += 3;
      else if (se === 'unknown') score += 1.5;
      else if (se === 'weak') score += 1.0;
      else score -= 4;

      if (lr > 0.5 && lr < 2.0) score += 2;
      else if (lr > 0.4 && lr < 2.4) score += 0.8;
      else score -= 1.5;

      if (isMarker(v.orig)) score -= 10;

      claims.push({ f, i: v.i, b, score });
    }
  }

  claims.sort((x, y) => y.score - x.score);
  const usedP = new Set();
  const usedV = new Set();
  result[ch] = {};
  for (const f of files) result[ch][f] = new Map();

  let adopted = 0;
  for (const c of claims) {
    if (c.score < THRESHOLD) continue;
    const vkey = c.f + '#' + c.i;
    if (usedP.has(c.b) || usedV.has(vkey)) continue;
    usedP.add(c.b);
    usedV.add(vkey);
    result[ch][c.f].set(c.i, { psp: P[c.b].raw, spk: P[c.b].spk });
    adopted++;
  }
  stats.push({ ch, P: P.length, claims: claims.length, adopted });
}

console.log('按文件独立对齐（门槛 ' + THRESHOLD + '）：');
let tot = 0;
for (const s of stats) {
  console.log(`  ${s.ch}: PSP=${String(s.P).padStart(5)} 候选=${String(s.claims).padStart(5)} 采用=${String(s.adopted).padStart(5)}`);
  tot += s.adopted;
}
console.log(`合计采用 ${tot} 条`);

// ---------------- 写回 ----------------
fs.mkdirSync(OUT, { recursive: true });
const allFiles = fs.readdirSync(SRC).filter(f => f.endsWith('.txt')).sort();
let filled = 0, changed = 0;

for (const fname of allFiles) {
  const base = fname.replace('.txt', '');
  const { prefix, entries } = AL.parseVl(fs.readFileSync(path.join(SRC, fname), 'utf8'));
  const ch = fileToCh[base];
  const mp = ch && result[ch] ? result[ch][base] : null;

  let n = 0;
  const outEntries = entries.map((e, i) => {
    let newTrans = e.trans;
    if (mp && mp.has(i) && !isMarker(e.orig)) {
      newTrans = stripName(mp.get(i).psp);
      n++; filled++;
    }
    return { hdr: e.hdr, orig: e.orig, trans: newTrans };
  });

  fs.writeFileSync(path.join(OUT, fname), renderStrict(prefix, outEntries), 'utf8');
  if (n > 0) changed++;
}

console.log(`\n写出 ${allFiles.length} 文件，回填 ${filled} 条，涉及 ${changed} 文件`);
