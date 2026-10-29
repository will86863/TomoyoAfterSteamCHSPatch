const fs = require('fs');
const s = fs.readFileSync('raw.html', 'utf8');

const start = s.indexOf('<div class="guide subSections"');
const end = s.indexOf('class="rightContents"', start);
const body = s.slice(start, end > start ? end : undefined);

// 用简单分词按 subSection 切分
const parts = body.split('<div class="subSection detailBox"');
console.log('sections:', parts.length - 1);

function clean(html) {
  let t = html;
  t = t.replace(/<br\s*\/?>/gi, '\n');
  t = t.replace(/<img[^>]*?src="([^"]+)"[^>]*>/gi, '\n[[IMG:$1]]\n');
  t = t.replace(/<li[^>]*>/gi, '\n- ');
  t = t.replace(/<\/(p|div|h1|h2|h3|h4|li|tr|ul)>/gi, '\n');
  t = t.replace(/<[^>]+>/g, '');
  const ents = { '&nbsp;': ' ', '&amp;': '&', '&lt;': '<', '&gt;': '>', '&quot;': '"', '&#39;': "'", '&ndash;': '–', '&mdash;': '—', '&hellip;': '…', '&rsquo;': '’', '&lsquo;': '‘', '&ldquo;': '“', '&rdquo;': '”' };
  t = t.replace(/&[a-z#0-9]+;/gi, m => ents[m] !== undefined ? ents[m] : m);
  t = t.replace(/[ \t]+\n/g, '\n').replace(/\n[ \t]+/g, '\n').replace(/\n{3,}/g, '\n\n');
  return t.trim();
}

// 提取目录
const toc = [];
for (const m of body.matchAll(/guideSubSectionSelectionLink ellipsis"[^>]*>\s*([^<]+)/g)) toc.push(m[1].trim());
console.log('TOC:', JSON.stringify(toc, null, 1));

const out = [];
parts.forEach((p, i) => {
  if (i === 0) return;
  const ti = p.indexOf('class="subSectionTitle"');
  const di = p.indexOf('class="subSectionDesc"');
  let title = '';
  if (ti >= 0) title = clean(p.slice(p.indexOf('>', p.indexOf('>', ti) + 1) + 1, di >= 0 && di > ti ? di : ti + 800));
  const descStart = di >= 0 ? p.indexOf('>', di) + 1 : ti + 1;
  let desc = clean(p.slice(descStart));
  // 去掉结尾的分割/评分残留
  desc = desc.replace(/[\s\S]*?$/, d => d);
  out.push('### [' + (i) + '] ' + title.replace(/\n+/g, ' ') + '\n' + desc + '\n');
});

fs.writeFileSync('body.txt', out.join('\n'), 'utf8');
console.log('written, chars:', out.join('\n').length);
