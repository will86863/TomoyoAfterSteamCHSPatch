const fs = require('fs');
const h = fs.readFileSync('sec3.html', 'utf8');

// 按 bb_table_tr 切行
const rows = h.split('<div class="bb_table_tr">').slice(1);
const table = [];
for (const r of rows) {
  const cells = [...r.matchAll(/<div class="bb_table_t[hd]">([\s\S]*?)<\/div>/g)].map(m => m[1]);
  table.push(cells.map(c => c.split('<br>').map(x => x.trim()).filter(x => x !== '')));
}

const out = [];
table.forEach((cells, index) => {
  out.push('【R' + (index + 1) + '】');
  const names = ['日期', '选项', '选择', '备注'];
  cells.forEach((lines, ci) => {
    out.push('  ' + names[ci] + ' = ' + JSON.stringify(lines));
  });
});
fs.writeFileSync('table.txt', out.join('\n'), 'utf8');
console.log(out.join('\n'));
