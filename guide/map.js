const fs = require('fs');

// 攻略表格结构（已在 table.txt 里，重新解析 sec3.html）
const h = fs.readFileSync('sec3.html', 'utf8');
const rows = h.split('<div class="bb_table_tr">').slice(1);
const dec = s => s.replace(/&quot;/g, '"').replace(/&amp;/g, '&').replace(/&#39;/g, "'");

const table = rows.map(r => {
  const cells = [...r.matchAll(/<div class="bb_table_t[hd]">([\s\S]*?)<\/div>/g)].map(m => m[1]);
  return cells.map(c => c.split('<br>').map(x => dec(x.trim())).filter(Boolean));
});

// 收集所有英文选项
const opts = new Set();
for (const row of table.slice(1)) {
  for (const line of (row[1] || [])) opts.add(line);
  for (const line of (row[2] || [])) {
    // 选择单元格可能是 "A" or "B" 或 *A
    if (/ or /.test(line)) {
      for (const part of line.split(/\s+or\s+/)) opts.add(part.replace(/^["']|["']$/g, '').replace(/^\*/, '').trim());
    } else {
      opts.add(line.replace(/^\*/, '').trim());
    }
  }
}

// patch 词条库
const pairs = JSON.parse(fs.readFileSync('patch_pairs.json', 'utf8'));
const idx = new Map();
for (const p of pairs) {
  const k = p.en.trim();
  if (!idx.has(k)) idx.set(k, []);
  idx.get(k).push(p.zh.trim());
}

const out = [];
for (const o of [...opts].sort()) {
  const zh = idx.get(o) || [];
  out.push(o + '\t=>\t' + JSON.stringify([...new Set(zh)]));
}
fs.writeFileSync('optmap.txt', out.join('\n'), 'utf8');
console.log(out.join('\n'));
