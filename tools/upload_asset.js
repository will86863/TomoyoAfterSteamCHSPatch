'use strict';
/**
 * 上传 Release 附件（正确处理中文文件名与 Content-Type）。
 * 用法: node tools/upload_asset.js <releaseId> <file> <nameInRelease> [mime]
 */
const fs = require('fs');
const path = require('path');
const https = require('https');

const [releaseId, file, nameInRelease, mimeOverride] = process.argv.slice(2);
if (!releaseId || !file) {
  console.error('用法: node upload_asset.js <releaseId> <file> <nameInRelease> [mime]');
  process.exit(1);
}

const TOKEN = process.env.GH_TOKEN;
if (!TOKEN) { console.error('需要环境变量 GH_TOKEN'); process.exit(1); }

const name = nameInRelease || path.basename(file);
const ext = path.extname(name).toLowerCase();
const MIME = {
  '.html': 'text/html', '.htm': 'text/html',
  '.txt': 'text/plain', '.cfg': 'text/plain', '.md': 'text/markdown',
  '.zip': 'application/zip', '.dll': 'application/octet-stream',
  '.png': 'image/png', '.jpg': 'image/jpeg', '.json': 'application/json',
};
const contentType = mimeOverride || MIME[ext] || 'application/octet-stream';

const data = fs.readFileSync(file);
const repo = 'will86863/TomoyoAfterSteamCHSPatch';
const url = `https://uploads.github.com/repos/${repo}/releases/${releaseId}/assets`
  + `?name=${encodeURIComponent(name)}`;

const req = https.request(url, {
  method: 'POST',
  headers: {
    'Authorization': `Bearer ${TOKEN}`,
    'Accept': 'application/vnd.github+json',
    'Content-Type': contentType,
    'Content-Length': data.length,
    'User-Agent': 'release-uploader',
  },
}, (res) => {
  let buf = '';
  res.on('data', d => buf += d);
  res.on('end', () => {
    try {
      const j = JSON.parse(buf);
      if (j.id) {
        console.log(`OK  ${j.name}  ${j.size}  ${j.state}`);
      } else {
        console.error('失败:', j.message || buf.slice(0, 200));
        process.exit(1);
      }
    } catch (e) {
      console.error('解析失败:', buf.slice(0, 200));
      process.exit(1);
    }
  });
});
req.on('error', e => { console.error('请求错误:', e.message); process.exit(1); });
req.write(data);
req.end();
