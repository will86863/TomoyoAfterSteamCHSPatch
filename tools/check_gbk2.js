'use strict';
// 用 Windows GBK 码表精确检测：哪些字符经 UTF-8→GBK 转换会变成 '?'
const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');
const AL = require('./alignlib.js');

const OUT = process.env.PATCH_OUT || AL.PATCH_DIR; // 默认读仓库 patch/；如需检查 build_patch 的中间产物，设 PATCH_OUT=./out_patch

// 收集所有唯一字符
const chars = new Map();
for (const fname of fs.readdirSync(OUT).filter(f => f.endsWith('.txt')).sort()) {
  const text = fs.readFileSync(path.join(OUT, fname), 'utf8');
  for (const ch of text) {
    const c = ch.codePointAt(0);
    if (c < 0x80) continue;               // ASCII 一定安全
    if (!chars.has(ch)) chars.set(ch, { cp: c, files: new Set() });
    chars.get(ch).files.add(fname);
  }
}
console.log(`唯一非 ASCII 字符: ${chars.size}`);

// 生成 PowerShell 检测脚本
const list = [...chars.keys()];
const tmp = path.join(__dirname, '_chars.txt');
fs.writeFileSync(tmp, list.join('\n'), 'utf8');

// 用 PowerShell 批量检测（GBK 编码后反解是否等于原字符）
const ps = String.raw`
$gbk = [System.Text.Encoding]::GetEncoding(936)
$lines = [System.IO.File]::ReadAllLines('${tmp.replace(/'/g, "''")}', [System.Text.Encoding]::UTF8)
$bad = @()
foreach ($ch in $lines) {
  if ($ch.Length -eq 0) { continue }
  $b = $gbk.GetBytes($ch)
  $back = $gbk.GetString($b)
  if ($back -ne $ch) { $bad += ("{0}" -f [int][char]$ch) + [char]9 + $ch + [char]9 + (($b | ForEach-Object { '{0:X2}' -f $_ }) -join ' ') }
}
$bad | ForEach-Object { $_ }
`;
const psFile = path.join(__dirname, '_check_gbk.ps1');
fs.writeFileSync(psFile, ps, 'utf8');
const out = execSync(`powershell -NoProfile -ExecutionPolicy Bypass -File "${psFile}"`, { encoding: 'utf8' });
console.log('\n=== 不能被 GBK 表示的字符 ===');
const lines = out.split(/\r?\n/).filter(Boolean);
if (!lines.length) console.log('（无）');
for (const l of lines) {
  const [cp, ch] = l.split('\t');
  const rec = chars.get(ch);
  const files = rec ? [...rec.files].slice(0, 4).join(',') : '';
  console.log(`  U+${parseInt(cp).toString(16).toUpperCase().padStart(4, '0')} '${ch}'  文件: ${files}`);
}
