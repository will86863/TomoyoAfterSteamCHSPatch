'use strict';
/**
 * 把 patch/*.txt 打包成 SEEN_CHS.TXT（PATCH_ARCHIVE 格式），供编译进 version.dll 的 RCDATA。
 *
 * 复刻 VersionInjectionPatch/data.cpp 的持久化格式：
 *   PatchPack       : BIN(0x54504C56) PACK(0x4B434150) nTexts
 *                     [每个 TextDataArray 前置 DWORD size][数据]
 *                     [NameDataArray  前置 DWORD size][数据]
 *                     [PEResourceArray 前置 DWORD size][数据]
 *   TextDataArray   : BIN TEXT(0x4E454553) seenNo count
 *                     每项: replaceFlag offset length transSize transBytes
 *                           (length<=SHOT_TEXT_SIZE 时再跟 originSize originBytes)
 *   NameDataArray   : BIN NAME(0x454D414E) count
 *                     每项: originSize transSize originBytes transBytes
 *   PEResourceArray : BIN PERES(0x53524550) count
 *                     每项: rva length transSize transBytes
 *
 * 文本一律转 GBK（引擎运行时就是 GBK，且 translSize 用于长度判定）。
 * 用法: node tools/pack_seen.js [输出路径]
 */
const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const PATCH_DIR = path.join(ROOT, 'patch');
const OUT = process.argv[2] || path.join(__dirname, 'SEEN_CHS.TXT');

const BIN_MAGIC = 0x54504c56, PACK_BIN_MAGIC = 0x4b434150;
const TEXT_BIN_MAGIC = 0x4e454553, NAME_BIN_MAGIC = 0x454d414e;
const PERES_BIN_MAGIC = 0x53524550, SHOT_TEXT_SIZE = 10;

// ---------- GBK 编码 ----------
// Node 的 Buffer 不支持 GBK 编码，用 TextDecoder 做不了编码方向，
// 这里用一张由 ICU 生成的 GBK 表：借助 decodeGBK 反查。
// 简化稳妥做法：生成 GBK 码表一次并缓存。
let gbkTable = null;
function buildGbkTable() {
  const dec = new TextDecoder('gbk');
  const map = new Map();
  for (let hi = 0x81; hi <= 0xfe; hi++) {
    for (let lo = 0x40; lo <= 0xfe; lo++) {
      if (lo === 0x7f) continue;
      const ch = dec.decode(Uint8Array.from([hi, lo]));
      if (ch.length === 1 && ch !== '\uFFFD') {
        if (!map.has(ch)) map.set(ch, [hi, lo]);
      }
    }
  }
  return map;
}
function toGbk(str) {
  if (!gbkTable) gbkTable = buildGbkTable();
  const out = [];
  for (const ch of str) {
    const code = ch.codePointAt(0);
    if (code < 0x80) { out.push(code); continue; }
    const b = gbkTable.get(ch);
    if (b) out.push(b[0], b[1]);
    else out.push(0x3f); // '?' 无法编码
  }
  return Buffer.from(out);
}

// ---------- 解析 patch/*.txt ----------
const SEP = /^=+\s*$/;
function parsePatchFile(text) {
  text = text.replace(/^\uFEFF/, '').replace(/\r\n/g, '\n');
  const m = text.match(/^(type\s+(\S+)\s*\ncount\s+(\d+)[^\n]*\n)/);
  const seenNoRaw = m ? m[2] : '';
  const body = m ? text.slice(m[0].length) : text;
  const lines = body.split('\n');
  const entries = [];
  let i = 0;
  while (i < lines.length) {
    const s = lines[i].trim();
    if (!(s.startsWith('index ') || s.startsWith('length '))) { i++; continue; }
    const hdr = [];
    while (i < lines.length && !SEP.test(lines[i])) { hdr.push(lines[i]); i++; }
    i++; // 跳过分隔线
    const orig = [];
    while (i < lines.length && !SEP.test(lines[i])) { orig.push(lines[i]); i++; }
    i++;
    let trans = null;
    if (i < lines.length && !SEP.test(lines[i])) {
      const nx = lines[i].trim();
      if (!(nx.startsWith('index ') || nx.startsWith('length ') || nx.startsWith('replace_flag'))) {
        const tb = [];
        while (i < lines.length && !SEP.test(lines[i])) { tb.push(lines[i]); i++; }
        trans = tb.join('\n');
        i++;
      }
    }
    const meta = {};
    for (const h of hdr) { const p = h.indexOf(' '); if (p > 0) meta[h.slice(0, p)] = h.slice(p + 1); }
    entries.push({ meta, orig: orig.join('\n'), trans: trans === null ? orig.join('\n') : trans });
  }
  return { seenNoRaw, entries };
}

function seenNoFrom(raw, filename) {
  // type 里是 seen628 这类形式，去掉 seen 前缀按数字解析
  let v = (raw || '').replace(/^seen/i, '');
  if (/^\d+$/.test(v)) return parseInt(v, 10);
  const m = filename.match(/(\d+)/);
  return m ? parseInt(m[1], 10) : 0;
}

// ---------- 二进制写入 ----------
const dwords = [];
function dw(v) { const b = Buffer.alloc(4); b.writeUInt32LE(v >>> 0, 0); dwords.push(b); }

function textArrayBin(seenNo, entries) {
  const parts = [];
  const head = Buffer.alloc(12);
  head.writeUInt32LE(BIN_MAGIC, 0);
  head.writeUInt32LE(TEXT_BIN_MAGIC, 4);
  head.writeUInt32LE(seenNo, 8);
  parts.push(head);
  const cnt = Buffer.alloc(4); cnt.writeUInt32LE(entries.length, 0); parts.push(cnt);
  for (const e of entries) {
    const transBuf = toGbk(e.trans);
    const origBuf = toGbk(e.orig);
    const offset = parseInt(e.meta.offset || '0', 10);
    const length = parseInt(e.meta.length || '0', 10);
    const h = Buffer.alloc(16);
    h.writeUInt32LE(0, 0);                 // replaceFlag
    h.writeUInt32LE(offset, 4);
    h.writeUInt32LE(length, 8);
    h.writeUInt32LE(transBuf.length, 12);
    parts.push(h, transBuf);
    if (length <= SHOT_TEXT_SIZE) {
      const os = Buffer.alloc(4); os.writeUInt32LE(origBuf.length, 0);
      parts.push(os, origBuf);
    }
  }
  return Buffer.concat(parts);
}

function nameArrayBin(pairs) {
  const parts = [];
  const head = Buffer.alloc(8);
  head.writeUInt32LE(BIN_MAGIC, 0);
  head.writeUInt32LE(NAME_BIN_MAGIC, 4);
  parts.push(head);
  const cnt = Buffer.alloc(4); cnt.writeUInt32LE(pairs.length, 0); parts.push(cnt);
  for (const [o, t] of pairs) {
    const ob = toGbk(o), tb = toGbk(t);
    const h = Buffer.alloc(8);
    h.writeUInt32LE(ob.length, 0);
    h.writeUInt32LE(tb.length, 4);
    parts.push(h, ob, tb);
  }
  return Buffer.concat(parts);
}

function peresArrayBin(pairs) {
  const parts = [];
  const head = Buffer.alloc(8);
  head.writeUInt32LE(BIN_MAGIC, 0);
  head.writeUInt32LE(PERES_BIN_MAGIC, 4);
  parts.push(head);
  const cnt = Buffer.alloc(4); cnt.writeUInt32LE(pairs.length, 0); parts.push(cnt);
  for (const p of pairs) {
    const tb = toGbk(p.trans);
    const h = Buffer.alloc(12);
    h.writeUInt32LE(p.rva, 0);
    h.writeUInt32LE(p.length, 4);
    h.writeUInt32LE(tb.length, 8);
    parts.push(h, tb);
  }
  return Buffer.concat(parts);
}

// ---------- 主流程 ----------
const files = fs.readdirSync(PATCH_DIR).filter(f => /^seen\d+\.txt$/i.test(f)).sort();
const textArrays = [];
let totalEntries = 0;

for (const f of files) {
  const { seenNoRaw, entries } = parsePatchFile(fs.readFileSync(path.join(PATCH_DIR, f), 'utf8'));
  if (!entries.length) continue;
  const seenNo = seenNoFrom(seenNoRaw, f);
  textArrays.push({ seenNo, bin: textArrayBin(seenNo, entries) });
  totalEntries += entries.length;
}

// name.txt / pe_resource.txt 单独处理
function parseNameFile(file) {
  const txt = fs.readFileSync(file, 'utf8').replace(/^\uFEFF/, '').replace(/\r\n/g, '\n');
  const lines = txt.split('\n');
  const out = [];
  let i = 0;
  while (i < lines.length) {
    if (!/^=+\s*$/.test(lines[i])) { i++; continue; }
    i++;
    const o = [];
    while (i < lines.length && !/^=+\s*$/.test(lines[i])) { o.push(lines[i]); i++; }
    i++;
    if (i >= lines.length) break;
    const t = [];
    while (i < lines.length && !/^=+\s*$/.test(lines[i])) { t.push(lines[i]); i++; }
    if (o.length && t.length) out.push([o.join('\n'), t.join('\n')]);
  }
  return out;
}

const namePairs = fs.existsSync(path.join(PATCH_DIR, 'name.txt'))
  ? parseNameFile(path.join(PATCH_DIR, 'name.txt')) : [];

// pe_resource.txt 结构：index / rva / length 头部 + 原文 + 译文
const peresPairs = [];
const peFile = path.join(PATCH_DIR, 'pe_resource.txt');
if (fs.existsSync(peFile)) {
  const txt = fs.readFileSync(peFile, 'utf8').replace(/^\uFEFF/, '').replace(/\r\n/g, '\n');
  const blocks = txt.split(/^=+\s*$/m).map(s => s.trim()).filter(Boolean);
  // blocks: ["type pe_resource\ncount 1", "index 1\nrva 2201688\nlength 12", "Confirmation", "Confirmation", ...]
  for (let k = 0; k < blocks.length; k++) {
    const b = blocks[k];
    if (!/^index\s+\d+/i.test(b)) continue;
    const rvaM = b.match(/rva\s+(\d+)/i);
    const lenM = b.match(/length\s+(\d+)/i);
    if (!rvaM || !lenM) continue;
    const orig = blocks[k + 1] || '';
    const trans = blocks[k + 2] || orig;
    peresPairs.push({ rva: parseInt(rvaM[1], 10), length: parseInt(lenM[1], 10), trans });
    k += 2;
  }
}

const nameBin = nameArrayBin(namePairs);
const peresBin = peresArrayBin(peresPairs);

const parts = [];
const head = Buffer.alloc(12);
head.writeUInt32LE(BIN_MAGIC, 0);
head.writeUInt32LE(PACK_BIN_MAGIC, 4);
head.writeUInt32LE(textArrays.length, 8);
parts.push(head);
for (const t of textArrays) {
  const sz = Buffer.alloc(4); sz.writeUInt32LE(t.bin.length, 0);
  parts.push(sz, t.bin);
}
for (const b of [nameBin, peresBin]) {
  const sz = Buffer.alloc(4); sz.writeUInt32LE(b.length, 0);
  parts.push(sz, b);
}

const out = Buffer.concat(parts);
fs.writeFileSync(OUT, out);
console.log('章节数:', textArrays.length, '条目数:', totalEntries);
console.log('name 条目:', namePairs.length, ' PEResource 条目:', peresPairs.length);
console.log('输出:', OUT, (out.length / 1024 / 1024).toFixed(2), 'MB');
