#!/usr/bin/env node
/**
 * GitHub Release 上传工具（Node 版，全程 UTF-8，不会出现问号）
 *
 * 用法：
 *   node upload_release.js              # 创建/更新 v1.2.0 Release 并上传文件
 *   node upload_release.js --dry-run    # 只打印将要做什么，不实际请求
 *   node upload_release.js --delete     # 只删除现有 Release
 *
 * 依赖：本机已用 git credential 存过 GitHub 凭据
 */

const fs = require('fs');
const path = require('path');
const https = require('https');
const { execSync } = require('child_process');

const REPO = 'will86863/TomoyoAfterSteamCHSPatch';
const TAG = 'v1.2.0';

const SRC_DIR = path.join(
  __dirname,
  'TomoyoAfterSteamCHSPatch-v1.2.0'
);

const RELEASE_NAME = 'v1.2.0 - 完整汉化版';

const RELEASE_BODY = `## 本版更新

- **patch/ 更新至完整译文**：98 章、20,792 条全部汉化
- **重新编译 version.dll**：去除调试诊断代码，体积 1,001,472 字节
- **仓库精简**：移除 \`guide/\`（全成就指南）与 \`tools/\`（迁移脚本）目录
- **README 重写**：补充仓库结构、patch 文件格式说明、版本历史

## 包含内容

| 文件 | 说明 |
| --- | --- |
| \`version.dll\` | 汉化补丁主程序（文本已内嵌） |
| \`g00-chs.zip\` | 中文贴图替换包（984 个 .g00） |
| \`Guide.html\` | 全成就中文指南（PSP 对照） |
| \`patch_mode.cfg\` | 补丁模式配置（默认 0） |
| \`README.txt\` | 安装说明 |

## 安装

1. \`version.dll\` 复制到游戏根目录
2. \`g00-chs.zip\` 解压后复制到游戏 \`g00/\` 文件夹，覆盖同名文件（建议先备份）
3. 启动游戏

## 已知问题

- **全屏逐字叙述不显示中文**：全屏白底逐字弹出的叙述模式（\`SEEN9900\`）不经过 consume hook，该模式下显示英文原文
- **部分贴图错位**：中文贴图中有个别存在错位，待修复

## 译文来源

- PSP 版汉化文本：CK-GAL 中文化小组（澄空学园）PSP 完整汉化补丁 ver1.20
- 移植与补译：DeepSeek-V4.1
- 中文贴图：Nice Rabbit
- 攻略：咲夜

仅限非商业用途。`;

// GitHub Release 资产名只接受 ASCII，中文名会被拒绝(422)或降级成 default.*
// 因此上传用 ASCII 名，本地保留中文名。
const FILES = [
  { local: 'version.dll', remote: 'version.dll' },
  { local: 'g00-chs.zip', remote: 'g00-chs.zip' },
  { local: 'Guide.html', remote: 'Guide.html' },
  { local: 'patch_mode.cfg', remote: 'patch_mode.cfg' },
  { local: 'README.txt', remote: 'README.txt' },
];

const args = process.argv.slice(2);
const DRY = args.includes('--dry-run');
const DELETE_ONLY = args.includes('--delete');
const UPLOAD_ONLY = args.includes('--upload-only');

function getToken() {
  // 优先读环境变量
  if (process.env.GITHUB_TOKEN) return process.env.GITHUB_TOKEN.trim();

  // 其次走 git credential（跨平台）
  const { spawnSync } = require('child_process');
  const r = spawnSync('git', ['credential', 'fill'], {
    input: 'protocol=https\nhost=github.com\n\n',
    encoding: 'utf8',
  });
  if (r.status === 0 && r.stdout) {
    const m = r.stdout.match(/^password=(.+)$/m);
    if (m) return m[1].trim();
  }
  throw new Error('未能取得 token：请设置 GITHUB_TOKEN 或先配置 git 凭据');
}

/** 发 HTTP 请求，body 为 Buffer（UTF-8 编码），避免任何编码问题 */
function request(method, url, token, bodyBuf, extraHeaders = {}) {
  return new Promise((resolve, reject) => {
    const u = new URL(url);
    const headers = {
      Authorization: `token ${token}`,
      Accept: 'application/vnd.github+json',
      'X-GitHub-Api-Version': '2022-11-28',
      'User-Agent': 'node-release-uploader',
      ...extraHeaders,
    };
    if (bodyBuf) {
      headers['Content-Length'] = Buffer.byteLength(bodyBuf);
    }
    const req = https.request(
      { hostname: u.hostname, path: u.pathname + u.search, method, headers },
      (res) => {
        const chunks = [];
        res.on('data', (c) => chunks.push(c));
        res.on('end', () => {
          const text = Buffer.concat(chunks).toString('utf8');
          let json = null;
          try {
            json = JSON.parse(text);
          } catch (_) {
            /* 非 JSON */
          }
          if (res.statusCode >= 200 && res.statusCode < 300) {
            resolve(json || text);
          } else {
            reject(
              new Error(
                `HTTP ${res.statusCode}: ${json ? json.message : text.slice(0, 300)}`
              )
            );
          }
        });
      }
    );
    req.on('error', reject);
    if (bodyBuf) req.write(bodyBuf);
    req.end();
  });
}

/**
 * 上传文件：GitHub 的 assets 接口接受【纯二进制】body，
 * 文件名通过 URL 的 ?name= 参数指定（不能用 multipart，否则会把包装存进资产）。
 */
function uploadAsset(uploadUrl, token, filePath, assetName) {
  return new Promise((resolve, reject) => {
    let fileBuf;
    try {
      fileBuf = fs.readFileSync(filePath);
    } catch (e) {
      return reject(e);
    }

    // upload_url 形如 .../assets{?name,label}，必须去掉模板占位符
    const cleanUploadUrl = uploadUrl.replace(/\{[^}]*\}$/, '');
    const baseUrl = new URL(cleanUploadUrl);
    const uu = new URL(
      `https://uploads.github.com${baseUrl.pathname}?name=${encodeURIComponent(assetName)}`
    );

    const headers = {
      Authorization: `token ${token}`,
      Accept: 'application/vnd.github+json',
      'X-GitHub-Api-Version': '2022-11-28',
      'User-Agent': 'node-release-uploader',
      'Content-Type': 'application/octet-stream',
      'Content-Length': fileBuf.length,
    };

    const req = https.request(
      {
        hostname: uu.hostname,
        path: uu.pathname + uu.search,
        method: 'POST',
        headers,
      },
      (res) => {
        const chunks = [];
        res.on('data', (c) => chunks.push(c));
        res.on('end', () => {
          const text = Buffer.concat(chunks).toString('utf8');
          let json = null;
          try {
            json = JSON.parse(text);
          } catch (_) {}
          if (res.statusCode >= 200 && res.statusCode < 300) {
            resolve(json || text);
          } else {
            reject(
              new Error(
                `HTTP ${res.statusCode}: ${json ? json.message : text.slice(0, 300)}`
              )
            );
          }
        });
      }
    );
    req.on('error', reject);
    req.end(fileBuf);
  });
}

(async () => {
  console.log('=== GitHub Release 上传（Node / UTF-8）===');
  console.log('仓库 :', REPO);
  console.log('标签 :', TAG);
  console.log('标题 :', RELEASE_NAME);
  console.log('源目录:', SRC_DIR);
  console.log('');

  const token = getToken();
  console.log('[1/4] token 已取得，长度', token.length);

  const apiBase = `https://api.github.com/repos/${REPO}`;

  // --- 查现有 Release ---
  let existing = null;
  try {
    existing = await request('GET', `${apiBase}/releases/tags/${TAG}`, token);
    console.log('  Release 已存在 id =', existing.id);
  } catch (e) {
    console.log('  Release 不存在（正常）');
  }

  // --- 只补传文件模式 ---
  if (UPLOAD_ONLY) {
    if (!existing) {
      console.log('✗ --upload-only 需要 Release 已存在');
      return;
    }
    // 先清掉已有资产，避免重名冲突
    if (existing.assets && existing.assets.length) {
      console.log(`[清理] 删除已有 ${existing.assets.length} 个资产...`);
      for (const a of existing.assets) {
        try {
          await request('DELETE', `${apiBase}/releases/assets/${a.id}`, token);
          console.log('  已删:', JSON.stringify(a.name));
        } catch (e) {
          console.log('  删除失败:', a.name, e.message);
        }
      }
    }
    console.log('[补传] 上传文件到现有 Release...');
    for (const f of FILES) {
      const p = path.join(SRC_DIR, f.local);
      if (!fs.existsSync(p)) {
        console.log(`  ✗ 不存在: ${f.local}`);
        continue;
      }
      const mb = (fs.statSync(p).size / 1024 / 1024).toFixed(2);
      process.stdout.write(`  ${f.remote} (${mb} MB) ... `);
      try {
        const asset = await uploadAsset(existing.upload_url, token, p, f.remote);
        console.log('✓', JSON.stringify(asset.name), asset.size, 'bytes');
      } catch (e) {
        console.log('✗', e.message);
      }
    }
    const chk = await request('GET', `${apiBase}/releases/${existing.id}`, token);
    console.log('\n=== 资产清单 ===');
    (chk.assets || []).forEach((a) =>
      console.log('  -', JSON.stringify(a.name), a.size, 'bytes')
    );
    console.log('\n发布页:', chk.html_url);
    return;
  }

  if (DRY) {
    console.log('\n[DRY-RUN] 将执行：');
    if (existing) console.log('  - 删除旧 Release', existing.id);
    console.log('  - 创建新 Release');
    FILES.forEach((f) => console.log('  - 上传', f.remote));
    return;
  }

  // --- 删除旧 Release ---
  if (existing) {
    console.log('[2/4] 删除损坏的旧 Release...');
    await request('DELETE', `${apiBase}/releases/${existing.id}`, token);
    console.log('  ✓ 已删除');
  } else {
    console.log('[2/4] 无需删除');
  }

  if (DELETE_ONLY) {
    console.log('\n已删除，未重建（--delete 模式）');
    return;
  }

  // --- 创建新 Release（body 显式 UTF-8 编码）---
  console.log('[3/4] 创建新 Release...');
  const payload = JSON.stringify({
    tag_name: TAG,
    name: RELEASE_NAME,
    body: RELEASE_BODY,
    draft: false,
    prerelease: false,
  });
  const bodyBuf = Buffer.from(payload, 'utf8');

  const release = await request(
    'POST',
    `${apiBase}/releases`,
    token,
    bodyBuf,
    { 'Content-Type': 'application/json; charset=utf-8' }
  );

  console.log('  ✓ 已创建:', release.html_url);
  console.log('    标题回读:', JSON.stringify(release.name));

  // --- 上传文件 ---
  console.log('[4/4] 上传文件...');
  for (const f of FILES) {
    const p = path.join(SRC_DIR, f.local);
    if (!fs.existsSync(p)) {
      console.log(`  ✗ 不存在: ${f.local}`);
      continue;
    }
    const mb = (fs.statSync(p).size / 1024 / 1024).toFixed(2);
    process.stdout.write(`  ${f.remote} (${mb} MB) ... `);
    try {
      const asset = await uploadAsset(release.upload_url, token, p, f.remote);
      console.log('✓', JSON.stringify(asset.name), asset.size, 'bytes');
    } catch (e) {
      console.log('✗', e.message);
    }
  }

  // --- 回读验证 ---
  console.log('\n=== 回读验证 ===');
  const check = await request('GET', `${apiBase}/releases/${release.id}`, token);
  console.log('标题:', JSON.stringify(check.name));
  console.log('正文前80字:', JSON.stringify((check.body || '').slice(0, 80)));
  console.log('资产:');
  (check.assets || []).forEach((a) =>
    console.log('  -', JSON.stringify(a.name), a.size, 'bytes')
  );
  console.log('\n发布页:', check.html_url);
})().catch((e) => {
  console.error('\n✗ 失败:', e.message);
  process.exit(1);
});
