const fs = require('fs');
const path = require('path');
const dir = path.join(__dirname, '..', 'patch');
const files = fs.readdirSync(dir).filter(f => /^seen\d+\.txt$/.test(f)).sort();

const pairs = [];
for (const f of files) {
  const txt = fs.readFileSync(path.join(dir, f), 'utf8');
  const blocks = txt.split(/\n={20}\n/);
  // 解析每个块: 首块是 header "type seen721\ncount N"
  const cleaned = blocks.map(b => b.replace(/^\uFEFF/, '').trim()).filter(b => b !== '');
  // 找到成对出现的结构 index N / offset / name / length / EN / ZH
  for (let i = 0; i < cleaned.length; i++) {
    const b = cleaned[i];
    if (!/^index \d+/.test(b)) continue;
    const en = cleaned[i + 1];
    const zh = cleaned[i + 2];
    if (en === undefined || zh === undefined) continue;
    if (/^index \d+/.test(en)) continue;
    pairs.push({ en, zh, file: f });
  }
}
fs.writeFileSync('patch_pairs.json', JSON.stringify(pairs), 'utf8');
console.log('pairs:', pairs.length);
const sample = pairs.filter(p => /^(Talk|Study|I do|I don't|Yes|No)$/.test(p.en));
console.log(sample.slice(0, 20));
