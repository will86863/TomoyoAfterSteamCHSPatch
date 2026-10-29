'use strict';
/**
 * v24：基于「文件区间」的强制 DP 重映射（最终版）
 *
 * 保留 v22 的区间起点（已验证准确），但区间内一律用 DP 重新配对，
 * 不再直接采用 map_chapter 的逐条结果（那是无区间约束的整章对齐，会漂移）。
 *
 * 区间来源优先级：
 *   1. map_dated 的起点（日期锚定，最准）
 *   2. map_chapter 的首个映射位置
 *   3. 特征序列搜索
 */
const fs = require('fs');
const path = require('path');
const AL = require('./alignlib.js');

const datedMap = JSON.parse(fs.readFileSync(path.join(__dirname, 'maps', 'map_dated.json'), 'utf8'));

const INLINE_RE = /^(朋也|智代|鹰文|河南子|小智|有子|管理员|小川|直幸|师傅|村人|老人|少女|女子|女性|男|医生)\s*(?=[（(「『])/;
const stripName = (s) => (s || '').trim().replace(INLINE_RE, '');
const MARKER_RE = /^(BAD END|GAME OVER|TO BE CONTINUED|Ending|Epilogue|Prologue|Title|Menu|Save|Load|OK|Cancel|Yes|No|Back|Next)$/i;
const isMarker = (s) => MARKER_RE.test((s || '').replace(/\\"/g, '"').trim());

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
  for (let b = Math.max(0, lo); b <= Math.min(hi, Pf.length - useLen); b++) {
    const s = seqScore(A, Pf.slice(b, b + useLen));
    if (s > best.score) best = { b, score: s };
  }
  return best;
}

// 强 DP：区间内逐条配对，奖励说话人+长度
function scorePair(v, p) {
  const se = AL.spkEquiv(v.nm, p.spk);
  const exp = Math.max(2, v.enW * 1.85);
  const lr = (p.n.length + 1.5) / (exp + 1.5);
  let s = 0;
  if (se === 'ok') s += 4; else if (se === 'unknown') s += 2;
  else if (se === 'weak') s += 1; else s -= 6;
  if (lr > 0.6 && lr < 1.7) s += 3.5;
  else if (lr > 0.5 && lr < 2.0) s += 2;
  else if (lr > 0.42 && lr < 2.3) s += 0.8;
  else s -= 3;
  if (isMarker(v.orig)) s -= 10;
  return s;
}
function dpStrict(Vs, Ps, gap = 0.25) {
  const n = Vs.length, m = Ps.length;
  if (!n || !m) return [];
  const NEG = -1e18, W = m + 1;
  const back = new Uint8Array((n + 1) * W);
  let prev = new Float64Array(W).fill(NEG); prev[0] = 0;
  let cur = new Float64Array(W);
  for (let i = 1; i <= n; i++) {
    cur.fill(NEG); cur[0] = prev[0] - gap; back[i * W] = 1;
    const c = Math.floor(i * m / n);
    const lo = Math.max(1, c - 300), hi = Math.min(m, c + 300);
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
  for (const f of files) result[ch][f] = {};

  // 确定每个文件的起点
  const starts = [];
  for (const f of files) {
    const V = AL.buildV([f]);
    if (!V.length) continue;
    let start = -1;
    // 优先用 dated 的映射位置
    const dm = datedMap[ch] && datedMap[ch][f] ? datedMap[ch][f] : null;
    if (dm) {
      const keys = Object.keys(dm).map(Number).sort((a, b) => a - b);
      if (keys.length && keys[0] === 0) {
        // 首条被映射说明起点正确，反查它在 PSP 的位置
        const pspText = dm[keys[0]];
        const idx = P.findIndex(p => p.raw === pspText);
        if (idx >= 0) start = idx;
      }
    }
    if (start < 0) {
      const b = bestStartIn(featV(V), Pf, 0, Pf.length - 1);
      start = b.b >= 0 ? b.b : 0;
    }
    starts.push({ f, V, start });
  }

  // 按起点排序，分配区间
  starts.sort((a, b) => a.start - b.start);
  let mapped = 0;
  const locInfo = [];

  for (let k = 0; k < starts.length; k++) {
    const cur = starts[k];
    const next = (k + 1 < starts.length) ? starts[k + 1].start : P.length;
    const lo = Math.max(0, cur.start);
    const hi = Math.max(lo + 1, next);
    const Ps = P.slice(lo, Math.min(hi, P.length));
    if (!Ps.length) continue;
    const pairs = dpStrict(cur.V, Ps);
    for (const [a, b] of pairs) {
      result[ch][cur.f][cur.V[a].i] = Ps[b].raw;
      mapped++;
    }
    locInfo.push(`${cur.f}@${lo}(${pairs.length}/${cur.V.length})`);
  }

  report.push({ ch, official: starts.reduce((s, x) => s + x.V.length, 0), psp: P.length, mapped, locInfo });
}

console.log('v24 结果（区间强制 DP）：');
for (const r of report) {
  console.log(`  ${r.ch}: 官方${String(r.official).padStart(5)} PSP${String(r.psp).padStart(5)} 映射${String(r.mapped).padStart(5)} (${(100 * r.mapped / r.official).toFixed(0)}%)`);
  console.log(`       ${r.locInfo.join(' ')}`);
}

fs.writeFileSync('map_v24.json', JSON.stringify(result), 'utf8');
let tot = 0;
for (const ch of Object.keys(result)) for (const f of Object.keys(result[ch])) tot += Object.keys(result[ch][f]).length;
console.log(`\n写入 map_v24.json，共 ${tot} 条`);
