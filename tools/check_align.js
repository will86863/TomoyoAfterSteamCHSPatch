// 对齐可行性验证：官方未译骨架 × PSP 汉化文本
const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const PATCH = path.join(ROOT, 'patch');
const PSP = path.join(__dirname, 'psp', 'clean2');

// ---------- 解析官方补丁 ----------
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

// ---------- 说话人映射（PSP 中文 → 官方英文 name） ----------
const SPK2NAME = {
  '智代': 'Tomoyo', '朋也': 'Tomoya', '鹰文': 'Takafumi', '河南子': 'Kanako', '小智': 'Tomo',
  '管理员': 'Caretaker', '有子': 'Yuko', '小川': 'Ogawa', '师傅': 'Boss', '直幸': 'Naoyuki',
  '老师': 'Sensei', '书法老师': 'Calligraphy teacher', '队长': 'Captain', '队员': 'Member',
  '女学生': 'Girl student', '男学生': 'Boy student', '黑影': 'Dark figure', '熊': 'Bear',
  '熊猫': 'Panda', '村人': 'Villager', '村人': 'Villager', '母亲': 'Mother', '父亲': 'Father',
  '少女': 'Young girl', '小孩': 'Child', '医生': 'Doctor', '医师': 'Doctor',
  '老人': 'Elderly man', '老婆婆': 'Old woman', '声': 'Voice', '女性': 'Woman', '男': 'Man',
  '女子': 'Girl', '主妇': 'Housewife', '主妇Ａ': 'Housewife A', '主妇Ｂ': 'Housewife B',
  '初老的男人': 'Elderly man', '初老的女性': 'Old woman', '側近': 'Attendant',
};
const normName = (s) => (s || '').toLowerCase().replace(/[^a-z]/g, '');

// ---------- 清洗 PSP 行 → 句子 ----------
function isDirty(s) { return /[\uE000-\uF8FF\uFFFD\u0080-\u00FF]/.test(s); }
function splitPSP(line) {
  const s = line.trim();
  if (!s) return [];
  if (isDirty(s)) return [{ spk: null, txt: s, dirty: true }];
  const out = [];
  const re = /([^「」]{0,12})「([^「」]*)」?/g;
  let m, last = 0, found = false;
  while ((m = re.exec(s)) !== null) {
    if (m.index > last) {
      const plain = s.slice(last, m.index).trim();
      if (plain) out.push({ spk: null, txt: plain });
    }
    const spk = m[1].trim();
    out.push({ spk: spk && spk.length <= 10 ? spk : null, txt: m[2].trim(), unclosed: !s.slice(m.index, re.lastIndex).endsWith('」') });
    last = re.lastIndex; found = true;
  }
  if (!found) return [{ spk: null, txt: s }];
  if (last < s.length) { const t = s.slice(last).trim(); if (t) out.push({ spk: null, txt: t }); }
  return out.filter(x => x.txt);
}

// ---------- 归一化 ----------
function normCN(s) { return (s || '').replace(/[\u300c\u300d\u201c\u201d\u300e\u300f『』]/g, '').replace(/[^\u4e00-\u9fff]/g, ''); }
function g3(s) { const g = new Set(); for (let i = 0; i + 3 <= s.length; i++) g.add(s.slice(i, i + 3)); return g; }
function dice(a, b) { if (!a.size || !b.size) return 0; let n = 0; const [x, y] = a.size < b.size ? [a, b] : [b, a]; for (const k of x) if (y.has(k)) n++; return (2 * n) / (a.size + b.size); }

// ---------- 章节映射（PSP 一章 = 官方多场景） ----------
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
  const v = [];
  for (const f of files) {
    const fp = path.join(PATCH, f + '.txt');
    if (!fs.existsSync(fp)) continue;
    const ents = parseVl(fs.readFileSync(fp, 'utf8'));
    ents.forEach((e, i) => {
      const zh = normCN(e.trans || e.orig || '');
      const nm = e.meta.name && e.meta.name !== 'NULL' ? e.meta.name : null;
      v.push({ file: f, idx: i, meta: e.meta, orig: e.orig, trans: e.trans, g: g3(normCN(e.orig || '')), nm });
    });
  }
  return v;
}

function buildP(ch) {
  const fp = path.join(PSP, ch + '.txt');
  const raw = fs.readFileSync(fp, 'utf8').split(/\r?\n/).filter(s => s.trim());
  const P = [];
  for (const line of raw) for (const p of splitPSP(line)) {
    const n = normCN(p.txt);
    P.push({ raw: p.txt, spk: p.spk, dirty: !!p.dirty, n, g: g3(n) });
  }
  return P;
}

// 用英文原文做相似度基准：英文与中文无法比，改用「译文已是中文的文件」做锚
// 因此这里只统计句子数对比与说话人结构，供规划参考
for (const ch of Object.keys(MAP)) {
  const V = buildV(MAP[ch]);
  const P = buildP(ch);
  const vSpk = V.filter(x => x.nm).length;
  const pSpk = P.filter(x => x.spk).length;
  const pDirty = P.filter(x => x.dirty).length;
  console.log(`${ch}: 官方 ${V.length} 条（有说话人 ${vSpk}）| PSP ${P.length} 句（有说话人 ${pSpk}，脏行 ${pDirty}）`);
}
