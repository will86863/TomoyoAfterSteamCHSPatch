// 对齐验证：用已译文件（0628/0629/0630/0701/0702）验证「官方骨架 ↔ PSP」能否精确配对
const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const PATCH = path.join(ROOT, 'patch');
const PSP = path.join(__dirname, 'psp', 'clean2');

function parseVl(text) {
  const m = text.match(/^(type [^\n]*\ncount \d+[^\n]*\n)/);
  const body = m ? text.slice(m[0].length) : text;
  const lines = body.replace(/\r\n/g, '\n').split('\n');
  const isSep = (s) => /^=+\s*$/.test(s);
  const out = [];
  let i = 0;
  while (i < lines.length) {
    const s = lines[i].trim();
    if (s.startsWith('index ') || s.startsWith('length ')) {
      const hdr = []; let j = i;
      while (j < lines.length && !isSep(lines[j])) { hdr.push(lines[j]); j++; }
      j++;
      const orig = [];
      while (j < lines.length && !isSep(lines[j])) { orig.push(lines[j]); j++; }
      j++;
      let trans = null;
      if (j < lines.length && !isSep(lines[j])) {
        const nxt = lines[j].trim();
        if (!(nxt.startsWith('index ') || nxt.startsWith('length '))) {
          const tb = [];
          while (j < lines.length && !isSep(lines[j])) { tb.push(lines[j]); j++; }
          trans = tb.join('\n'); j++;
        }
      }
      const meta = {};
      for (const h of hdr) { const p = h.indexOf(' '); if (p > 0) meta[h.slice(0, p)] = h.slice(p + 1); }
      out.push({ meta, orig: orig.join('\n'), trans });
      i = j;
    } else i++;
  }
  return out;
}

const SPK2NAME = {
  '智代': 'Tomoyo', '朋也': 'Tomoya', '鹰文': 'Takafumi', '河南子': 'Kanako', '小智': 'Tomo',
  '管理员': 'Caretaker', '有子': 'Yuko', '小川': 'Ogawa', '师傅': 'Boss', '直幸': 'Naoyuki',
  '老师': 'Sensei', '书法老师': 'Calligraphy teacher', '队长': 'Captain', '队员': 'Member',
  '女学生': 'Girl student', '男学生': 'Boy student', '黑影': 'Dark figure', '熊': 'Bear',
  '熊猫': 'Panda', '村人': 'Villager', '母亲': 'Mother', '父亲': 'Father',
  '少女': 'Young girl', '小孩': 'Child', '医生': 'Doctor', '医师': 'Doctor',
  '老人': 'Elderly man', '老婆婆': 'Old woman', '声': 'Voice', '女性': 'Woman', '男': 'Man',
  '女子': 'Girl', '主妇': 'Housewife', '主妇Ａ': 'Housewife A', '主妇Ｂ': 'Housewife B',
};
const normName = (s) => (s || '').toLowerCase().replace(/[^a-z]/g, '');

function splitPSP(line) {
  const s = line.trim();
  if (!s) return [];
  const out = [];
  const re = /([^「」]{0,12})「([^「」]*)」?/g;
  let m, last = 0, found = false;
  while ((m = re.exec(s)) !== null) {
    if (m.index > last) { const p = s.slice(last, m.index).trim(); if (p) out.push({ spk: null, txt: p }); }
    const spk = m[1].trim();
    out.push({ spk: spk && spk.length <= 10 ? spk : null, txt: m[2].trim() });
    last = re.lastIndex; found = true;
  }
  if (!found) return [{ spk: null, txt: s }];
  if (last < s.length) { const t = s.slice(last).trim(); if (t) out.push({ spk: null, txt: t }); }
  return out.filter(x => x.txt);
}

function normCN(s) { return (s || '').replace(/[\u300c\u300d\u201c\u201d\u300e\u300f『』]/g, '').replace(/[^\u4e00-\u9fff]/g, ''); }
function g3(s) { const g = new Set(); for (let i = 0; i + 3 <= s.length; i++) g.add(s.slice(i, i + 3)); return g; }
function dice(a, b) { if (!a.size || !b.size) return 0; let n = 0; const [x, y] = a.size < b.size ? [a, b] : [b, a]; for (const k of x) if (y.has(k)) n++; return (2 * n) / (a.size + b.size); }

const FILES = ['seen0628', 'seen0629', 'seen0630', 'seen0701', 'seen0702'];
const V = [];
for (const f of FILES) {
  const ents = parseVl(fs.readFileSync(path.join(PATCH, f + '.txt'), 'utf8'));
  ents.forEach((e, i) => {
    const zh = normCN(e.trans || '');
    const nm = e.meta.name && e.meta.name !== 'NULL' ? e.meta.name : null;
    V.push({ file: f, i, orig: e.orig, trans: e.trans, zh, g: g3(zh), nm });
  });
}
const P = [];
for (const l of fs.readFileSync(path.join(PSP, '0628.txt'), 'utf8').split(/\r?\n/).filter(s => s.trim())) {
  for (const p of splitPSP(l)) { const n = normCN(p.txt); P.push({ raw: p.txt, spk: p.spk, n, g: g3(n) }); }
}
console.log(`官方(5文件) ${V.length} 条 | PSP ${P.length} 句`);

// DP 对齐
const n = V.length, m = P.length, NEG = -1e18, W = m + 1;
const back = new Uint8Array((n + 1) * W);
let prev = new Float64Array(W).fill(NEG); prev[0] = 0;
let cur = new Float64Array(W);
const gap = 0.05, band = 400;
for (let i = 1; i <= n; i++) {
  cur.fill(NEG); cur[0] = prev[0] - gap; back[i * W] = 1;
  const c = Math.floor(i * m / n);
  for (let j = Math.max(1, c - band); j <= Math.min(m, c + band); j++) {
    let best = NEG, bk = 1;
    if (prev[j] > NEG / 2) { best = prev[j] - gap; bk = 1; }
    if (cur[j - 1] > NEG / 2 && cur[j - 1] - gap > best + 1e-12) { best = cur[j - 1] - gap; bk = 2; }
    if (prev[j - 1] > NEG / 2) {
      const s = dice(V[i - 1].g, P[j - 1].g);
      let w = s;
      const a = V[i - 1].nm, b = P[j - 1].spk;
      if (a && b) { const mp = SPK2NAME[b]; if (mp && normName(mp) === normName(a)) w += 0.05; else w -= 0.05; }
      else if (!a && !b) w += 0.03; else w -= 0.03;
      const cand = prev[j - 1] + w;
      if (cand > best + 1e-12) { best = cand; bk = 0; }
    }
    cur[j] = best; back[i * W + j] = bk;
  }
  [prev, cur] = [cur, prev];
}
let i = n, j = m; const pairs = [];
while (i > 0 || j > 0) {
  const bk = back[i * W + j];
  if (i > 0 && j > 0 && bk === 0) { pairs.push([i - 1, j - 1]); i--; j--; }
  else if (i > 0 && (j === 0 || bk === 1)) i--;
  else j--;
}
pairs.reverse();

const sims = pairs.map(([a, b]) => dice(V[a].g, P[b].g));
const sorted = [...sims].sort((x, y) => x - y);
const q = (p) => sorted[Math.floor(p * (sorted.length - 1))].toFixed(3);
let ok = 0, bad = 0;
for (const [a, b] of pairs) {
  const an = V[a].nm, bp = P[b].spk, mp = bp ? SPK2NAME[bp] : null;
  if (an && mp) { if (normName(mp) === normName(an)) ok++; else bad++; }
}
console.log(`配对 ${pairs.length} | 相似度 中位=${q(0.5)} p25=${q(0.25)} p75=${q(0.75)}`);
console.log(`说话人一致 ${ok} / 冲突 ${bad}  (一致率 ${(100 * ok / (ok + bad)).toFixed(1)}%)`);
console.log('\n--- 抽样 20 对 ---');
for (let k = 0; k < Math.min(20, pairs.length); k++) {
  const [a, b] = pairs[k];
  console.log(`[${V[a].file}#${a}] ${V[a].nm || '旁白'} | ${V[a].trans}`);
  console.log(`        PSP: ${P[b].raw}`);
}
