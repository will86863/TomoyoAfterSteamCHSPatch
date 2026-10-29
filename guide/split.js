const fs = require('fs');
const s = fs.readFileSync('raw.html', 'utf8');
const start = s.indexOf('<div class="guide subSections"');
const end = s.indexOf('class="rightContents"', start);
const body = s.slice(start, end > start ? end : undefined);
const parts = body.split('<div class="subSection detailBox"');
fs.writeFileSync('sec2.html', parts[2] || '', 'utf8');
fs.writeFileSync('sec3.html', parts[3] || '', 'utf8');
fs.writeFileSync('sec1.html', parts[1] || '', 'utf8');
fs.writeFileSync('sec4.html', parts[4] || '', 'utf8');
// 打印 sec3 开头 2000 字符，看表格结构
console.log('=== SEC3 first 2500 ===');
console.log((parts[3] || '').slice(0, 2500));
