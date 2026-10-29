const fs = require('fs');

function parseTable(html) {
  const rows = html.split('<div class="bb_table_tr">').slice(1);
  return rows.map(r => {
    const cells = [...r.matchAll(/<div class="bb_table_t[hd]">([\s\S]*?)<\/div>/g)].map(m => m[1]);
    return cells.map(c => ({
      raw: c.trim(),
      // 取出图片 URL 与纯文字
      img: (c.match(/<img src="([^"]+)"/) || [])[1] || null,
      text: c.replace(/<a[^>]*>[\s\S]*?<\/a>/g, '').replace(/<[^>]+>/g, '\n').split('\n').map(s => s.trim()).filter(Boolean)
    }));
  });
}

const sec2 = fs.readFileSync('sec2.html', 'utf8');
const t2 = parseTable(sec2);
fs.writeFileSync('sec2.json', JSON.stringify(t2, null, 1), 'utf8');
console.log('成就表行数:', t2.length);
console.log(JSON.stringify(t2.slice(0, 4), null, 1));
