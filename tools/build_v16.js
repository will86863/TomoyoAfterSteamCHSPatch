'use strict';
/**
 * v16（A2 最终版）
 *
 * 核心改进：**日期行精确锚定优先**
 *   观察：每个官方文件的第一条几乎都是日期标题（仅分支文件可能没有），
 *        PSP 中同一天的日期行会有多处，但"文件顺序"与"PSP 日期行顺序"一致。
 *   做法：
 *     1. 提取所有官方文件的日期（文件首条的日期）
 *     2. 提取 PSP 中所有日期行位置（按顺序）
 *     3. 用「同日期多处出现」做序列对齐：几个文件共享同一天 → 对应 PSP 中同一天的几处
 *     4. 无日期的文件（分支）→ 紧跟在前一个同日期文件之后
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

const MONTHS = ['january', 'february', 'march', 'april', 'may', 'june', 'july',
  'august', 'september', 'october', 'november', 'december'];

// 从英文取日期
function enDate(en) {
  const t = (en || '').replace(/\\"/g, '');
  const m = t.match(/(January|February|March|April|May|June|July|August|September|October|November|December)\s+(\d+)/i);
  if (!m) return null;
  const mon = MONTHS.indexOf(m[1].toLowerCase()) + 1;
  return mon < 1 ? null : mon * 100 + parseInt(m[2], 10);
}
// 从中文取日期（全角/半角均可）
function cnDate(line) {
  const t = (line || '');
  const half = t.match(/(\d{1,2})月(\d{1,2})日/);
  if (half) return parseInt(half[1], 10) * 100 + parseInt(half[2], 10);
  // 全角
  const map = (s) => s.replace(/[０-９]/g, c => String.fromCharCode(c.charCodeAt(0) - 0xFEE0));
  const full = map(t).match(/(\d{1,2})月(\d{1,2})日/);
  if (full) return parseInt(full[1], 10) * 100 + parseInt(full[2], 10);
  return null;
}

function spkCat(name) {
  if (!name) return 'NAR';
  const n = AL.normName(name);
  const map = { tomoyo: 'A', tomoya: 'B', takafumi: 'C', kanako: 'D', tomo: 'E', caretaker: 'F', yuko: 'G', ogawa: 'H', boss: 'I', naoyuki: 'J' };
  return map[n] || 'X';
}
const lenBucket = (n) => n <= 3 ? 0 : n <= 8 ? 1 : n <= 16 ? 2 : n <= 30 ? 3 : 4;
const featV = (V) => V.map(v => ({ cat: spkCat(v.nm), len: lenBucket(v.enW * 1.85) }));
const featP = (P) => P.map(p => ({ cat: p.spk ? spkCat(AL.SPK2NAME[p.spk]) : 'NAR', len: lenBucket(p.n.length) }));

function seqScore(A, B) {
  let s = 0; const n = Math.min(A.length, B.length);
  if (!n) return -1e9;
  for (let i = 0; i < n; i++) {
    if (A[i].cat === B[i].cat) s += 2;
    else if (A[i].cat === 'NAR' || B[i].cat === 'NAR') s -= 1;
    else s -= 1.5;
    const d = Math.abs(A[i].len - B[i].len);
    s += d === 0 ? 1 : d === 1 ? 0.3 : -0.5;
  }
  return s / n;
}

function scorePair(v, p) {
  const se = AL.spkEquiv(v.nm, p.spk);
  const exp = Math.max(2, v.enW * 1.85);
  const lr = (p.n.length + 1.5) / (exp + 1.5);
  let s = 0;
  if (se === 'ok') s += 3; else if (se === 'unknown') s += 1.5;
  else if (se === 'weak') s += 0.8; else s -= 5;
  if (lr > 0.55 && lr < 1.8) s += 2.5;
  else if (lr > 0.45 && lr < 2.2) s += 1.2;
  else s -= 2;
  if (isMarker(v.orig)) s -= 10;
  return s;
}
function dpSegment(Vs, Ps, gap = 0.3) {
  const n = Vs.length, m = Ps.length;
  if (!n || !m) return [];
  const NEG = -1e18, W = m + 1;
  const back = new Uint8Array((n + 1) * W);
  let prev = new Float64Array(W).fill(NEG); prev[0] = 0;
  let cur = new Float64Array(W);
  for (let i = 1; i <= n; i++) {
    cur.fill(NEG); cur[0] = prev[0] - gap; back[i * W] = 1;
    const c = Math.floor(i * m / n);
    const lo = Math.max(1, c - 150), hi = Math.min(m, c + 150);
    for (let j = lo; j <= hi; j++) {
      let best = NEG, bk = 1;
      if (prev[j] > NEG / 2) { best = prev[j] - gap; bk = 1; }
      if (cur[j - 1] > NEG / 2 && cur[j - 1] - gap > best + 1e-12) { best = cur[j - 1] - gap; bk = 2; }
      if (prev[j - 1] > NEG / 2) {
        const sc = scorePair(Vs[i - 1], Ps[j - 1]);
        if (sc > 0) { const cand = prev[j - 1] + sc; if (cand > best + 1e-12) { best = cand; bk = 0; } }
      }
      cur[j] = best; back[i * W + j] = bk;
    }
    const t = prev; prev = cur; cur = t;
  }
  let i = n, j = m; const pairs = [];
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
  const Pf = featP(P);
  const files = AL.MAP[ch];

  result[ch] = {};
  for (const f of files) result[ch][f] = new Map();

  // ---- 1. 收集信息 ----
  const info = [];
  for (const f of files) {
    const V = AL.buildV([f]);
    if (!V.length) continue;
    const d = enDate(V[0].orig);           // 首条通常是日期
    info.push({ f, V, F: featV(V), date: d, start: -1 });
  }

  // ---- 2. PSP 日期行位置 ----
  const pspDates = [];
  P.forEach((p, i) => {
    const d = cnDate(p.raw);
    if (d && p.raw.length < 24) pspDates.push({ i, d });
  });

  // ---- 3. 按日期序列分配起点 ----
  // 对每个 info（按原顺序 = 文件在章内的顺序），依次在 pspDates 中取"当前指针之前最近的可用同日期"
  let datePtr = 0;
  let lastStart = -1;
  const noDate = [];

  for (const it of info) {
    if (!it.date) { noDate.push(it); continue; }
    // 从 datePtr 开始找第一个匹配 date 且位置 > lastStart 的
    let found = -1;
    for (let k = datePtr; k < pspDates.length; k++) {
      if (pspDates[k].d === it.date && pspDates[k].i > lastStart) { found = pspDates[k].i; datePtr = k + 1; break; }
    }
    // 若没找到（例如该文件日期在 PSP 中已被用掉），退化为特征定位
    if (found < 0) {
      const F0 = it.F, useLen = Math.min(40, F0.length);
      let best = { b: -1, score: -1e9 };
      for (let b = lastStart + 1; b + useLen <= Pf.length; b++) {
        const s = seqScore(F0.slice(0, useLen), Pf.slice(b, b + useLen));
        if (s > best.score) best = { b, score: s };
      }
      found = best.b;
    }
    it.start = found;
    if (found > lastStart) lastStart = found;
  }

  // 无日期的文件：用特征定位，且必须在前一个之后
  for (const it of noDate) {
    const F0 = it.F, useLen = Math.min(40, F0.length);
    let best = { b: -1, score: -1e9 };
    for (let b = Math.max(0, lastStart - 20); b + useLen <= Pf.length; b++) {
      const s = seqScore(F0.slice(0, useLen), Pf.slice(b, b + useLen));
      if (s > best.score) best = { b, score: s };
    }
    it.start = best.b;
    if (best.b > lastStart) lastStart = best.b;
  }

  // ---- 4. 排序 + 分配区间 ----
  info.sort((a, b) => a.start - b.start);
  let mapped = 0;
  const locInfo = [];
  const usedP = new Set();

  for (let k = 0; k < info.length; k++) {
    const cur = info[k];
    const nextStart = (k + 1 < info.length) ? info[k + 1].start : P.length;
    const lo = Math.max(0, cur.start);
    const hi = Math.max(lo + 1, nextStart);
    const Ps = P.slice(lo, Math.min(hi, P.length));
    if (!Ps.length) continue;
    const pairs = dpSegment(cur.V, Ps);
    for (const [a, b] of pairs) {
      const idx = lo + b;
      if (usedP.has(idx)) continue;
      usedP.add(idx);
      result[ch][cur.f].set(cur.V[a].i, { psp: Ps[b].raw });
      mapped++;
    }
    locInfo.push(`${cur.f}@${lo}(${pairs.length}/${cur.V.length})`);
  }

  report.push({ ch, official: info.reduce((s, x) => s + x.V.length, 0), psp: P.length, mapped, locInfo });
}

console.log('v16 结果（日期精确锚定）：');
for (const r of report) {
  console.log(`  ${r.ch}: 官方${String(r.official).padStart(5)} PSP${String(r.psp).padStart(5)} 映射${String(r.mapped).padStart(5)} (${(100 * r.mapped / r.official).toFixed(0)}%)`);
  console.log(`       ${r.locInfo.join(' ')}`);
}

fs.mkdirSync(OUT, { recursive: true });
const allFiles = fs.readdirSync(SRC).filter(f => f.endsWith('.txt')).sort();
let filled = 0, changed2 = 0;
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
  if (n > 0) changed2++;
  if (ch) perFileOut[base] = { n, total: entries.filter(e => e.meta.index !== undefined).length };
}
console.log(`\n写出 ${allFiles.length} 文件，回填 ${filled} 条，涉及 ${changed2} 文件`);
let st = 0, sd = 0;
for (const x of Object.values(perFileOut)) { st += x.total; sd += x.n; }
console.log(`PSP 覆盖范围内: ${sd}/${st} = ${(100 * sd / st).toFixed(1)}%`);

const low = Object.entries(perFileOut).filter(([f, x]) => x.n / x.total < 0.85);
if (low.length) {
  console.log('\n覆盖率 <85%：');
  low.sort((a, b) => (a[1].n / a[1].total) - (b[1].n / b[1].total));
  low.forEach(([f, x]) => console.log(`  ${f.padEnd(12)} ${x.n}/${x.total} = ${(100 * x.n / x.total).toFixed(0)}%`));
}
