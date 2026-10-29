// 探查脚本：在 PSP 版 .scr 中定位一段中文的字节位置。
// 用法：把 PSP 版 .scr 放到 ./scr/ 下（需自备，游戏本体资源不随本仓库分发），再运行 node hexprobe.js
const fs = require('fs');
const path = require('path');

const file = path.join(__dirname, 'scr', '0711.scr');
const buf = fs.readFileSync(file);

// 找 "什么都不想要" 的字节位置
const needle = Buffer.from('什么都不想要', 'utf16le');
const at = buf.indexOf(needle);
if (at < 0) {
  console.error('未找到目标串；请确认 ./scr/0711.scr 存在且是 PSP 版原始脚本。');
  process.exit(1);
}
console.log('found at', at);
console.log(buf.slice(at - 40, at + 40).toString('hex').match(/../g).join(' '));
console.log('--- decoded window ---');
console.log(JSON.stringify(buf.slice(at - 40, at + 60).toString('utf16le')));
