'use strict';
// 对齐 v2：两阶段。先用「说话人 + 长度 + 内容」的多信号 DP 得粗对齐，
// 再对低置信配对做局部窗口重配（允许 1:多 场景下取最优）。
const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const PATCH_DIR = path.join(ROOT, 'patch');
const PSP_DIR = path.join(__dirname, 'psp', 'clean2');
const SEP = /^=+\s*$/;

function parseVl(text) {
  text = text.replace(/^\uFEFF/, '').replace(/\r\n/g, '\n');
  const m = text.match(/^(type [^\n]*\ncount (\d+)[^\n]*\n)/);
  const prefix = m ? m[1] : '';
  const body = m ? text.slice(m[0].length) : text;
  const lines = body.split('\n');
  const entries = [];
  let i = 0;
  while (i < lines.length) {
    const s = lines[i].trim();
    if (s.startsWith('index ') || s.startsWith('length ')) {
      const hdr = []; let j = i;
      while (j < lines.length && !SEP.test(lines[j])) { hdr.push(lines[j]); j++; }
      j++;
      const orig = [];
      while (j < lines.length && !SEP.test(lines[j])) { orig.push(lines[j]); j++; }
      j++;
      let trans = null;
      if (j < lines.length && !SEP.test(lines[j])) {
        const nx = lines[j].trim();
        if (!(nx.startsWith('index ') || nx.startsWith('length '))) {
          const tb = [];
          while (j < lines.length && !SEP.test(lines[j])) { tb.push(lines[j]); j++; }
          trans = tb.join('\n'); j++;
        }
      }
      const meta = {};
      for (const h of hdr) { const p = h.indexOf(' '); if (p > 0) meta[h.slice(0, p)] = h.slice(p + 1); }
      entries.push({ meta, orig: orig.join('\n'), trans, hdr });
      i = j;
    } else i++;
  }
  return { prefix, entries };
}

const SPK2NAME = {
  '智代': 'Tomoyo', '朋也': 'Tomoya', '鹰文': 'Takafumi', '河南子': 'Kanako', '小智': 'Tomo',
  '管理员': 'Caretaker', '有子': 'Yuko', '小川': 'Ogawa', '师傅': 'Boss', '直幸': 'Naoyuki',
  '老师': 'Teacher', '书法老师': 'Calligraphy teacher', '队长': 'Captain', '队员': 'Member',
  '女学生': 'Female student', '男学生': 'Male student', '黑影': 'Dark figure', '熊': 'Bear',
  '熊猫': 'Panda', '村人': 'Villager', '母亲': 'Mother', '父亲': 'Father',
  '少女': 'Young girl', '小孩': 'Child', '医生': 'Doctor', '医师': 'Doctor',
  '老人': 'Elderly man', '老婆婆': 'Old woman', '声': 'Voice', '女性': 'Woman', '男': 'Man',
  '女子': 'Girl', '主妇': 'Housewife', '主妇Ａ': 'Housewife A', '主妇Ｂ': 'Housewife B',
  '初老的男人': 'Elderly man', '初老的女性': 'Old woman', '側近': 'Attendant',
};

const normCN = (s) => (s || '').replace(/[\u300c\u300d\u201c\u201d\u300e\u300f『』]/g, '').replace(/[^\u4e00-\u9fff]/g, '');
const normName = (s) => (s || '').toLowerCase().replace(/[^a-z]/g, '');

// ---- 说话人等价组（PSP 叫法 → 官方 name 候选集）----
const EQUIV = {
  '智代': ['Tomoyo'], '朋也': ['Tomoya'], '鹰文': ['Takafumi'], '河南子': ['Kanako'], '小智': ['Tomo'],
  '管理员': ['Caretaker'], '有子': ['Yuko'], '小川': ['Ogawa'], '师傅': ['Boss'], '直幸': ['Naoyuki'],
  '老师': ['Teacher'], '书法老师': ['Calligraphy teacher'], '队长': ['Captain'], '部员': ['Member', 'Captain'],
  '女学生': ['Female student', 'Girl student'], '男学生': ['Male student', 'Boy student'],
  '女性': ['Woman', 'Girl', 'Old woman', 'Elderly woman'],
  '女子': ['Girl', 'Young girl', 'Female student', 'Woman'],
  '少女': ['Young girl', 'Girl'],
  '男': ['Man', 'Male student', 'Boy student'],
  '声': ['Voice'], '黑影': ['Dark figure'], '村人': ['Villager'],
  '母亲': ['Mother'], '父亲': ['Father'], '小孩': ['Child', 'Little girl'],
  '医生': ['Doctor'], '医师': ['Doctor'], '老人': ['Elderly man'],
  '老婆婆': ['Old woman', 'Elderly woman'],
  '主妇': ['Housewife'], '主妇Ａ': ['Housewife A'], '主妇Ｂ': ['Housewife B'],
  '初老的男人': ['Elderly man'], '初老的女性': ['Old woman', 'Elderly woman'],
  '熊': ['Bear', 'Panda'], '熊猫': ['Panda', 'Bear'], '側近': ['Attendant'],
};
const NARRATOR_MATCHABLE = new Set(['Tomoya', 'Tomoyo', 'Tomo', 'Kanako', 'Takafumi', 'Yuko']);

function spkEquiv(officialName, pspSpk) {
  if (!pspSpk) {
    // PSP 旁白 vs 官方有名字：可能是括号独白，弱匹配
    if (!officialName) return 'ok';
    return NARRATOR_MATCHABLE.has(officialName) ? 'weak' : 'no';
  }
  if (!officialName) return 'weak';         // PSP 有说话人但官方是旁白：轻度不匹配
  const cands = EQUIV[pspSpk];
  if (!cands) return 'unknown';
  return cands.some(c => normName(c) === normName(officialName)) ? 'ok' : 'no';
}
function g3(s) { const g = new Set(); for (let i = 0; i + 3 <= s.length; i++) g.add(s.slice(i, i + 3)); return g; }
function dice(a, b) {
  if (!a.size || !b.size) return 0;
  let n = 0; const [x, y] = a.size < b.size ? [a, b] : [b, a];
  for (const k of x) if (y.has(k)) n++;
  return (2 * n) / (a.size + b.size);
}
const enWords = (s) => { const w = (s || '').replace(/\\"/g, '"').match(/[A-Za-z][A-Za-z'\-]*/g); return w ? w.length : 0; };

function splitPSP(line) {
  let s = (line || '').trim();
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

const MAP = {
  '0628': ['seen0628', 'seen0629', 'seen0630', 'seen0701', 'seen0702'],
  '0707': ['seen0707', 'seen0708', 'seen0709', 'seen0710', 'seen1710'],
  '0711': ['seen0711', 'seen0712', 'seen0713'],
  '0714': ['seen0714', 'seen0715', 'seen1714', 'seen1715'],
  '0716': ['seen0716', 'seen0717', 'seen1716'],
  '0720': ['seen0720', 'seen0721', 'seen0722', 'seen0723', 'seen0724', 'seen0725', 'seen0726', 'seen0727', 'seen0728', 'seen0729', 'seen0744'],
  '0801': ['seen0801', 'seen0803', 'seen0804', 'seen0806', 'seen0807', 'seen0808', 'seen0809', 'seen0810', 'seen0811', 'seen1806', 'seen1811', 'seen2811'],
  '0812': ['seen0812', 'seen0813', 'seen0814', 'seen0815', 'seen0816', 'seen0817', 'seen0818', 'seen0819', 'seen0820', 'seen0821', 'seen0822', 'seen0823', 'seen1813', 'seen1814', 'seen2813', 'seen2814', 'seen3814', 'seen4814'],
  '5000': ['seen5000', 'seen5001', 'seen5002', 'seen5003', 'seen5004', 'seen5005'],
  '5006': ['seen5006', 'seen5007', 'seen5008'],
};

function buildV(files) {
  const V = [];
  for (const f of files) {
    const fp = path.join(PATCH_DIR, f + '.txt');
    if (!fs.existsSync(fp)) continue;
    const { entries } = parseVl(fs.readFileSync(fp, 'utf8'));
    entries.forEach((e, i) => {
      const cn = e.trans && /[\u4e00-\u9fff]/.test(e.trans) ? e.trans : null;
      const nm = e.meta.name && e.meta.name !== 'NULL' ? e.meta.name : null;
      V.push({
        file: f, i, meta: e.meta, orig: e.orig, trans: e.trans, cn,
        g: cn ? g3(normCN(cn)) : new Set(), nm, enW: enWords(e.orig),
        len: parseInt(e.meta.length || '0', 10),
      });
    });
  }
  return V;
}

function loadPSP(ch) {
  const fp = path.join(PSP_DIR, ch + '.txt');
  const lines = fs.readFileSync(fp, 'utf8').split(/\r?\n/).filter(s => s.trim());
  const P = [];
  for (const line of lines) for (const p of splitPSP(line)) {
    const n = normCN(p.txt);
    P.push({ raw: p.txt, spk: p.spk, n, g: g3(n) });
  }
  return P;
}

// 配对打分
function pairScore(v, p, opt) {
  let w = 0;
  const hasCn = !!v.cn;
  if (hasCn && v.g.size && p.g.size) w += 1.2 * dice(v.g, p.g);
  else w += 0.25; // 无中文时给中性基准
  // 长度
  const exp = Math.max(2, v.enW * 1.85);
  w -= 0.5 * Math.abs(Math.log((p.n.length + 1.5) / (exp + 1.5)));
  // 说话人（宽松等价组匹配）
  const se = spkEquiv(v.nm, p.spk);
  if (se === 'ok') w += 0.85;
  else if (se === 'weak') w += 0.15;     // 旁白里可能藏括号独白
  else if (se === 'unknown') w += 0.05;  // 未知说话人，不奖不罚
  else w -= 0.85;
  return w;
}

function dpAlign(V, P, o = {}) {
  const band = o.band ?? 500, gap = o.gap ?? 0.35;
  const n = V.length, m = P.length, NEG = -1e18, W = m + 1;
  const back = new Uint8Array((n + 1) * W);
  let prev = new Float64Array(W).fill(NEG); prev[0] = 0;
  let cur = new Float64Array(W);
  for (let i = 1; i <= n; i++) {
    cur.fill(NEG);
    cur[0] = prev[0] - gap;
    back[i * W] = 1;
    const c = Math.floor(i * m / n);
    const lo = Math.max(1, c - band), hi = Math.min(m, c + band);
    for (let j = lo; j <= hi; j++) {
      let best = NEG, bk = 1;
      if (prev[j] > NEG / 2) { best = prev[j] - gap; bk = 1; }
      if (cur[j - 1] > NEG / 2 && cur[j - 1] - gap > best + 1e-12) { best = cur[j - 1] - gap; bk = 2; }
      if (prev[j - 1] > NEG / 2) {
        const cand = prev[j - 1] + pairScore(V[i - 1], P[j - 1], o);
        if (cand > best + 1e-12) { best = cand; bk = 0; }
      }
      cur[j] = best; back[i * W + j] = bk;
    }
    const t = prev; prev = cur; cur = t;
  }
  let i = n, j = m;
  const pairs = [], onlyV = [], onlyP = [];
  while (i > 0 || j > 0) {
    const bk = back[i * W + j];
    if (i > 0 && j > 0 && bk === 0) { pairs.push([i - 1, j - 1]); i--; j--; }
    else if (i > 0 && (j === 0 || bk === 1)) { onlyV.push(i - 1); i--; }
    else { onlyP.push(j - 1); j--; }
  }
  return { pairs: pairs.reverse(), onlyV: onlyV.reverse(), onlyP: onlyP.reverse() };
}

module.exports = { ROOT, PATCH_DIR, PSP_DIR, MAP, SPK2NAME, EQUIV, NARRATOR_MATCHABLE, spkEquiv, parseVl, buildV, loadPSP, splitPSP, normCN, g3, dice, normName, enWords, dpAlign, pairScore };
