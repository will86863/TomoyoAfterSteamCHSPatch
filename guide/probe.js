const fs = require('fs');
const path = require('path');
const dir = process.argv[2];
const files = fs.readdirSync(dir).filter(f => /^\d+\.txt$/.test(f)).sort();

for (const f of files.slice(0, 3)) {
  const t = fs.readFileSync(path.join(dir, f), 'utf16le');
  const nf = (t.match(/\f/g) || []).length;
  console.log(f, 'len', t.length, '\\f count', nf);
}
// 打印 0628 所有 \f 附近 200 字符
const t = fs.readFileSync(path.join(dir, '0628.txt'), 'utf16le');
let idx = -1, n = 0;
while ((idx = t.indexOf('\f', idx + 1)) !== -1 && n < 8) {
  n++;
  const seg = t.slice(Math.max(0, idx - 40), idx + 160).replace(/[\u0000-\u0008\u000b-\u001f]/g, '·');
  console.log('---', n, JSON.stringify(seg));
}
