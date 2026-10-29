'use strict';
/**
 * v8：锚点分段 + 段内 DP（关键修正）
 *
 * v7 失败原因：段内按比例线性映射，PSP 多出句时整段漂移。
 * 正确做法：段内仍用 DP 对齐（DP 能吸收插入/缺失），
 *           但把 DP 限制在锚点窗口内，不让误差跨段累积。
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

function findDate(en) {
  const m = (en || '').replace(/\\"/g, '').match(/(January|February|March|April|May|June|July|August|September|October|November|December)\s+(\d+)/i);
  if (!m) return null;
  const mon = MONTHS.indexOf(m[1].charAt(0).toUpperCase() + m[1].slice(1).toLowerCase()) + 1;
  return mon < 1 ? null : { mon, day: parseInt(m[2], 10) };
}
function matchDate(line, d) {
  const sw = (n) => String(n).replace(/\d/g, c => String.fromCharCode(0xFF10 + +c));
  return line.includes(d.mon + '月' + d.day + '日') ||
    line.includes(sw(d.mon) + '月' + sw(d.day) + '日') ||
    line.includes(sw(d.mon) + '月' + sw(('0' + d.day).slice(-2)) + '日');
}

function scorePair(v, p) {
  const se = AL.spkEquiv(v.nm, p.spk);
  const exp = Math.max(2, v.enW * 1.85);
  const lr = (p.n.length + 1.5) / (exp + 1.5);
  let s = 0;
  if (se === 'ok') s += 3; else if (se === 'unknown') s += 1.5;
  else if (se === 'weak') s += 1.0; else s -= 3;
  if (lr > 0.5 && lr < 2.0) s += 2;
  else if (lr > 0.4 && lr < 2.4) s += 0.8;
  else s -= 1.5;
  if (isMarker(v.orig)) s -= 10;
  return s;
}

// 段内 DP：只允许合法配对（分数为负的不选）
function dpSegment(Vs, Ps) {
  const n = Vs.length, m = Ps.length;
  if (!n || !m) return [];
  const NEG = -1e18, W = m + 1;
  const back = new Uint8Array((n + 1) * W);
  let prev = new Float64Array(W).fill(NEG); prev[0] = 0;
  let cur = new Float64Array(W);
  const gap = 0.35;
  for (let i = 1; i <= n; i++) {
    cur.fill(NEG);
    cur[0] = prev[0] - gap;
    back[i * W] = 1;
    const c = Math.floor(i * m / n);
    const lo = Math.max(1, c - 120), hi = Math.min(m, c + 120);
    for (let j = lo; j <= hi; j++) {
      let best = NEG, bk = 1;
      if (prev[j] > NEG / 2) { best = prev[j] - gap; bk = 1; }
      if (cur[j - 1] > NEG / 2 && cur[j - 1] - gap > best + 1e-12) { best = cur[j - 1] - gap; bk = 2; }
      if (prev[j - 1] > NEG / 2) {
        const sc = scorePair(Vs[i - 1], Ps[j - 1]);
        if (sc > 0) {
          const cand = prev[j - 1] + sc;
          if (cand > best + 1e-12) { best = cand; bk = 0; }
        }
      }
      cur[j] = best; back[i * W + j] = bk;
    }
    const t = prev; prev = cur; cur = t;
  }
  let i = n, j = m;
  const pairs = [];
  while (i > 0 || j > 0) {
    const bk = back[i * W + j];
    if (i > 0 && j > 0 && bk === 0) { pairs.push([i - 1, j - 1]); i--; j--; }
    else if (i > 0 && (j === 0 || bk === 1)) i--;
    else j--;
  }
  return pairs.reverse();
}

const fileToCh = {};
for (const ch of Object.keys(AL.MAP)) for (const f of AL.MAP[ch]) fileToCh[f] = ch;

const result = {};
const report = [];

for (const ch of Object.keys(AL.MAP)) {
  const P = AL.loadPSP(ch);
  const files = AL.MAP[ch];
  const Vall = AL.buildV(files);

  // 日期锚点
  const anchors = [{ a: -1, b: -1 }];
  for (let i = 0; i < Vall.length; i++) {
    const d = findDate(Vall[i].orig);
    if (!d) continue;
    // 单调锚点：必须在上一个锚点之后；且要求"日期序号不倒退"
    // （分支文件会让同一日期多次出现，此处按顺序取最近的一个）
    const prev = anchors[anchors.length - 1];
    let hit = -1;
    for (let b = prev.b + 1; b < P.length; b++) {
      if (matchDate(P[b].raw, d)) { hit = b; break; }
    }
    if (hit < 0) continue;                    // 找不到就不设锚，避免错乱
    anchors.push({ a: i, b: hit });
  }
  anchors.push({ a: Vall.length, b: P.length });

  result[ch] = {};
  for (const f of files) result[ch][f] = new Map();

  let mapped = 0;
  for (let k = 0; k < anchors.length - 1; k++) {
    const a0 = anchors[k].a, b0 = anchors[k].b;
    const a1 = anchors[k + 1].a, b1 = anchors[k + 1].b;
    const Vs = Vall.slice(a0 + 1, a1);
    const Ps = P.slice(b0 + 1, b1);
    if (!Vs.length || !Ps.length) continue;

    const pairs = dpSegment(Vs, Ps);
    for (const [a, b] of pairs) {
      const v = Vs[a];
      result[ch][v.file].set(v.i, { psp: Ps[b].raw });
      mapped++;
    }
  }
  report.push({ ch, official: Vall.length, psp: P.length, anchors: anchors.length - 2, mapped });
}

console.log('锚点分段 + 段内 DP 结果：');
for (const r of report) {
  console.log(`  ${r.ch}: 官方${String(r.official).padStart(5)} PSP${String(r.psp).padStart(5)} 锚点${String(r.anchors).padStart(2)} 映射${String(r.mapped).padStart(5)} (${(100 * r.mapped / r.official).toFixed(0)}%)`);
}

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
