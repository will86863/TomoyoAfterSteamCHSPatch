const fs = require('fs');
const path = require('path');

const dir = process.argv[2];
const files = fs.readdirSync(dir).filter(f => /^\d+\.txt$/.test(f)).sort();
const out = [];

for (const f of files) {
  const txt = fs.readFileSync(path.join(dir, f), 'utf8');
  const lines = txt.split(/\r?\n/);
  let curDate = '';
  lines.forEach((ln, i) => {
    const t = ln.trim();
    const dm = t.match(/^([０-９0-9]+)月([０-９0-9]+)日/);
    if (dm) {
      const toHalf = s => s.replace(/[０-９]/g, c => String.fromCharCode(c.charCodeAt(0) - 0xFEE0));
      curDate = toHalf(dm[1]) + '.' + toHalf(dm[2]);
      out.push('\n#### ' + curDate + '  [' + f + ':' + (i + 1) + ']');
      return;
    }
    // 候选选项：短行、不含对话括号、不含冒号
    if (t.length > 0 && t.length <= 40 &&
        !t.includes('「') && !t.includes('」') && !t.includes('：') &&
        !t.startsWith('*') && !/^[─━=＝\-]/.test(t)) {
      out.push('  [' + curDate + '|' + (i + 1) + '] ' + t);
    }
  });
}
fs.writeFileSync('options_candidates.txt', out.join('\n'), 'utf8');
console.log('lines:', out.length);
