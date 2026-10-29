'use strict';
/**
 * 校验 version.dll 内嵌的 SEEN_CHS 数据能否被正确回读。
 * 复刻 VersionInjectionPatch/data.cpp 的 BinFileToPatchPack 解析逻辑，
 * 从 DLL 的 RCDATA 资源中取出数据并按格式逐层解析，最后抽样打印译文。
 *
 * 用法: node tools/verify_dll.js [path/to/version.dll]
 */
const fs = require('fs');
const path = require('path');

const DLL = process.argv[2]
  || path.join(__dirname, '..', 'Release', 'version.dll');

const BIN_MAGIC = 0x54504c56, PACK_BIN_MAGIC = 0x4b434150;
const TEXT_BIN_MAGIC = 0x4e454553, NAME_BIN_MAGIC = 0x454d414e;
const PERES_BIN_MAGIC = 0x53524550, SHOT_TEXT_SIZE = 10;

const buf = fs.readFileSync(DLL);

// ---------- 从 PE 里定位 RCDATA ----------
function extractRcdata(b) {
  const pe = b.readUInt32LE(0x3c);
  if (b.readUInt32LE(pe) !== 0x4550) throw new Error('不是有效 PE 文件');
  const numSec = b.readUInt16LE(pe + 6);
  const optSize = b.readUInt16LE(pe + 20);
  const ddOff = pe + 24 + 96;
  const rsrcRVA = b.readUInt32LE(ddOff + 16);
  if (!rsrcRVA) throw new Error('没有资源表');
  let secOff = pe + 24 + optSize, base = -1;
  for (let k = 0; k < numSec; k++) {
    const off = secOff + k * 40;
    const name = b.slice(off, off + 8).toString('latin1').replace(/\0/g, '');
    const va = b.readUInt32LE(off + 12);
    const rawptr = b.readUInt32LE(off + 20);
    if (name === '.rsrc') base = rawptr + (rsrcRVA - va);
  }
  if (base < 0) throw new Error('找不到 .rsrc 节');

  // 第一层：找类型 10 (RCDATA)
  const ids = b.readUInt16LE(base + 14);
  let typeSub = -1;
  for (let k = 0; k < ids; k++) {
    const o = base + 16 + k * 8;
    if (b.readUInt32LE(o) === 10) typeSub = b.readUInt32LE(o + 4) & 0x7fffffff;
  }
  if (typeSub < 0) throw new Error('没有 RCDATA 资源');

  // 第二层：取第一个 ID（应为 1001）
  const sub = base + typeSub;
  const n2 = b.readUInt16LE(sub + 14);
  if (!n2) throw new Error('RCDATA 为空');
  const langSub = base + (b.readUInt32LE(sub + 16 + 4) & 0x7fffffff);

  // 第三层：语言，取 data entry
  const de = b.readUInt32LE(langSub + 16 + 4);
  const dOff = base + de;
  const rva = b.readUInt32LE(dOff), size = b.readUInt32LE(dOff + 4);
  const off = base + (rva - rsrcRVA);
  return b.slice(off, off + size);
}

// ---------- 解析 PatchPack ----------
const GBK_DEC = new TextDecoder('gbk');
const gbk = (b) => GBK_DEC.decode(b);

const data = extractRcdata(buf);
let p = 0;
function rdDword() { const v = data.readUInt32LE(p); p += 4; return v; }

const magic1 = rdDword(), magic2 = rdDword();
if (magic1 !== BIN_MAGIC || magic2 !== PACK_BIN_MAGIC) {
  throw new Error(`打包魔数不符: ${magic1.toString(16)} ${magic2.toString(16)}`);
}
const pSize = rdDword();
console.log('RCDATA 大小:', size_fmt(data.length));
console.log('章节数:', pSize);

const chapters = [];
let totalEntries = 0;

for (let i = 0; i < pSize; i++) {
  const blkSize = rdDword();
  const end = p + blkSize;
  const m1 = rdDword(), m2 = rdDword();
  if (m1 !== BIN_MAGIC || m2 !== TEXT_BIN_MAGIC) throw new Error(`第 ${i} 章魔数错`);
  const seenNo = rdDword();
  const cnt = rdDword();
  const entries = [];
  for (let j = 0; j < cnt; j++) {
    const replaceFlag = rdDword();
    const offset = rdDword();
    const length = rdDword();
    const tSize = rdDword();
    const trans = gbk(data.slice(p, p + tSize)); p += tSize;
    let origin = '';
    if (length <= SHOT_TEXT_SIZE) {
      const oSize = rdDword();
      origin = gbk(data.slice(p, p + oSize)); p += oSize;
    }
    entries.push({ replaceFlag, offset, length, trans, origin });
  }
  p = end; // 对齐到块边界，防止累计误差
  chapters.push({ seenNo, entries });
  totalEntries += cnt;
}

// 尾部：name 与 pe_resource
const nameSize = rdDword();
const nameEnd = p + nameSize;
const nm1 = rdDword(), nm2 = rdDword(), nCount = rdDword();
const namePairs = [];
if (nm1 === BIN_MAGIC && nm2 === NAME_BIN_MAGIC) {
  for (let i = 0; i < nCount; i++) {
    const oS = rdDword(), tS = rdDword();
    const o = gbk(data.slice(p, p + oS)); p += oS;
    const t = gbk(data.slice(p, p + tS)); p += tS;
    namePairs.push([o, t]);
  }
}
p = nameEnd;

const peresSize = rdDword();
const peresEnd = p + peresSize;
const pm1 = rdDword(), pm2 = rdDword(), peCount = rdDword();
const peres = [];
if (pm1 === BIN_MAGIC && pm2 === PERES_BIN_MAGIC) {
  for (let i = 0; i < peCount; i++) {
    const rva = rdDword(), length = rdDword(), tS = rdDword();
    const t = gbk(data.slice(p, p + tS)); p += tS;
    peres.push({ rva, length, trans: t });
  }
}
p = peresEnd;

function size_fmt(n) { return (n / 1024).toFixed(1) + ' KB'; }

// ---------- 报告 ----------
console.log('条目总数:', totalEntries);
console.log('name 条目:', namePairs.length);
console.log('pe_resource 条目:', peres.length);
console.log('数据末尾剩余字节:', data.length - p, '(应为 0)');

// 中文统计
let cnEntries = 0, cnChars = 0, emptyTrans = 0;
const samples = [];
for (const ch of chapters) {
  for (const e of ch.entries) {
    const cn = (e.trans.match(/[\u4e00-\u9fa5]/g) || []).length;
    if (cn) { cnEntries++; cnChars += cn; }
    if (!e.trans.trim()) emptyTrans++;
  }
}
console.log('含中文条目:', cnEntries, '/', totalEntries);
console.log('中文字符总数:', cnChars);
console.log('空译文条目:', emptyTrans);

// 抽样
const ch0628 = chapters.find(c => c.seenNo === 628);
console.log('\n--- seen0628 前 3 条 ---');
(ch0628 ? ch0628.entries.slice(0, 3) : []).forEach(e => {
  console.log(`  offset=${e.offset} length=${e.length}`);
  if (e.origin) console.log('   EN: ' + e.origin.slice(0, 50));
  console.log('   ZH: ' + e.trans.slice(0, 50));
});

// 抽查几条长文本
const withLong = [];
for (const ch of chapters) for (const e of ch.entries) {
  if (e.trans.length > 40 && /[\u4e00-\u9fa5]/.test(e.trans)) withLong.push({ seen: ch.seenNo, ...e });
}
console.log('\n--- 长译文抽样 3 条 ---');
withLong.slice(0, 3).forEach(e => {
  console.log(`  seen${e.seen} offset=${e.offset}`);
  console.log('   ZH: ' + e.trans.slice(0, 60));
});

// 校验结论
const ok = data.length === p && totalEntries > 20000 && cnEntries > 15000;
console.log('\n结论:', ok ? '✅ 结构完整、译文齐备' : '❌ 校验未通过');
process.exit(ok ? 0 : 1);
