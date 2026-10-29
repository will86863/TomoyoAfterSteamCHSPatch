// 精确统计官方仓库 patch/ 的真实翻译进度
const fs = require('fs');
const path = require('path');
const DIR = process.argv[2] || 'patch';

function parseVl(text) {
  const m = text.match(/^(type [^\n]*\ncount (\d+)[^\n]*\n)/);
  const prefix = m ? m[1] : '';
  const count = m ? parseInt(m[2], 10) : -1;
  const body = m ? text.slice(m[0].length) : text;
  const lines = body.replace(/\r\n/g, '\n').split('\n');
  const isSep = (s) => /^=+\s*$/.test(s);
  const entries = [];
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
      entries.push({ meta, orig: orig.join('\n'), trans });
      i = j;
    } else i++;
  }
  return { prefix, count, entries };
}

const isMacroLine = (s) => /^[A-Z0-9&_\-\s.]{4,}$/.test(s.trim());

const files = fs.readdirSync(DIR).filter(f => f.endsWith('.txt')).sort();
const rows = [];
let T = { total: 0, done: 0, punct: 0, macro: 0, untrans: 0 };

for (const f of files) {
  const { count, entries } = parseVl(fs.readFileSync(path.join(DIR, f), 'utf8'));
  let done = 0, punct = 0, macro = 0, untrans = 0;
  const untransList = [];
  for (const e of entries) {
    const tr = (e.trans || '').trim();
    const cjk = (tr.match(/[\u4e00-\u9fff]/g) || []).length;
    if (cjk > 0) { done++; continue; }
    if (isMacroLine(tr)) { macro++; continue; }
    const bare = tr.replace(/[^A-Za-z]/g, '');
    if (bare.length === 0) { punct++; continue; }
    untrans++;
    untransList.push({ idx: e.meta.index, en: e.orig, zh: tr });
  }
  const n = entries.length;
  const pct = n ? (100 * done / n) : 0;
  rows.push({ f, n, count, done, punct, macro, untrans, pct, untransList });
  T.total += n; T.done += done; T.punct += punct; T.macro += macro; T.untrans += untrans;
}

rows.sort((a, b) => a.pct - b.pct || a.f.localeCompare(b.f));
console.log('文件'.padEnd(16) + '条目'.padStart(6) + '已译'.padStart(6) + '完成度'.padStart(8) + '  未译英文');
console.log('-'.repeat(60));
for (const r of rows) {
  const flag = r.pct >= 99.9 ? '✅' : r.pct > 0 ? '🟡' : '⬜';
  console.log(`${r.f.padEnd(16)}${String(r.n).padStart(6)}${String(r.done).padStart(6)}${(r.pct.toFixed(1) + '%').padStart(8)}  ${flag} ${r.untrans > 0 ? '未译' + r.untrans : ''}`);
}
console.log('-'.repeat(60));
console.log(`合计 ${files.length} 文件 / ${T.total} 条：已译 ${T.done} (${(100 * T.done / T.total).toFixed(1)}%)，纯标点 ${T.punct}，宏 ${T.macro}，真正未译 ${T.untrans}`);
console.log(`\n完全完成(≥99.9%)的文件: ${rows.filter(r => r.pct >= 99.9).length} / ${files.length}`);
console.log(`完全空白(0%)的文件: ${rows.filter(r => r.pct === 0).length}`);

// 导出未译清单
const dump = rows.filter(r => r.untransList.length).map(r => ({ file: r.f, items: r.untransList }));
fs.writeFileSync('untranslated.json', JSON.stringify(dump, null, 1), 'utf8');
console.log('\n未译明细已写入 untranslated.json');
