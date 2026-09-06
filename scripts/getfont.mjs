#!/usr/bin/env node
// Download STATIC Google Font instances for print, and print the @font-face CSS.
//
// Two hard-won rules encoded here:
//  1. Chrome's PDF pipeline CANNOT embed variable fonts - they fall back to Times.
//  2. Google's API returns a VARIABLE file when you ask for several weights at once,
//     and a true STATIC instance when you ask for one weight at a time. So: one at a time.
//
// usage: node getfont.mjs "Newsreader:400,600,400italic" "Sora:600"
import { mkdirSync, writeFileSync, existsSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const CACHE = join(dirname(dirname(fileURLToPath(import.meta.url))), 'fonts');
mkdirSync(CACHE, { recursive: true });
const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';
const toUrl = p => 'file:///' + p.split(String.fromCharCode(92)).join('/');
const slug = s => s.replace(/[^A-Za-z0-9]+/g, '-').replace(/^-|-$/g, '');

const specs = process.argv.slice(2);
if (!specs.length) { console.error('usage: node getfont.mjs "Family:400,700,400italic" ...'); process.exit(2); }

const out = [];
for (const spec of specs) {
  const [family, list = '400'] = spec.split(':');
  for (const w of list.split(',').map(s => s.trim()).filter(Boolean)) {
    const italic = /italic$/i.test(w);
    const weight = w.replace(/italic$/i, '') || '400';
    // One weight per request - this is what makes the response a static instance.
    const url = `https://fonts.googleapis.com/css?family=${encodeURIComponent(family)}:${weight}${italic ? 'italic' : ''}`;
    let sheet;
    try {
      const res = await fetch(url, { headers: { 'User-Agent': UA } });
      if (!res.ok) throw new Error('HTTP ' + res.status);
      sheet = await res.text();
    } catch (e) { console.error(`FAILED ${family} ${w}: ${e.message}`); process.exitCode = 1; continue; }

    // Subsets arrive in order and latin is last - take the final block.
    const blocks = sheet.split('@font-face').slice(1);
    const last = blocks[blocks.length - 1] || '';
    const src = (last.match(/url\((https:\/\/fonts\.gstatic\.com[^)]+)\)/) || [])[1];
    const fam = (last.match(/font-family:\s*'([^']+)'/) || [])[1] || family;
    if (!src) { console.error(`FAILED ${family} ${w}: no font url (does that weight exist?)`); process.exitCode = 1; continue; }

    const file = `${slug(fam)}-${weight}${italic ? 'i' : ''}.woff2`;
    const dest = join(CACHE, file);
    if (!existsSync(dest)) {
      const f = await fetch(src, { headers: { 'User-Agent': UA } });
      if (!f.ok) { console.error(`FAILED ${family} ${w}: HTTP ${f.status}`); process.exitCode = 1; continue; }
      writeFileSync(dest, Buffer.from(await f.arrayBuffer()));
    }
    out.push(`@font-face{font-family:"${fam}";font-style:${italic ? 'italic' : 'normal'};font-weight:${weight};`
           + `font-display:block;src:url("${toUrl(dest)}") format("woff2")}`);
  }
}
console.log(out.join('\n'));
