'use strict';
/**
 * v20（最终版）
 * 两轮分配：
 *   第1轮：所有「有日期」文件，按（日期, 文件顺序）排序，依次占用 PSP 中该日期的位置
 *          —— 同一日期有 n 个文件、PSP 有 m 个位置时，按顺序一一对应
 *   第2轮：所有「无日期」文件（分支），取「前一个已分配文件之后的下一个未用日期位置」
 *          —— 例如 seen0813 应落在 8/13 的第二处，而不是被前面的话挤住
 *   兜底：找不到合适位置就用特征序列搜索
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

const MONTHS = ['january', 'february', 'march', 'april', 'may', 'june', 'july', 'august', 'september', 'october', 'november', 'december'];
function enDate(en) {
  const t = (en || '').replace(/\\"/g, '');
  const m = t.match(/(January|February|March|April|May|June|July|August|September|October|November|December)\s+(\d+)/i);
  if (!m) return null;
  const mon = MONTHS.indexOf(m[1].toLowerCase()) + 1;
  return mon < 1 ? null : mon * 100 + parseInt(m[2], 10);
}
function cnDate(line) {
  const map = (s) => s.replace(/[０-９]/g, c => String.fromCharCode(c.charCodeAt(0) - 0xFEE0));
  const m = map(line || '').match(/(\d{1,2})月(\d{1,2})日/);
  return m ? parseInt(m[1], 10) * 100 + parseInt(m[2], 10) : null;
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
function bestStartIn(F, Pf, lo, hi) {
  const useLen = Math.min(60, F.length);
  if (!useLen) return { b: -1, score: -1e9 };
  const A = F.slice(0, useLen);
  let best = { b: -1, score: -1e9 };
  const L = Math.max(0, lo), H = Math.min(hi, Pf.length - useLen);
  for (let b = L; b <= H; b++) {
    const s = seqScore(A, Pf.slice(b, b + useLen));
    if (s > best.score) best = { b, score: s };
  }
  return best;
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
  const band = 400;                        // 放宽：吸收大段插入/删除
  for (let i = 1; i <= n; i++) {
    cur.fill(NEG); cur[0] = prev[0] - gap; back[i * W] = 1;
    const c = Math.floor(i * m / n);
    const lo = Math.max(1, c - band), hi = Math.min(m, c + band);
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

  // 收集信息
  const info = [];
  files.forEach((f, order) => {
    const V = AL.buildV([f]);
    if (!V.length) return;
    info.push({ f, order, V, F: featV(V), date: enDate(V[0].orig), start: -1 });
  });

  // PSP 日期位置
  const pspDates = [];
  P.forEach((p, i) => { const d = cnDate(p.raw); if (d && p.raw.length < 24) pspDates.push({ i, d }); });
  const usedPos = new Set();

  // ===== 第1轮：有日期文件 =====
  const dated = info.filter(x => x.date !== null).sort((a, b) => a.date - b.date || a.order - b.order);
  for (const it of dated) {
    const cand = pspDates.filter(pd => pd.d === it.date && !usedPos.has(pd.i)).map(pd => pd.i).sort((a, b) => a - b);
    if (cand.length) {
      it.start = cand[0];
    } else {
      // 该日期在 PSP 没有空位 → 特征搜索
      const b = bestStartIn(it.F, Pf, 0, Pf.length - 1);
      it.start = b.b >= 0 ? b.b : 0;
    }
    usedPos.add(it.start);
  }

  // ===== 第2轮：无日期文件 =====
  const noDate = info.filter(x => x.date === null).sort((a, b) => a.order - b.order);
  for (const it of noDate) {
    // 找前一个已分配的文件（按 order）
    let prevStart = -1;
    for (let k = it.order - 1; k >= 0; k--) {
      const c = info.find(x => x.order === k);
      if (c && c.start >= 0) { prevStart = c.start; break; }
    }
    // 下一个未用的 PSP 日期位置（必须 > prevStart）
    const free = pspDates.filter(pd => !usedPos.has(pd.i) && pd.i > prevStart).map(pd => pd.i).sort((a, b) => a - b);
    if (free.length) {
      it.start = free[0];
    } else {
      const b = bestStartIn(it.F, Pf, Math.max(0, prevStart + 1), Pf.length - 1);
      it.start = b.b >= 0 ? Math.max(prevStart + 1, b.b) : Math.max(prevStart + 1, 0);
    }
    usedPos.add(it.start);
  }

  // ===== 同起点错开（按长度比例）=====
  info.sort((a, b) => a.start - b.start || b.V.length - a.V.length);
  {
    const groups = [];
    for (const it of info) {
      const g = groups[groups.length - 1];
      if (g && Math.abs(it.start - g[0].start) <= 8) g.push(it);
      else groups.push([it]);
    }
    for (let gi = 0; gi < groups.length; gi++) {
      const g = groups[gi];
      if (g.length < 2) continue;
      const gStart = g[0].start;
      const gEnd = (gi + 1 < groups.length) ? groups[gi + 1][0].start : P.length;
      const span = Math.max(1, gEnd - gStart);
      const totN = g.reduce((s, x) => s + x.V.length, 0) || 1;
      let cur = gStart;
      for (let k = 0; k < g.length; k++) {
        g[k].start = cur;
        const quota = k === g.length - 1 ? (gEnd - cur) : Math.max(1, Math.round(span * g[k].V.length / totN));
        cur += quota;
      }
    }
  }

  // ===== 区间 DP =====
  info.sort((a, b) => a.start - b.start || a.V.length - b.V.length);
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

console.log('v20 结果：');
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
