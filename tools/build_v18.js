'use strict';
/**
 * v18（A2 最终版）
 * 关键修正：分配日期锚点时，按「(日期, 文件在原列表中的序号)」全局排序，
 * 而不是按原文件顺序——因为分支文件（1806）在列表中靠后，但日期比 1811 早。
 *
 * 另外：同日期多文件时，按 PSP 中该日期出现的次数与文件数做匹配，
 *      PSP 中 8/11 出现 3 次 ↔ 官方 8/11 有 3 个文件（0811, 1811, 2811）。
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
  const useLen = Math.min(40, F.length);
  if (!useLen) return { b: -1, score: -1e9 };
  const A = F.slice(0, useLen);
  let best = { b: -1, score: -1e9 };
  for (let b = Math.max(0, lo); b <= Math.min(hi, Pf.length - useLen); b++) {
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

  const info = [];
  files.forEach((f, order) => {
    const V = AL.buildV([f]);
    if (!V.length) return;
    info.push({ f, order, V, F: featV(V), date: enDate(V[0].orig), start: -1 });
  });

  // PSP 日期行
  const pspDates = [];
  P.forEach((p, i) => { const d = cnDate(p.raw); if (d && p.raw.length < 24) pspDates.push({ i, d }); });

  // ---- 按日期分组，组内按 order 排序；组间按日期排序 ----
  const withDate = info.filter(x => x.date !== null);
  const noDate = info.filter(x => x.date === null);

  // 按日期排序（同日期保持原 order）
  withDate.sort((a, b) => a.date - b.date || a.order - b.order);

  // 对每个有日期文件分配 PSP 位置
  // 策略：同一日期 D 在官方有 n 个文件、在 PSP 有 m 个出现位置
  //      按顺序一一对应（n<=m 时取前 n 个；n>m 时共用）
  const byDate = {};
  for (const it of withDate) (byDate[it.date] = byDate[it.date] || []).push(it);

  const datePos = {};
  for (const x of pspDates) (datePos[x.d] = datePos[x.d] || []).push(x.i);

  const sortedDates = Object.keys(byDate).map(Number).sort((a, b) => a - b);
  for (const d of sortedDates) {
    const group = byDate[d];
    const posList = (datePos[d] || []).slice().sort((a, b) => a - b);
    if (posList.length === 0) {
      // PSP 完全没有该日期：全部用特征定位
      for (const it of group) {
        const b = bestStartIn(it.F, Pf, 0, Pf.length - 1);
        it.start = b.b >= 0 ? b.b : 0;
      }
      continue;
    }
    if (group.length <= posList.length) {
      // 文件数 <= 出现次数：一一对应
      for (let k = 0; k < group.length; k++) group[k].start = posList[k];
    } else {
      // 文件数 > 出现次数：多出来的文件与已有文件共享起点，
      // 后续由「同起点错开」按长度比例分配区间
      for (let k = 0; k < group.length; k++) {
        group[k].start = posList[Math.min(k, posList.length - 1)];
      }
    }
  }

  // 无日期文件（分支）：排在前一个有日期文件之后，用特征定位
  for (const it of noDate) {
    let prevIt = null;
    for (let k = it.order - 1; k >= 0; k--) {
      const cand = info.find(x => x.order === k);
      if (cand && cand.date !== null) { prevIt = cand; break; }
    }
    const lo = prevIt && prevIt.start >= 0 ? prevIt.start : 0;
    const b = bestStartIn(it.F, Pf, lo, Pf.length - 1);
    it.start = b.b >= 0 ? Math.max(lo, b.b) : lo;
  }

  // ---- 同起点错开 ----
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

  // ---- 分配区间 + DP ----
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

console.log('v18 结果（按日期全局排序）：');
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
