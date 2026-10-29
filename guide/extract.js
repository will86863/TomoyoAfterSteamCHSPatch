const fs = require('fs');
const s = fs.readFileSync(process.argv[2], 'utf8');

// 找到 guide 正文区间
const startMark = '<div class="guide';
const idx = s.indexOf('class="subSections"');
const idx2 = s.indexOf('class="rightContents"');
console.log('subSections at', idx, 'rightContents at', idx2);

// 先输出 guideTop 的标题/描述区
function stripTags(html) {
  return html
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<\/(p|div|h1|h2|h3|h4|li|tr)>/gi, '\n')
    .replace(/<img[^>]*src="([^"]*)"[^>]*>/gi, '\n[IMG: $1]\n')
    .replace(/<[^>]+>/g, '')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/\n{3,}/g, '\n\n');
}

// 抓 workShopContent 区
const wi = s.indexOf('workshopItemTitle');
const wi2 = s.indexOf('class="workshopItemDescription"');
console.log('--- TITLE AREA ---');
if (wi > 0) console.log(stripTags(s.slice(wi - 100, wi + 800)));
if (wi2 > 0) console.log('--- DESC ---\n' + stripTags(s.slice(wi2, wi2 + 3000)));

// 正文起点：找第一个 <div class="subSections">
if (idx > 0) {
  const endCandidates = ['class="workshopItemDescription"', 'class="rightContents"', 'id="footer"', 'class="guideComments"'];
  let end = s.length;
  for (const c of endCandidates) {
    const p = s.indexOf(c, idx);
    if (p > idx && p < end) end = p;
  }
  const body = s.slice(idx, end);
  fs.writeFileSync(process.argv[3] || 'body.txt', stripTags(body), 'utf8');
  console.log('--- BODY LEN ---', body.length);
}
