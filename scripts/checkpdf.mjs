#!/usr/bin/env node
// Inspect a rendered PDF: page count, page size, embedded fonts.
// Exists to catch the silent failure mode - a font that fell back to Times.
// usage: node checkpdf.mjs doc.pdf
import { readFileSync } from 'node:fs';
import { inflateSync } from 'node:zlib';

const file = process.argv[2];
if (!file) { console.error('usage: node checkpdf.mjs doc.pdf'); process.exit(2); }

const buf = readFileSync(file);
const parts = [buf];
// Chrome writes compressed object streams; inflate what we can and scan everything.
const re = /stream\r?\n/g;
const text = buf.toString('latin1');
let m;
while ((m = re.exec(text)) !== null) {
  const start = m.index + m[0].length;
  const end = text.indexOf('endstream', start);
  if (end < 0) continue;
  try { parts.push(inflateSync(buf.subarray(start, end))); } catch {}
}
const all = Buffer.concat(parts).toString('latin1');

const pages = (all.match(/\/Type\s*\/Pages[\s\S]{0,200}?\/Count\s+(\d+)/) || [])[1]
           || (all.match(/\/Count\s+(\d+)/) || [])[1] || '?';

const box = (all.match(/\/MediaBox\s*\[\s*([\d.\-]+)\s+([\d.\-]+)\s+([\d.\-]+)\s+([\d.\-]+)\s*\]/) || []);
const mm = pt => (Number(pt) * 25.4 / 72).toFixed(0);
const size = box.length ? `${mm(box[3] - box[1])} x ${mm(box[4] - box[2])} mm` : 'unknown';

const fonts = [...new Set([...all.matchAll(/\/BaseFont\s*\/([A-Za-z0-9+\-,#]+)/g)]
  .map(x => x[1].replace(/^[A-Z]{6}\+/, '')))].sort();

console.log(`pages : ${pages}`);
console.log(`size  : ${size}`);
console.log(`fonts : ${fonts.join(', ') || 'none found'}`);

// Verdana is the renderer's own header/footer face, so it is expected noise.
const fallback = fonts.filter(f => /Times|ArialMT|Helvetica/i.test(f));
if (fallback.length) {
  console.log(`\nWARNING: fallback face present -> ${fallback.join(', ')}`);
  console.log('A font failed to load. Check for variable fonts, remote @import, or an unquoted family name.');
  process.exit(1);
}
console.log('\nOK - no fallback faces.');
