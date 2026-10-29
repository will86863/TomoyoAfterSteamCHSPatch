const fs = require('fs');
const path = require('path');
const dir = process.argv[2];
const files = fs.readdirSync(dir).filter(f => /^\d+\.scr$/.test(f)).sort();

const out = [];
for (const f of files) {
  const t = fs.readFileSync(path.join(dir, f), 'utf16le');
  let i = -1;
  const blocks = [];
  while ((i = t.indexOf('\f', i + 1)) !== -1) {
    // 从 i+8 开始取，直到 \u0000
    let j = i + 8;
    let s = '';
    while (j < t.length && t[j] !== '\u0000') { s += t[j]; j++; }
    if (s.includes('\n') && s.length > 2) blocks.push({ pos: i, text: s });
  }
  out.push({ file: f, count: blocks.length, blocks });
}

const lines = [];
for (const o of out) {
  lines.push('\n=== ' + o.file + '  (' + o.count + ' blocks) ===');
  for (const b of o.blocks) {
    const opts = b.text.split('\n').map(s => s.trim()).filter(Boolean);
    lines.push('  [@' + b.pos + '] ' + opts.map(x => '「' + x + '」').join(' | '));
  }
}
fs.writeFileSync('psp_options.txt', lines.join('\n'), 'utf8');
console.log('files:', out.length, 'total blocks:', out.reduce((a, b) => a + b.count, 0));
