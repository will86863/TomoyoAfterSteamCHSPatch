'use strict';
/**
 * v23 第3层：未映射条目的语义补配
 *
 * 对 chapter/dated 两套策略都没映射上的条目，
 * 用「说话人 + 长度比 + 上下文位置」在全章搜索最佳候选，
 * 且要求目标位置的 PSP 句未被其他条目占用。
 */
const fs = require('fs');
const path = require('path');
const AL = require('./alignlib.js');

const map = JSON.parse(fs.readFileSync(path.join(__dirname, 'maps', 'map_merged.json'), 'utf8'));
const SRC = AL.PATCH_DIR;

const MARKER_RE = /^(BAD END|GAME OVER|TO BE CONTINUED|Ending|Epilogue|Prologue|Title|Menu|Save|Load|OK|Cancel|Yes|No|Back|Next)$/i;
const isMarker = (s) => MARKER_RE.test((s || '').replace(/\\"/g, '"').trim());

// 每章收集已占用的 PSP 位置
const occupied = {};
for (const ch of Object.keys(AL.MAP)) {
  occupied[ch] = {};   // pspText -> count（用文本做占用标记简化）
}

// 先统计已占用（用文本内容作为 key）
const usedText = {};
for (const ch of Object.keys(AL.MAP)) {
  usedText[ch] = new Set();
  for (const f of Object.keys(map[ch] || {})) {
    for (const k of Object.keys(map[ch][f])) usedText[ch].add(map[ch][f][k]);
  }
}

function scorePair(v, p, prefPos, myPos, totalV, totalP) {
  const se = AL.spkEquiv(v.nm, p.spk);
  const exp = Math.max(2, v.enW * 1.85);
  const lr = (p.n.length + 1.5) / (exp + 1.5);
  let s = 0;
  if (se === 'ok') s += 3; else if (se === 'unknown') s += 1.5;
  else if (se === 'weak') s += 0.8; else s -= 8;
  if (lr > 0.55 && lr < 1.8) s += 3;
  else if (lr > 0.45 && lr < 2.2) s += 1.5;
  else s -= 4;
  // 位置先验
  const expectP = (myPos / totalV) * totalP;
  const dev = Math.abs(prefPos - expectP) / Math.max(30, totalP * 0.1);
  s -= 0.8 * dev;
  if (isMarker(v.orig)) s -= 10;
  return s;
}

let added = 0;
const report = [];

for (const ch of Object.keys(AL.MAP)) {
  const P = AL.loadPSP(ch);
  const files = AL.MAP[ch];

  // 收集未映射条目
  const missing = [];
  files.forEach(f => {
    const V = AL.buildV([f]);
    const m = (map[ch] && map[ch][f]) || {};
    V.forEach((v, gi) => {
      if (m[v.i] === undefined) missing.push({ f, v, gi, totalV: V.length });
    });
  });
  if (!missing.length) continue;

  let got = 0;
  for (const item of missing) {
    const v = item.v;
    if (isMarker(v.orig)) continue;
    // 在全章搜索最佳未占用位置
    let best = { b: -1, s: -Infinity };
    for (let b = 0; b < P.length; b++) {
      if (usedText[ch].has(P[b].raw)) continue;
      const sc = scorePair(v, P[b], b, item.gi, item.totalV, P.length);
      if (sc > best.s) { best = { b, s: sc }; }
    }
    if (best.b < 0 || best.s < 3.0) continue;   // 门槛
    map[ch][item.f][v.i] = P[best.b].raw;
    usedText[ch].add(P[best.b].raw);
    got++; added++;
  }
  report.push({ ch, missing: missing.length, got });
}

console.log('语义补配结果：');
for (const r of report) console.log(`  ${r.ch}: 未映射 ${r.missing} 条 → 补配 ${r.got} 条`);
console.log(`\n合计补配 ${added} 条`);

fs.writeFileSync(path.join(__dirname, 'maps', 'map_merged.json'), JSON.stringify(map), 'utf8');
let tot = 0;
for (const ch of Object.keys(map)) for (const f of Object.keys(map[ch])) tot += Object.keys(map[ch][f]).length;
console.log(`更新后总计 ${tot} 条映射`);
