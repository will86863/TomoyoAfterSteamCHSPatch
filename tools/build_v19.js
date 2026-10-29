'use strict';
/**
 * v19（A2 完成版）
 * 在 v18 基础上：日期位置采用「全局最优分配」
 *   - 每个文件对每个 PSP 日期位置打分（完整特征匹配）
 *   - 用贪心分配：得分最高者先占位，被占者换次优
 * 这样 seen0715 会以 2.485 的强势得分拿到 [959]，
 * 而 seen1715（无日期）不会抢占它。
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
    info.push({ f, order, V, F: featV(V), date: enDate(V[0].orig), start: -1, score: -1e9 });
  });

  // PSP 日期行
  const pspDates = [];
  P.forEach((p, i) => { const d = cnDate(p.raw); if (d && p.raw.length < 24) pspDates.push({ i, d }); });

  // ==== 为每个文件生成候选位置并打分 ====
  const cands = [];   // {it, b, s}
  for (const it of info) {
    const useLen = Math.min(80, it.V.length);
    const A = it.F.slice(0, useLen);

    // 候选1：该文件日期的所有 PSP 出现位置（强候选）
    if (it.date !== null) {
      for (const pd of pspDates) {
        if (pd.d === it.date && pd.i + useLen <= Pf.length) {
          cands.push({ it, b: pd.i, s: seqScore(A, Pf.slice(pd.i, pd.i + useLen)) + 2.0 });  // 日期命中大奖
        }
      }
    }
    // 候选2：全章扫描（次强）
    let bestB = -1, bestS = -1e9;
    for (let b = 0; b + useLen <= Pf.length; b++) {
      const s = seqScore(A, Pf.slice(b, b + useLen));
      if (s > bestS) { bestS = s; bestB = b; }
    }
    if (bestB >= 0) cands.push({ it, b: bestB, s: bestS });
  }

  // ==== 贪心分配：高分先占位；同文件可占多个候选 ====
  cands.sort((x, y) => y.s - x.s);
  const usedPos = new Set();
  const assigned = new Set();
  for (const c of cands) {
    if (assigned.has(c.it)) continue;       // 每个文件只取一个起点
    if (usedPos.has(c.b)) continue;
    c.it.start = c.b;
    c.it.score = c.s;
    assigned.add(c.it);
    usedPos.add(c.b);
  }
  // 未分配到的：给 0
  for (const it of info) if (it.start < 0) it.start = 0;

  // ==== 同日期组内交换优化：尝试两两交换起点，取总覆盖率更高者 ====
  const cover = (it) => {
    const sorted = info.slice().sort((a, b) => a.start - b.start);
    const k = sorted.indexOf(it);
    const next = k + 1 < sorted.length ? sorted[k + 1].start : P.length;
    const lo = it.start, hi = Math.max(lo + 1, next);
    if (hi <= lo) return 0;
    return dpSegment(it.V, P.slice(lo, Math.min(hi, P.length))).length / it.V.length;
  };
  // 对每个文件，尝试把它挪到其他候选位置，看覆盖率是否提升
  for (const it of info) {
    let bestStart = it.start;
    let bestCov = cover(it);
    const useLen = Math.min(80, it.V.length);
    const A = it.F.slice(0, useLen);
    for (let b = 0; b + useLen <= Pf.length; b += 3) {
      const s = seqScore(A, Pf.slice(b, b + useLen));
      if (s < 1.2) continue;
      const oldStart = it.start;
      it.start = b;
      const cv = cover(it);
      if (cv > bestCov + 0.05) { bestCov = cv; bestStart = b; }
      it.start = oldStart;
    }
    it.start = bestStart;
  }

  // ==== 按起点排序 + 同起点错开 ====
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

  // ==== 分配区间 + DP ====
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

console.log('v19 结果（贪心最优分配）：');
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
