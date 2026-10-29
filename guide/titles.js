const fs = require('fs');
for (const f of ['sec1', 'sec2', 'sec3', 'sec4']) {
  const h = fs.readFileSync(f + '.html', 'utf8');
  const t = (h.match(/subSectionTitle">\s*([\s\S]*?)\s*<\/div>/) || [])[1] || '(none)';
  console.log(f, '=> 标题:', t.replace(/<[^>]+>/g, '').trim());
  // 统计表格
  console.log('   bb_table_tr:', (h.match(/bb_table_tr/g) || []).length, ' imgs:', (h.match(/<img/g) || []).length, ' len:', h.length);
}
