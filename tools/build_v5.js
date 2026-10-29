'use strict';
/**
 * v5：在 v4 基础上，对覆盖率仍低的文件做「定向独立对齐」
 * 关键：不用整章 PSP 做 DP，而是先按"特征锚点"把 PSP 切成若干候选窗口，再逐窗口对齐
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

const fileToCh = {};
for (const ch of Object.keys(AL.MAP)) for (const f of AL.MAP[ch]) fileToCh[f] = ch;

const claimsAll = [];
const chapterInfo = {};

for (const ch of Object.keys(AL.MAP)) {
  const P = AL.loadPSP(ch);
  const files = AL.MAP[ch];
  chapterInfo[ch] = { P, files };

  // 阶段 A：整章合并
  const Vall = AL.buildV(files);
  const { pairs } = AL.dpAlign(Vall, P);
  const perFile = {};
  for (const [a, b] of pairs) {
    const v = Vall[a];
    perFile[v.file] = (perFile[v.file] || 0) + 1;
    claimsAll.push({ ch, f: v.file, i: v.i, b, score: scorePair(v, P[b]) + 0.6 });
  }

  // 阶段 B：覆盖不足的文件，用「锚点窗口」定向对齐
  for (const f of files) {
    const V = AL.buildV([f]);
    if (!V.length) continue;
    const got = perFile[f] || 0;
    if (got / V.length >= 0.85) continue;

    // —— 找锚点：英文日期标题 → PSP 日期行
    const anchors = [];
    for (let ai = 0; ai < V.length; ai++) {
      const en = (V[ai].orig || '').replace(/\\"/g, '');
      const m = en.match(/(January|February|March|April|May|June|July|August|September|October|November|December)\s+(\d+)/i);
      if (m) {
        const mon = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'].indexOf(
          m[1].charAt(0).toUpperCase() + m[1].slice(1).toLowerCase()) + 1;
        const day = parseInt(m[2], 10);
        // PSP 里形如 ８月１３日
        const want = String(mon) + '月' + String(day) + '日';
        const wantFull = String(mon).replace(/\d/g, d => String.fromCharCode(0xFF10 + +d)) + '月' +
          String(day).replace(/\d/g, d => String.fromCharCode(0xFF10 + +d)) + '日';
        for (let b = 0; b < P.length; b++) {
          if (P[b].raw.includes(want) || P[b].raw.includes(wantFull)) { anchors.push({ ai, b }); break; }
        }
      }
    }

    if (anchors.length) {
      // 按锚点切窗口，逐段对齐
      const segs = [];
      for (let k = 0; k < anchors.length; k++) {
        const a0 = anchors[k].ai, b0 = anchors[k].b;
        const a1 = (k + 1 < anchors.length) ? anchors[k + 1].ai : V.length;
        const b1 = (k + 1 < anchors.length) ? anchors[k + 1].b : P.length;
        if (a1 - a0 > 1 && b1 - b0 > 1) segs.push({ a0, a1, b0, b1 });
      }
      for (const sg of segs) {
        const Vs = V.slice(sg.a0, sg.a1);
        const Ps = P.slice(sg.b0, sg.b1);
        const r = AL.dpAlign(Vs, Ps);
        for (const [a, b] of r.pairs) {
          claimsAll.push({ ch, f, i: Vs[a].i, b: sg.b0 + b, score: scorePair(Vs[a], Ps[b]) + 1.0 }); // 锚点窗口加权
        }
      }
    } else {
      // 无锚点：退化为整章独立对齐
      const r2 = AL.dpAlign(V, P);
      for (const [a, b] of r2.pairs) claimsAll.push({ ch, f, i: V[a].i, b, score: scorePair(V[a], P[b]) });
    }
  }
}

// 阶段 C：全局分配
claimsAll.sort((x, y) => y.score - x.score);
const usedP = new Set(), usedV = new Set();
const result = {};
for (const ch of Object.keys(AL.MAP)) { result[ch] = {}; for (const f of AL.MAP[ch]) result[ch][f] = new Map(); }

const THRESHOLD = 3.0;
let adopted = 0;
for (const c of claimsAll) {
  if (c.score < THRESHOLD) continue;
  const pkey = c.ch + '|' + c.b, vkey = c.ch + '|' + c.f + '#' + c.i;
  if (usedP.has(pkey) || usedV.has(vkey)) continue;
  usedP.add(pkey); usedV.add(vkey);
  const p = chapterInfo[c.ch].P[c.b];
  result[c.ch][c.f].set(c.i, { psp: p.raw });
  adopted++;
}
console.log(`采用 ${adopted} 条`);

// 写回
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
console.log('\n仍低于 50% 的文件：');
Object.entries(perFileOut).filter(([f, x]) => x.n / x.total < 0.5).forEach(([f, x]) => {
  console.log(`  ${f.padEnd(12)} ${x.n}/${x.total} = ${(100 * x.n / x.total).toFixed(0)}%`);
});
