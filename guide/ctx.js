// 探查脚本：在 PSP 版 .scr 中按偏移取上下文。
// 用法：把 PSP 版 .scr 放到 ./scr/ 下（需自备，游戏本体资源不随本仓库分发），再运行 node ctx.js
const fs = require('fs');
const path = require('path');
const dir = path.join(__dirname, 'scr') + path.sep;

function dump(file, pos, before = 400, after = 400) {
  const t = fs.readFileSync(dir + file, 'utf16le');
  const seg = t.slice(Math.max(0, pos - before), pos + after);
  return seg.replace(/[\u0000-\u0008\u000b-\u001f]/g, '·');
}

console.log('=== 0720.scr @1390 (I do/I don\'t) ===');
console.log(dump('0720.scr', 1390, 500, 500));
