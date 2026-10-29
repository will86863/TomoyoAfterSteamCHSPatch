'use strict';
/**
 * 生产脚本：把 PSP 汉化译文按官方补丁格式回填
 * 用法: node build_patch.js [--dry]
 * 输出: out_patch/  （结构完全同 _patch_src/patch，仅替换译文块）
 */
const fs = require('fs');
const path = require('path');
const AL = require('./alignlib.js');

const DRY = process.argv.includes('--dry');
const OUT = process.env.PATCH_OUT || AL.PATCH_DIR; // 默认读仓库 patch/；如需检查 build_patch 的中间产物，设 PATCH_OUT=./out_patch
const BACKUP = path.join(__dirname, 'backup_patch');

fs.mkdirSync(OUT, { recursive: true });

// 界面/标记短语：不允许用剧情译文覆盖
const MARKER_RE = /^(BAD END|GAME OVER|TO BE CONTINUED|Ending|Epilogue|Prologue|Title|Menu|Save|Load|OK|Cancel|Yes|No|Back|Next)$/i;
// PSP 心理独白形如「朋也（……）」，官方格式里角色名已在 name 字段，正文需剥离前缀
const INLINE_NAME_RE = /^(朋也|智代|鹰文|河南子|小智|有子|管理员|小川|直幸|师傅|村人|老人|少女|女子|女性|男|医生)\s*(?=[（(「『])/;
function stripInlineName(s) {
  const t = (s || '').trim();
  return t.replace(INLINE_NAME_RE, '');
}

function isMarkerText(s) {
  const t = (s || '').replace(/\\"/g, '"').trim();
  return MARKER_RE.test(t);
}

// ---------- 1. 处理有 PSP 对应的章节 ----------
const stats = [];
const pspMapAll = {};   // seenFile -> Map(entryIdx -> {psp, score, spkOk})

for (const ch of Object.keys(AL.MAP)) {
  const files = AL.MAP[ch];
  const V = AL.buildV(files);
  const P = AL.loadPSP(ch);
  const { pairs, onlyV, onlyP } = AL.dpAlign(V, P);

  let adopted = 0, lowConf = 0, skipped = 0;
  const map = {};
  for (const f of files) map[f] = new Map();

  for (const [a, b] of pairs) {
    const v = V[a], p = P[b];
    // 质量闸门
    // 说话人等价组判定：ok=同类 / weak=旁白可能藏独白 / unknown=未知 / no=冲突
    const se = AL.spkEquiv(v.nm, p.spk);
    const spkOk = (se === 'ok' || se === 'unknown');
    const spkWeak = (se === 'weak');
    const sim = v.cn && v.g.size ? AL.dice(v.g, p.g) : -1;
    const exp = Math.max(2, v.enW * 1.85);
    const lenRatio = (p.n.length + 1.5) / (exp + 1.5);
    const lenOk = lenRatio > 0.4 && lenRatio < 2.4;

    // 采用条件：说话人一致 且 长度合理
    // 注：不用「与现有译文的相似度」当门槛——两版是独立翻译，用词天然不同，
    //     用它筛会把大量正确配对误杀。相似度仅作参考记录。
    // weak（旁白↔独白）只有在长度和内容都不错时才接受
    const weakOk = spkWeak && lenOk && lenRatio > 0.55 && lenRatio < 1.9;
    const ok = (spkOk || weakOk) && lenOk && !isMarkerText(v.orig);

    if (ok) {
      map[v.file].set(v.i, { psp: stripInlineName(p.raw), spk: p.spk, score: sim, spkOk });
      adopted++;
    } else {
      lowConf++;
    }
  }
  pspMapAll[ch] = map;
  stats.push({ ch, V: V.length, P: P.length, pairs: pairs.length, adopted, lowConf, onlyV: onlyV.length, onlyP: onlyP.length });
}

console.log('章节对齐结果：');
for (const s of stats) {
  console.log(`  ${s.ch}: 官方${s.V} PSP${s.P} 配对${s.pairs} | 采用${s.adopted} 低信${s.lowConf} | 仅V${s.onlyV} 仅P${s.onlyP}`);
}
const totAdopt = stats.reduce((a, b) => a + b.adopted, 0);
console.log(`\nPSP 译文可回填合计: ${totAdopt} 条`);

// ---------- 2. 写回文件 ----------
if (DRY) { console.log('\n[dry] 不写文件'); process.exit(0); }

// 反查：文件 → 章
const fileToCh = {};
for (const ch of Object.keys(AL.MAP)) for (const f of AL.MAP[ch]) fileToCh[f] = ch;

const allFiles = fs.readdirSync(AL.PATCH_DIR).filter(f => f.endsWith('.txt')).sort();
let changed = 0, filled = 0, untouched = 0;
const detail = [];

for (const fname of allFiles) {
  const base = fname.replace('.txt', '');
  const src = path.join(AL.PATCH_DIR, fname);
  const raw = fs.readFileSync(src, 'utf8');
  const { prefix, entries } = AL.parseVl(raw);
  const ch = fileToCh[base];
  const mp = ch && pspMapAll[ch] ? pspMapAll[ch][base] : null;

  let n = 0;
  const outEntries = entries.map((e, i) => {
    let newTrans = e.trans;
    if (mp && mp.has(i)) {
      newTrans = mp.get(i).psp;
      n++; filled++;
    }
    // 头部行必须原样保留（offset/name/length 是补丁定位依据）
    return { hdr: e.hdr, orig: e.orig, trans: newTrans };
  });

  const outText = renderVlStrict(prefix, outEntries);
  fs.writeFileSync(path.join(OUT, fname), outText, 'utf8');
  if (n > 0) { changed++; detail.push({ file: fname, filled: n }); }
  else untouched++;
}

function rebuildHdr(meta) {
  const h = [];
  if (meta.index !== undefined) h.push('index ' + meta.index);
  if (meta.offset !== undefined) h.push('offset ' + meta.offset);
  if (meta.name !== undefined) h.push('name ' + meta.name);
  if (meta.length !== undefined) h.push('length ' + meta.length);
  return h;
}

function renderVlStrict(prefix, entries) {
  let out = prefix;
  for (const e of entries) {
    out += '\n====================\n';
    out += e.hdr.join('\n') + '\n';
    out += '====================\n';
    out += e.orig + '\n';
    out += '====================\n';
    if (e.trans !== null && e.trans !== undefined) out += e.trans + '\n';
    out += '====================\n';
  }
  return out;
}

console.log(`\n写出 ${allFiles.length} 文件到 out_patch/`);
console.log(`  有回填: ${changed} 文件 / ${filled} 条`);
console.log(`  无变化: ${untouched} 文件`);
