'use strict';
/**
 * 对齐 v4（最终方案）
 * 两阶段：
 *   阶段 A：整章合并对齐（大文件主导，覆盖率高）
 *   阶段 B：对阶段 A 中「整段未配」的文件，单独重新对齐并补配
 *   阶段 C：全局互斥去重，冲突时保留置信度高者
 */
const fs = require('fs');
const path = require('path');
const AL = require('./alignlib.js');

const OUT = process.env.PATCH_OUT || AL.PATCH_DIR; // 默认读仓库 patch/；如需检查 build_patch 的中间产物，设 PATCH_OUT=./out_patch
const SRC = AL.PATCH_DIR;

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

function scorePair(v, p) {
  const se = AL.spkEquiv(v.nm, p.spk);
  const exp = Math.max(2, v.enW * 1.85);
  const lr = (p.n.length + 1.5) / (exp + 1.5);
  let s = 0;
  if (se === 'ok') s += 3;
  else if (se === 'unknown') s += 1.5;
  else if (se === 'weak') s += 1.0;
  else s -= 4;
  if (lr > 0.5 && lr < 2.0) s += 2;
  else if (lr > 0.4 && lr < 2.4) s += 0.8;
  else s -= 1.5;
  if (isMarker(v.orig)) s -= 10;
  return s;
}

const fileToCh = {};
for (const ch of Object.keys(AL.MAP)) for (const f of AL.MAP[ch]) fileToCh[f] = ch;

const claimsAll = [];   // {ch, f, i, b, score}
const chapterInfo = {};

for (const ch of Object.keys(AL.MAP)) {
  const P = AL.loadPSP(ch);
  const files = AL.MAP[ch];
  chapterInfo[ch] = { P, files };

  // ---- 阶段 A：整章合并对齐 ----
  const Vall = AL.buildV(files);
  const { pairs } = AL.dpAlign(Vall, P);
  const coveredFiles = new Set();
  for (const [a, b] of pairs) {
    const v = Vall[a];
    coveredFiles.add(v.file);
    claimsAll.push({ ch, f: v.file, i: v.i, b, score: scorePair(v, P[b]) + 0.5 }); // 整章结果略加权
  }

  // ---- 阶段 B：整段未配的文件单独补配 ----
  const perFileCount = {};
  for (const [a, b] of pairs) {
    const f = Vall[a].file;
    perFileCount[f] = (perFileCount[f] || 0) + 1;
  }
  for (const f of files) {
    const V = AL.buildV([f]);
    if (!V.length) continue;
    const got = perFileCount[f] || 0;
    // 覆盖率低于 70% 的文件需要补配
    if (got / V.length >= 0.70) continue;

    const r2 = AL.dpAlign(V, P);
    for (const [a, b] of r2.pairs) {
      claimsAll.push({ ch, f, i: V[a].i, b, score: scorePair(V[a], P[b]) });
    }
  }
}

// ---- 阶段 C：全局分配 ----
claimsAll.sort((x, y) => y.score - x.score);
const usedP = new Set();
const usedV = new Set();
const result = {};
for (const ch of Object.keys(AL.MAP)) { result[ch] = {}; for (const f of AL.MAP[ch]) result[ch][f] = new Map(); }

const THRESHOLD = 3.0;
let adopted = 0;
for (const c of claimsAll) {
  if (c.score < THRESHOLD) continue;
  const pkey = c.ch + '|' + c.b;
  const vkey = c.ch + '|' + c.f + '#' + c.i;
  if (usedP.has(pkey) || usedV.has(vkey)) continue;
  usedP.add(pkey); usedV.add(vkey);
  const p = chapterInfo[c.ch].P[c.b];
  result[c.ch][c.f].set(c.i, { psp: p.raw, spk: p.spk });
  adopted++;
}
console.log(`采用 ${adopted} 条`);

// ---- 写回 ----
fs.mkdirSync(OUT, { recursive: true });
const allFiles = fs.readdirSync(SRC).filter(f => f.endsWith('.txt')).sort();
let filled = 0, changed = 0;
const perFile = {};

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
  if (ch) perFile[base] = { n, total: entries.filter(e => e.meta.index !== undefined).length };
}

console.log(`写出 ${allFiles.length} 文件，回填 ${filled} 条，涉及 ${changed} 文件`);

// 覆盖率报告
let st = 0, sd = 0;
for (const [f, x] of Object.entries(perFile)) { st += x.total; sd += x.n; }
console.log(`PSP 覆盖范围内: ${sd}/${st} = ${(100 * sd / st).toFixed(1)}%`);
