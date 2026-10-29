const fs = require('fs');
const path = require('path');

const W = __dirname;
const src = fs.readFileSync(path.join(W, 'raw.html'), 'utf8');

/* ---------- 1. 解析原页面的 4 个 section ---------- */
const start = src.indexOf('<div class="guide subSections"');
const end = src.indexOf('class="rightContents"', start);
const bodyHtml = src.slice(start, end);
const secs = bodyHtml.split('<div class="subSection detailBox"').slice(1);

function getTitle(sec) {
  const m = sec.match(/subSectionTitle">\s*([\s\S]*?)\s*<\/div>\s*<div class="subSectionDesc">/);
  return m ? m[1].replace(/\s+/g, ' ').trim() : '';
}
function getDesc(sec) {
  const i = sec.indexOf('class="subSectionDesc">');
  if (i < 0) return '';
  const j = sec.indexOf('<div style="clear: both"></div>', i);
  return sec.slice(sec.indexOf('>', i) + 1, j > i ? j : sec.length);
}

const titles = secs.map(getTitle);
const descs = secs.map(getDesc);

/* ---------- 2. 表格解析 ---------- */
const dec = s => s.replace(/&quot;/g, '"').replace(/&amp;/g, '&').replace(/&#39;/g, "'").replace(/&nbsp;/g, ' ');

function parseRows(html) {
  const rows = html.split('<div class="bb_table_tr">').slice(1);
  return rows.map(r => {
    const cells = [...r.matchAll(/<div class="bb_table_t[hd]">([\s\S]*?)<\/div>/g)].map(m => m[1]);
    return cells.map(c => {
      const img = (c.match(/<img src="([^"]+)"/) || [])[1] || null;
      const text = c.split('<br>').map(x => dec(x.replace(/<[^>]+>/g, '').trim())).filter(x => x !== '');
      return { img, text };
    });
  });
}

const achRows = parseRows(descs[1]);   // 成就总览
const routeRows = parseRows(descs[2]); // 流程攻略（真结局）

/* ---------- 3. PSP 官方中文（取自游戏 scr 脚本原文） ---------- */
const PSP = {
  // 6.28
  'Ask her to speak more like a girl': '说些女人味的话',
  'Ask her to act like a tsundere': '变成傲娇',
  'Ask her to speak like a child': '说幼儿语',
  // 6.30
  'Single-phase commutated series-wound motor': '单相直卷整流电动机',
  'Wound rotor three-phase induction motor': '卷线型三相诱导电动机',
  'Electromagnetic synchronous motor': '电磁石同期电动机',
  '120 degrees': '120度',
  '155 degrees': '155度',
  '180 degrees': '180度',
  'Gyro sensor': '陀螺仪传感器',
  'Diaphragm': '横隔膜',
  'Non-contact': '无切点方式',
  // 7.1
  'A kiss': '接吻',
  'Coffee': '咖啡',
  'Your scent': '气味',
  // 7.7
  "Check Tomo's bag": '检查小智的行李',
  "Check Tomyo's underwear": '检查智代的内衣裤',
  // 7.9
  'In front of the apartments': '来到了公寓',
  'In front of the public bath': '来到了浴池',
  'In front of the supermarket': '来到了超市',
  'Find her': '我来找',
  "Don't find her": '不要找了',
  // 7.10
  'Quietly endure': '忍耐着不出声',
  "Don't come": '你别跟来',
  // 7.11
  "Do it while she's in the middle of cooking": '趁智代忙着做饭的时候从背后…',
  "Do it next to Tomo while she's naping": '趁小智睡午觉时在旁边不出声地…',
  'Do nothing': '什么都不想要',
  // 7.14
  'Talk': '交谈',
  'Study': '学习',
  'Join them': '一起玩',
  'Continue studying': '继续学习',
  "People's chins get more crooked as they get older": '人随着年龄增长下颚会逐渐凹陷',
  'I caught a computer mouse in the sink': '在水池里抓到了米老鼠',
  'There are 100 Takafumis': '有１００个鹰文',
  'I became a deity earlier': '我刚刚成为了神',
  'Takafumi bloomed': '鹰文盛开了',
  "The romance won't stop": '浪漫停不下来了',
  'Go to where the fireworks are': '去放焰火的地方',
  'Ignore them': '无视',
  "Tomoyo's stand-in": '我是代替智代来的',
  'An onlooker': '看热闹的',
  'Saitou': '齐藤',
  // 7.15
  'Yes': '好',
  'No': '不好',
  'Let her': '让她这么做',
  'Stop her': '制止她',
  // 7.16
  'Work on it together': '一起做',
  'Refuse': '拒绝',
  'Substitute for Kanako': '换人',
  'Let Kanako handle it': '交给河南子',
  // 人名
  'Tomoyo': '智代',
  'Takafumi': '鹰文',
  'Kanako': '河南子',
  'Me': '我',
  'takafumi': '鹰文',
  // 7.20
  'I do': '想',
  "I don't": '不想',
  'Ask him directly': '直接问他',
  'Avoid asking him directly': '还是避免这一点',
  // 7.21
  'Power through': '就只能努力了',
  'Give up': '就只能放弃了',
  // 7.23
  'Go out front': '出去',
  // 8.10
  'Tomoyo and I will go': '智代和我两个人去',
  'Tomoyo,Kanako,and I will go': '智代、河南子还有我三个人去',
  'Tomoyo,Takafumi,and I will go': '智代、鹰文还有我三个人去',
  // 8.11
  'Retort': '和她吐槽',
  'Ignore her': '不管她',
  // 8.12
  'Build a schhool': '造一所学校',
  'Think of another idea': '考虑别的办法',
  // 8.14
  'Pursue her': '答应她',
  'Refuse her': '拒绝她',
};

// 同一英文在不同日期 PSP 文案不同（实测取值）
const BY_DATE = {
  '7.15': { 'Talk': '说话', 'Study': '学习' },
  '7.16': { 'Talk': '聊天', 'Study': '学习' },
};

function zhOf(en, date) {
  const d = BY_DATE[date];
  if (d && d[en]) return d[en];
  return PSP[en] || null;
}

/* ---------- 4. 渲染选项：英文 + （PSP 中文） ---------- */
const esc = s => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

function renderOption(line, date) {
  let star = '';
  let s = line.trim();
  if (s.startsWith('*')) { star = '*'; s = s.slice(1).trim(); }

  // 原表作者自写的中文备注，直接按中文样式
  if (/[\u4e00-\u9fa5]/.test(s)) return `${star}<span class="zh">${esc(s)}</span>`;

  // "A" or "B" 组合
  if (/\s+or\s+/.test(s)) {
    const parts = s.split(/\s+or\s+/);
    return star + parts.map(p => {
      const q = p.trim();
      const unq = q.replace(/^"|"$/g, '').trim();
      const zh = zhOf(unq, date);
      const core = zh ? `<span class="en">${esc(unq)}</span><span class="zh">（${esc(zh)}）</span>` : `<span class="en">${esc(unq)}</span>`;
      return q.startsWith('"') ? `"${core}"` : core;
    }).join(' <span class="or">or</span> ');
  }

  const zh = zhOf(s, date);
  return zh
    ? `${star}<span class="en">${esc(s)}</span><span class="zh">（${esc(zh)}）</span>`
    : `${star}<span class="en">${esc(s)}</span>`;
}

/* ---------- 5. 图标 base64 ---------- */
function iconData(i) {
  const p = path.join(W, 'assets', 'ach_' + String(i).padStart(2, '0') + '.png');
  if (!fs.existsSync(p)) return null;
  return 'data:image/png;base64,' + fs.readFileSync(p).toString('base64');
}
function imgData(p, mime) {
  if (!fs.existsSync(p)) return null;
  return `data:${mime};base64,` + fs.readFileSync(p).toString('base64');
}
const coverData = imgData(path.join(W, 'assets', 'cover.jpg'), 'image/jpeg');
const introData = imgData(path.join(W, 'assets', 'intro.jpg'), 'image/jpeg');

/* ---------- 6. 构建 HTML ---------- */
let date = '';
const routeHtml = routeRows.map((row, ri) => {
  const [c0, c1, c2, c3] = row;
  const d = c0.text[0] || '';
  if (d && d !== '日期') date = d;
  const isHead = d === '日期';

  const cell = (arr, cls) => {
    if (!arr || arr.text.length === 0) return `<td class="${cls}"></td>`;
    return `<td class="${cls}">` + arr.text.map(t => `<div class="opt">${renderOption(t, date)}</div>`).join('') + '</td>';
  };

  if (isHead) {
    return `<tr class="head"><th>日期</th><th>选项</th><th>选择</th><th>备注</th></tr>`;
  }
  const note = (c3 && c3.text.length) ? c3.text.map(t => `<div class="note">${esc(t)}</div>`).join('') : '';
  return `<tr>
    <td class="date">${esc(d)}</td>
    ${cell(c1, 'opts')}
    ${cell(c2, 'pick')}
    <td class="notes">${note}</td>
  </tr>`;
}).join('\n');

let ai = 0;
const achHtml = achRows.map((row) => {
  const [c0, c1, c2, c3] = row;
  if (c0.text[0] === '序号') return `<tr class="head"><th class="num">序号</th><th class="ico"></th><th>成就</th><th>获取方法</th></tr>`;
  const n = ++ai;
  const data = iconData(n);
  const img = data ? `<img src="${data}" alt="">` : '';
  return `<tr>
    <td class="num">${esc(c0.text[0] || '')}</td>
    <td class="ico">${data ? `<img src="${data}" alt="" title="${esc((c2.text || []).join(' '))}">` : ''}</td>
    <td class="achname">${(c2.text || []).map(t => esc(t)).join('<br>')}</td>
    <td class="howto">${(c3.text || []).map(t => esc(t)).join('<br>')}</td>
  </tr>`;
}).join('\n');

/* 介绍节 */
const introSrc = descs[0];
const introImg = (introSrc.match(/<img src="([^"]+)"/) || [])[1];
const introText = introSrc
  .replace(/<a[^>]*>[\s\S]*?<\/a>/g, '')
  .split('<br>').map(s => dec(s.replace(/<[^>]+>/g, '').trim())).filter(Boolean);

/* 坏结局节 */
const badText = descs[3].split('<br>').map(s => dec(s.replace(/<[^>]+>/g, '').trim())).filter(Boolean);
const badHtml = badText.map(t => {
  if (/^\d+\.\d+$/.test(t)) return `<div class="badend-date">${esc(t)}</div>`;
  const orz = t.split(/\s+or\s+/);
  if (orz.length > 1) {
    return '<div class="badend-opt">' + orz.map(p => {
      const q = p.trim();
      const zh = zhOf(q, '');
      return zh ? `<span class="en">${esc(q)}</span><span class="zh">（${esc(zh)}）</span>` : `<span class="en">${esc(q)}</span>`;
    }).join(' <span class="or">or</span> ') + '</div>';
  }
  return `<div class="badend-opt">${renderOption(t, '')}</div>`;
}).join('\n');

/* 封面缩略图 */
const coverImg = (src.match(/class="guidePreviewImage">\s*<img src="([^"]+)"/) || [])[1] || '';

/* ---------- 7. 拼装 ---------- */
const html = `<!DOCTYPE html>
<html lang="zh-CN">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>Tomoyo After全成就中文指南（PSP 对照版）</title>
<style>
:root{
  --bg:#e9ebee; --panel:#fff; --ink:#2b2b2b; --muted:#7b8794;
  --steel:#171a21; --steel2:#1b2838; --blue:#66c0f4; --link:#1a6fa8;
  --line:#d6dade; --zh:#0d7a3d; --zebra:#f6f8f9;
}
*{box-sizing:border-box}
html,body{margin:0;padding:0}
body{
  background:var(--bg); color:var(--ink);
  font:14px/1.65 "Motiva Sans","Segoe UI","Microsoft YaHei","PingFang SC",Arial,sans-serif;
  -webkit-font-smoothing:antialiased;
}
a{color:var(--link);text-decoration:none}
a:hover{text-decoration:underline}

/* 顶栏 */
.topbar{background:var(--steel);color:#c6d4df;padding:10px 0}
.topbar .inner{max-width:1180px;margin:0 auto;padding:0 20px;display:flex;align-items:center;gap:14px;font-size:13px}
.topbar .brand{color:#fff;font-weight:700;letter-spacing:.5px}
.topbar .sep{color:#3d4450}
.topbar .crumb{color:#8f9da9}

/* 封面 */
.hero{background:var(--steel2);color:#c6d4df;padding:22px 0 18px}
.hero .inner{max-width:1180px;margin:0 auto;padding:0 20px;display:flex;gap:18px;align-items:flex-start}
.hero img.cover{width:76px;height:76px;border-radius:4px;object-fit:cover;background:#0f1620;box-shadow:0 2px 8px rgba(0,0,0,.5)}
.hero h1{margin:0 0 6px;font-size:26px;line-height:1.25;color:#fff;font-weight:700}
.hero .by{font-size:13px;color:#8f9da9;margin-bottom:8px}
.hero .by b{color:#66c0f4;font-weight:600}
.hero .desc{font-size:13.5px;color:#a7b6c2;max-width:820px}

/* 布局 */
.wrap{max-width:1080px;margin:0 auto;padding:22px 20px 70px}
@media(max-width:900px){.wrap{padding-top:16px}}

/* 卡片 */
.card{background:var(--panel);border:1px solid var(--line);border-radius:3px;margin-bottom:22px;overflow:hidden}
.card > h2{margin:0;padding:13px 18px;font-size:17px;font-weight:700;color:#1b2838;background:linear-gradient(#fbfcfd,#eef1f4);border-bottom:1px solid var(--line)}
.card .body{padding:18px}

/* 介绍 */
.intro{display:flex;gap:16px;align-items:flex-start;flex-wrap:wrap}
.intro img{width:150px;border-radius:3px;box-shadow:0 1px 5px rgba(0,0,0,.22)}
.intro p{margin:0 0 8px;flex:1;min-width:260px;line-height:1.85}

/* 表格 */
.tblwrap{overflow-x:auto}
table{border-collapse:collapse;width:100%;font-size:13.5px}
th,td{border:1px solid var(--line);padding:8px 10px;vertical-align:top;text-align:left}
tr.head th{background:#eef1f4;color:#3f4b56;font-weight:700;font-size:13px;white-space:nowrap}
tbody tr:nth-child(even){background:var(--zebra)}
td.num,th.num{width:44px;text-align:center;color:var(--muted);font-variant-numeric:tabular-nums}
td.ico,th.ico{width:46px;text-align:center}
td.ico img{width:32px;height:32px;display:block;margin:0 auto;border-radius:2px}
td.achname{font-weight:600;color:#26313b;width:26%;min-width:170px}
td.howto{color:#3f4b56}
td.date{white-space:nowrap;font-weight:700;color:#26313b;width:56px;font-variant-numeric:tabular-nums}
td.opts{min-width:290px}
td.pick{min-width:200px}
td.notes{min-width:150px;color:#4a5866;font-size:12.5px}
.opt + .opt{margin-top:4px}
.opt .en,.en{color:#2b2b2b}
.zh{color:var(--zh);font-size:12.5px;margin-left:1px}
.or{display:block;margin:6px 0 6px;color:#7b8794;font-style:italic;font-size:13.5px;font-weight:700;letter-spacing:.6px;line-height:1.2}
td.pick .zh{font-weight:600}
.note{color:#4a5866}
.note + .note{margin-top:3px}

/* 坏结局 */
.badend-date{display:inline-block;margin:10px 0 2px;font-weight:700;color:#26313b;background:#eef1f4;border-radius:2px;padding:1px 9px;font-size:12.5px}
.badend-opt{padding-left:14px;position:relative;margin:2px 0}
.badend-opt::before{content:"›";position:absolute;left:2px;color:#aab6c0}

/* 说明条 */
.callout{background:#eef6fb;border:1px solid #cfe4f2;border-left:4px solid var(--blue);border-radius:3px;padding:10px 14px;font-size:12.8px;color:#33546b;margin-bottom:22px;line-height:1.75}
.callout b{color:#1b4f6e}
footer{max-width:1180px;margin:0 auto;padding:0 20px 40px;font-size:12px;color:var(--muted);text-align:center}
</style>
</head>
<body>

<div class="topbar"><div class="inner">
  <span class="brand">STEAM 社区</span><span class="sep">›</span>
  <span class="crumb">指南</span><span class="sep">›</span>
  <span class="crumb">Tomoyo After ~It's a Wonderful Life~ English Edition</span>
</div></div>

<div class="hero"><div class="inner">
  ${coverData ? `<img class="cover" src="${coverData}" alt="">` : ''}
  <div>
    <h1>Tomoyo After全成就中文指南</h1>
    <div class="by">由 <b>咲夜</b> 制作</div>
    <div class="desc">真结局，几个坏结局，以及Dungeons&amp;Takafumis的攻略</div>
  </div>
</div></div>

<div class="wrap">
  <main>
    <div class="callout">
      <b>对照说明：</b>本页在原指南基础上，为每一处英文选项补注了 <b>PSP 版官方中文</b>译文，格式为「English（PSP 中文）」；括号外文字、日期、表格结构与备注均保持原样。译文取自 PSP 版游戏脚本原文，人名以 PSP 版为准（Tomo＝小智、Takafumi＝鹰文、Kanako＝河南子、Tomoyo＝智代）。
    </div>

    <section class="card" id="intro">
      <h2>介绍</h2>
      <div class="body">
        <div class="intro">
          ${introData ? `<img src="${introData}" alt="">` : ''}
          <div>${introText.map(t => `<p>${esc(t)}</p>`).join('')}</div>
        </div>
      </div>
    </section>

    <section class="card" id="ach">
      <h2>成就总览</h2>
      <div class="tblwrap">
        <table>${achHtml}</table>
      </div>
    </section>

    <section class="card" id="route">
      <h2>流程攻略（真结局）</h2>
      <div class="tblwrap">
        <table>${routeHtml}</table>
      </div>
    </section>

    <section class="card" id="bad">
      <h2>坏结局</h2>
      <div class="body">${badHtml}</div>
    </section>
  </main>
</div>

<footer>原指南 © 咲夜 · Steam 创意工坊 #3488465923　|　PSP 中文对照版</footer>
</body>
</html>`;

const out = path.join(W, 'Tomoyo After 全成就中文指南（PSP对照）.html');
fs.writeFileSync(out, html, 'utf8');
console.log('written:', out);
console.log('size:', (fs.statSync(out).size / 1024).toFixed(1) + ' KB');
console.log('achievements:', ai, 'route rows:', routeRows.length - 1);
