'use strict';
/**
 * v15（A2 完成版）
 * 在 v12 基础上增加「同日期冲突消解」：
 *
 * 判据（按优先级）：
 *   1. 人称/数量特征：英文首句里的 "I ... alone/single" vs "Tomoyo and I" vs "we"
 *      → 对照 PSP 首句的中文「我一个人」/「我和智代」/「我们」
 *   2. 角色出现集合：文件里出现的说话人集合 vs PSP 段落的说话人集合
 *   3. 条目数比例：给冲突组按长度分配区间
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

// ---- 特征 ----
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
function allStarts(F, Pf) {
  const useLen = Math.min(40, F.length);
  const A = F.slice(0, useLen);
  const arr = [];
  for (let b = 0; b + useLen <= Pf.length; b++) arr.push({ b, score: seqScore(A, Pf.slice(b, b + useLen)) });
  arr.sort((x, y) => y.score - x.score);
  return arr;
}

// ---- 人称/数量特征提取（关键判据） ----
// 返回：'alone'（只我一人）/ 'with-other'（我+别人）/ 'we'（我们）/ 'mono'（无主语）
function personSig(enText) {
  const t = (enText || '').replace(/\\"/g, '"').toLowerCase();
  if (/\balone\b|\bby myself\b|\bmyself\b|\bsingle\b/.test(t)) return 'alone';
  if (/\bwe\b|\bour\b|\bus\b/.test(t)) return 'we';
  if (/\btomoyo and i\b|\bi and tomoyo\b|\bboth of us\b|\bthe two of us\b/.test(t)) return 'with-other';
  if (/\b(takafumi|kanako|tomo) and i\b/.test(t)) return 'with-other';
  return 'mono';
}
// PSP 中文判断
function personSigCN(cnText) {
  const t = cnText || '';
  if (/一个人|独自|只身|孤身/.test(t)) return 'alone';
  if (/我们|咱俩|二人|两人|两个人/.test(t)) return 'we';
  if (/和.{1,5}(一起|两人|俩)/.test(t) || /我们俩/.test(t)) return 'with-other';
  return 'mono';
}

// 取文件前 N 条中第一条有主语特征的（跳过日期行）
function filePersonSig(V) {
  for (let i = 1; i < Math.min(12, V.length); i++) {
    const s = personSig(V[i].orig);
    if (s !== 'mono') return { sig: s, idx: i };
  }
  return { sig: 'mono', idx: -1 };
}
function pspPersonSig(P, start) {
  for (let i = start + 1; i < Math.min(start + 12, P.length); i++) {
    const s = personSigCN(P[i].raw);
    if (s !== 'mono') return { sig: s, idx: i };
  }
  return { sig: 'mono', idx: -1 };
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

  // 初定位 + 取全部候选
  const info = [];
  for (const f of files) {
    const V = AL.buildV([f]);
    if (!V.length) continue;
    const F = featV(V);
    const arr = allStarts(F, Pf);
    const sig = filePersonSig(V);
    info.push({ f, V, F, sig, cands: arr.slice(0, 6), start: arr[0].b, score: arr[0].score });
  }

  // ---- 冲突消解：起点相近的组，用人称特征重新分配 ----
  info.sort((a, b) => a.start - b.start);
  let changed = true;
  let guard = 0;
  while (changed && guard++ < 8) {
    changed = false;
    for (let i = 0; i < info.length; i++) {
      for (let j = i + 1; j < info.length; j++) {
        const A = info[i], B = info[j];
        if (Math.abs(A.start - B.start) > 15) continue;
        // 冲突！用人称特征区分
        const pA = pspPersonSig(P, A.start);
        const pB = pspPersonSig(P, B.start);
        // 如果 A 在 B 的位置上特征更吻合，就交换/重定位
        const fix = (self, other) => {
          // self 在 other.start 处是否更匹配？
          if (self.sig.sig === 'mono') return false;
          const pAtOther = pspPersonSig(P, other.start);
          const pAtSelf = pspPersonSig(P, self.start);
          const okOther = self.sig.sig === pAtOther.sig;
          const okSelf = self.sig.sig === pAtSelf.sig;
          if (okSelf) return false;
          if (okOther) {
            // 找该位置是否已被占用的是 other
            self.start = other.start;
            self.score = Math.max(self.score, 0);
            return true;
          }
          // 都不匹配 → 用候选列表里第一个 sig 匹配的
          for (const c of self.cands) {
            if (c.b === other.start) continue;
            const sigC = pspPersonSig(P, c.b);
            if (self.sig.sig === sigC.sig) { self.start = c.b; self.score = c.score; return true; }
          }
          return false;
        };
        if (fix(A, B)) { changed = true; }
        else if (fix(B, A)) { changed = true; }
      }
    }
    info.sort((a, b) => a.start - b.start);
  }

  // 分配区间并 DP
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

console.log('v15 结果（含人称冲突消解）：');
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
