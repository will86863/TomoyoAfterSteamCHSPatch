'use strict';
/**
 * v7：保序位置映射（positional monotone mapping）
 *
 * 依据：官方条目与 PSP 句子在同一章内严格保序、且数量接近
 *（实测 5006 差 0、0812 差 1、0628 差 9、0801 差 -19）。
 * 因此不需要复杂打分，只需：
 *   1. 用「日期标题」「说话人切换」等强锚点把两边切成若干段
 *   2. 段内按比例线性映射
 *   3. 只对「长度严重不符」的配对做局部微调
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

const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July',
  'August', 'September', 'October', 'November', 'December'];

// 从英文拿到日期，从中文找日期行
function findDate(en) {
  const m = (en || '').replace(/\\"/g, '').match(/(January|February|March|April|May|June|July|August|September|October|November|December)\s+(\d+)/i);
  if (!m) return null;
  const mon = MONTHS.indexOf(m[1].charAt(0).toUpperCase() + m[1].slice(1).toLowerCase()) + 1;
  if (mon < 1) return null;
  return { mon, day: parseInt(m[2], 10) };
}
function matchDate(line, d) {
  const half = d.mon + '月' + d.day + '日';
  const full = String(d.mon).replace(/\d/g, c => String.fromCharCode(0xFF10 + +c)) + '月' +
    String(d.day).replace(/\d/g, c => String.fromCharCode(0xFF10 + +c)) + '日';
  const zeropad = String(d.mon).replace(/\d/g, c => String.fromCharCode(0xFF10 + +c)) + '月' +
    ('000' + d.day).slice(-2).replace(/\d/g, c => String.fromCharCode(0xFF10 + +c)) + '日';
  return line.includes(half) || line.includes(full) || line.includes(zeropad);
}

// 说话人一致（宽松）
function spkCompatible(nm, spk) {
  const se = AL.spkEquiv(nm, spk);
  return se === 'ok' || se === 'unknown' || se === 'weak';
}

const fileToCh = {};
for (const ch of Object.keys(AL.MAP)) for (const f of AL.MAP[ch]) fileToCh[f] = ch;

const result = {};
const report = [];

for (const ch of Object.keys(AL.MAP)) {
  const P = AL.loadPSP(ch);
  const files = AL.MAP[ch];
  const Vall = AL.buildV(files);

  // ---- 1. 找日期锚点 ----
  const anchors = [{ a: -1, b: -1 }];
  for (let i = 0; i < Vall.length; i++) {
    const d = findDate(Vall[i].orig);
    if (!d) continue;
    // 在 PSP 中找对应日期行（从上一个锚点之后开始找，保持单调）
    const from = anchors[anchors.length - 1].b + 1;
    for (let b = from; b < P.length; b++) {
      if (matchDate(P[b].raw, d)) { anchors.push({ a: i, b }); break; }
    }
  }
  anchors.push({ a: Vall.length, b: P.length });

  // ---- 2. 段内线性映射 ----
  result[ch] = {};
  for (const f of files) result[ch][f] = new Map();

  let mapped = 0;
  for (let k = 0; k < anchors.length - 1; k++) {
    const a0 = anchors[k].a, b0 = anchors[k].b;
    const a1 = anchors[k + 1].a, b1 = anchors[k + 1].b;
    const nA = a1 - a0 - 1, nB = b1 - b0 - 1;   // 段内条目数
    if (nA <= 0) continue;

    for (let t = 1; t <= nA; t++) {
      const ai = a0 + t;
      if (ai >= Vall.length) break;
      // 按比例映射，再在 ±2 内找说话人兼容的
      let bj = nB > 0 ? b0 + Math.round(t * nB / nA) : b0 + t;
      bj = Math.max(b0 + 1, Math.min(b1 - 1, bj));
      let pick = -1;
      for (let dlt = 0; dlt <= 2 && pick < 0; dlt++) {
        for (const cand of [bj + dlt, bj - dlt]) {
          if (cand > b0 && cand < b1 && cand < P.length && spkCompatible(Vall[ai].nm, P[cand].spk)) { pick = cand; break; }
        }
      }
      if (pick < 0 && bj > b0 && bj < b1 && bj < P.length) pick = bj;   // 兜底
      if (pick < 0) continue;
      result[ch][Vall[ai].file].set(Vall[ai].i, { psp: P[pick].raw });
      mapped++;
    }
  }
  report.push({ ch, official: Vall.length, psp: P.length, anchors: anchors.length - 2, mapped });
}

console.log('保序位置映射结果：');
for (const r of report) {
  console.log(`  ${r.ch}: 官方${String(r.official).padStart(5)} PSP${String(r.psp).padStart(5)} 日期锚点${String(r.anchors).padStart(2)} 映射${String(r.mapped).padStart(5)} (${(100 * r.mapped / r.official).toFixed(0)}%)`);
}

// ---- 3. 写回 ----
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
console.log(`\n写出 ${allFiles.length} 文件，回填 ${filled} 条，涉及 ${changed} 文件`);
let st = 0, sd = 0;
for (const x of Object.values(perFileOut)) { st += x.total; sd += x.n; }
console.log(`PSP 覆盖范围内: ${sd}/${st} = ${(100 * sd / st).toFixed(1)}%`);
