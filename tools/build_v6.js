'use strict';
/**
 * v6 最终版 = v4（整章 + 补配） + v5（锚点窗口）联合分配
 * 两套候选一起评分，统一互斥分配，取最优
 */
const fs = require('fs');
const path = require('path');
const AL = require('./alignlib.js');

const OUT = process.env.PATCH_OUT || AL.PATCH_DIR; // 默认读仓库 patch/；如需检查 build_patch 的中间产物，设 PATCH_OUT=./out_patch
const SRC = AL.PATCH_DIR;

const INLINE_RE = /^(朋也|智代|鹰文|河南子|小智|有子|管理员|小川|直幸|师傅|村人|老人|少女|女子|女性|男|医生)\s*(?=[（(「『])/;
const stripName = (s) => (s || '').trim().replace(INLINE_RE, '');
const MARKER_RE = /^(BAD END|GAME OVER|TO BE CONTINUED|Ending|Epilogue|Prologue|Title|Menu|Save|Load|OK|Cancel|Yes|No|Back|Next)$/i;
const isMarker = (s) => MARKER_RE.test((s || '').replace(/\\"/g, '"').trim());

function renderStrict(prefix, entries) {
  let out = prefix;
  for (const e of entries) {
    out += '\n====================\n' + e.hdr.join('\n') + '\n';
    out += '====================\n' + e.orig + '\n';
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
  if (se === 'ok') s += 3; else if (se === 'unknown') s += 1.5;
  else if (se === 'weak') s += 1.0; else s -= 4;
  if (lr > 0.5 && lr < 2.0) s += 2;
  else if (lr > 0.4 && lr < 2.4) s += 0.8;
  else s -= 1.5;
  if (isMarker(v.orig)) s -= 10;
  return s;
}

const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July',
  'August', 'September', 'October', 'November', 'December'];

const fileToCh = {};
for (const ch of Object.keys(AL.MAP)) for (const f of AL.MAP[ch]) fileToCh[f] = ch;

const claims = [];
const chapterInfo = {};

for (const ch of Object.keys(AL.MAP)) {
  const P = AL.loadPSP(ch);
  const files = AL.MAP[ch];
  chapterInfo[ch] = { P, files };

  // === 候选源 1：整章合并 ===
  const Vall = AL.buildV(files);
  const r1 = AL.dpAlign(Vall, P);
  const perFile = {};
  for (const [a, b] of r1.pairs) {
    const v = Vall[a];
    perFile[v.file] = (perFile[v.file] || 0) + 1;
    claims.push({ ch, f: v.file, i: v.i, b, score: scorePair(v, P[b]) + 0.6, src: 'chapter' });
  }

  // === 候选源 2：单文件独立（覆盖率不足时） ===
  for (const f of files) {
    const V = AL.buildV([f]);
    if (!V.length) continue;
    if ((perFile[f] || 0) / V.length >= 0.85) continue;
    const r2 = AL.dpAlign(V, P);
    for (const [a, b] of r2.pairs) {
      claims.push({ ch, f, i: V[a].i, b, score: scorePair(V[a], P[b]), src: 'file' });
    }
  }

  // === 候选源 3：锚点窗口（日期标题切段） ===
  for (const f of files) {
    const V = AL.buildV([f]);
    if (!V.length) continue;
    const anchors = [];
    for (let ai = 0; ai < V.length; ai++) {
      const en = (V[ai].orig || '').replace(/\\"/g, '');
      const m = en.match(/(January|February|March|April|May|June|July|August|September|October|November|December)\s+(\d+)/i);
      if (!m) continue;
      const mon = MONTHS.indexOf(m[1].charAt(0).toUpperCase() + m[1].slice(1).toLowerCase()) + 1;
      const day = parseInt(m[2], 10);
      if (mon < 1) continue;
      const half = String(mon) + '月' + String(day) + '日';
      const full = String(mon).replace(/\d/g, d => String.fromCharCode(0xFF10 + +d)) + '月' +
        String(day).replace(/\d/g, d => String.fromCharCode(0xFF10 + +d)) + '日';
      for (let b = 0; b < P.length; b++) {
        if (P[b].raw.includes(half) || P[b].raw.includes(full)) { anchors.push({ ai, b }); break; }
      }
    }
    if (!anchors.length) continue;
    for (let k = 0; k < anchors.length; k++) {
      const a0 = anchors[k].ai, b0 = anchors[k].b;
      const a1 = (k + 1 < anchors.length) ? anchors[k + 1].ai : V.length;
      const b1 = (k + 1 < anchors.length) ? anchors[k + 1].b : P.length;
      if (a1 - a0 <= 1 || b1 - b0 <= 1) continue;
      const Vs = V.slice(a0, a1), Ps = P.slice(b0, b1);
      const r3 = AL.dpAlign(Vs, Ps);
      for (const [a, b] of r3.pairs) {
        claims.push({ ch, f, i: Vs[a].i, b: b0 + b, score: scorePair(Vs[a], Ps[b]) + 0.9, src: 'anchor' });
      }
    }
  }
}

// === 统一分配 ===
claims.sort((x, y) => y.score - x.score);
const usedP = new Set(), usedV = new Set();
const result = {};
for (const ch of Object.keys(AL.MAP)) { result[ch] = {}; for (const f of AL.MAP[ch]) result[ch][f] = new Map(); }

const THRESHOLD = 3.0;
let adopted = 0;
const srcStat = {};
for (const c of claims) {
  if (c.score < THRESHOLD) continue;
  const pkey = c.ch + '|' + c.b, vkey = c.ch + '|' + c.f + '#' + c.i;
  if (usedP.has(pkey) || usedV.has(vkey)) continue;
  usedP.add(pkey); usedV.add(vkey);
  result[c.ch][c.f].set(c.i, { psp: chapterInfo[c.ch].P[c.b].raw });
  adopted++;
  srcStat[c.src] = (srcStat[c.src] || 0) + 1;
}
console.log(`采用 ${adopted} 条`, JSON.stringify(srcStat));

// === 写回 ===
fs.mkdirSync(OUT, { recursive: true });
const allFiles = fs.readdirSync(SRC).filter(f => f.endsWith('.txt')).sort();
let filled = 0, changed = 0;
const perFileOut = {};

for (const fname of allFiles) {
  const base = fname.replace('.txt', '');
  const { prefix, entries } = AL.parseVl(fs.readFileSync(path.join(SRC, fname), 'utf8'));
  const ch = fileToCh[base];
  const mp = ch && result[ch] ? result[ch][base] : null;
  let n = 0;
  const outEntries = entries.map((e, i) => {
    let t = e.trans;
    if (mp && mp.has(i) && !isMarker(e.orig)) { t = stripName(mp.get(i).psp); n++; filled++; }
    return { hdr: e.hdr, orig: e.orig, trans: t };
  });
  fs.writeFileSync(path.join(OUT, fname), renderStrict(prefix, outEntries), 'utf8');
  if (n > 0) changed++;
  if (ch) perFileOut[base] = { n, total: entries.filter(e => e.meta.index !== undefined).length };
}
console.log(`写出 ${allFiles.length} 文件，回填 ${filled} 条，涉及 ${changed} 文件`);

let st = 0, sd = 0;
for (const x of Object.values(perFileOut)) { st += x.total; sd += x.n; }
console.log(`PSP 覆盖范围内: ${sd}/${st} = ${(100 * sd / st).toFixed(1)}%`);
const low = Object.entries(perFileOut).filter(([f, x]) => x.n / x.total < 0.6);
if (low.length) {
  console.log('\n覆盖率 <60% 的文件：');
  low.forEach(([f, x]) => console.log(`  ${f.padEnd(12)} ${x.n}/${x.total} = ${(100 * x.n / x.total).toFixed(0)}%`));
}
