#!/usr/bin/env node
// Dependency-free HTML -> PDF via Chrome DevTools Protocol.
// Gives what `chrome --print-to-pdf` cannot: running heads, page numbers,
// waits for document.fonts.ready, and fails loudly on font fallback.
import { spawn } from 'node:child_process';
import { mkdtempSync, writeFileSync, readFileSync, existsSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

const args = Object.fromEntries(
  process.argv.slice(2).filter(a => a.startsWith('--')).map(a => {
    const i = a.indexOf('=');
    return i === -1 ? [a.slice(2), true] : [a.slice(2, i), a.slice(i + 1)];
  })
);
const input = process.argv.slice(2).find(a => !a.startsWith('--'));
if (!input) {
  console.error('usage: node topdf.mjs page.html [--out=x.pdf] [--margin=18] [--header=HTML] [--footer=HTML] [--no-number] [--landscape]');
  process.exit(2);
}
const htmlPath = resolve(input);
const out = resolve(args.out || htmlPath.replace(/\.html?$/i, '') + '.pdf');
const mm = v => Number(v) / 25.4;                       // mm -> inches
const margin = args.margin === undefined ? 18 : Number(args.margin);
const marginTop = args['margin-top'] ?? margin;
const marginBottom = args['margin-bottom'] ?? margin;

const CHROME = [
  process.env.CHROME_PATH,
  'C:/Program Files/Google/Chrome/Application/chrome.exe',
  'C:/Program Files (x86)/Google/Chrome/Application/chrome.exe',
  '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
  '/usr/bin/google-chrome', '/usr/bin/chromium',
].find(p => p && existsSync(p));
if (!CHROME) { console.error('Chrome not found; set CHROME_PATH'); process.exit(3); }

const profile = mkdtempSync(join(tmpdir(), 'pdfcraft-'));
const chrome = spawn(CHROME, [
  '--headless', '--disable-gpu', '--no-first-run', '--no-default-browser-check',
  '--disable-extensions', '--remote-debugging-port=0', `--user-data-dir=${profile}`,
  '--font-render-hinting=none', 'about:blank',
], { stdio: ['ignore', 'ignore', 'pipe'] });

const cleanup = () => { try { chrome.kill(); } catch {} try { rmSync(profile, { recursive: true, force: true }); } catch {} };
process.on('exit', cleanup);

const portFile = join(profile, 'DevToolsActivePort');
const waitPort = async () => {
  for (let i = 0; i < 100; i++) {
    if (existsSync(portFile)) {
      const t = readFileSync(portFile, 'utf8').split('\n');
      if (t[0]) return t[0].trim();
    }
    await new Promise(r => setTimeout(r, 100));
  }
  throw new Error('Chrome did not expose a debugging port');
};

class CDP {
  constructor(url) { this.ws = new WebSocket(url); this.id = 0; this.pending = new Map(); this.handlers = new Map(); }
  open() { return new Promise((res, rej) => { this.ws.onopen = res; this.ws.onerror = e => rej(new Error('ws: ' + e.message));
    this.ws.onmessage = m => { const d = JSON.parse(m.data);
      if (d.id && this.pending.has(d.id)) { const { res, rej } = this.pending.get(d.id); this.pending.delete(d.id);
        d.error ? rej(new Error(d.error.message)) : res(d.result); }
      else if (d.method) (this.handlers.get(d.method) || []).forEach(h => h(d.params)); }; }); }
  on(m, h) { this.handlers.set(m, [...(this.handlers.get(m) || []), h]); }
  send(method, params = {}, sessionId) {
    const id = ++this.id;
    return new Promise((res, rej) => { this.pending.set(id, { res, rej });
      this.ws.send(JSON.stringify({ id, method, params, ...(sessionId ? { sessionId } : {}) })); });
  }
}

const esc = s => String(s).replace(/[&<>]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' }[c]));
const chrome_ = { font: 'font-family:Verdana,sans-serif;font-size:8pt;color:#7a7a7a' };

(async () => {
  const port = await waitPort();
  const ver = await (await fetch(`http://127.0.0.1:${port}/json/version`)).json();
  const cdp = new CDP(ver.webSocketDebuggerUrl);
  await cdp.open();

  const { targetId } = await cdp.send('Target.createTarget', { url: 'about:blank' });
  const { sessionId } = await cdp.send('Target.attachToTarget', { targetId, flatten: true });

  await cdp.send('Page.enable', {}, sessionId);
  const loaded = new Promise(r => cdp.on('Page.loadEventFired', r));
  await cdp.send('Page.navigate', { url: pathToFileURL(htmlPath).href }, sessionId);
  await Promise.race([loaded, new Promise(r => setTimeout(r, 20000))]);

  // Wait for webfonts, then two frames so layout settles.
  await cdp.send('Runtime.evaluate', {
    expression: `document.fonts.ready.then(()=>new Promise(r=>requestAnimationFrame(()=>requestAnimationFrame(r))))`,
    awaitPromise: true,
  }, sessionId);

  // Force every declared face to load, then report only genuine failures.
  // Filtering on status!=='loaded' would flag faces that are merely unused,
  // since CSS font loading is lazy - and a warning that cries wolf gets ignored.
  const { result: bad } = await cdp.send('Runtime.evaluate', {
    expression: `Promise.allSettled([...document.fonts].map(f=>f.load())).then(()=>JSON.stringify([...document.fonts].filter(f=>f.status==='error').map(f=>f.family)))`,
    awaitPromise: true,
    returnByValue: true,
  }, sessionId);
  const failed = JSON.parse(bad.value || '[]');
  if (failed.length) console.error('WARNING @font-face failed to load: ' + [...new Set(failed)].join(', '));

  const number = !args['no-number'];
  const header = args.header
    ? `<div style="${chrome_.font};width:100%;padding:0 ${margin}mm;display:flex;justify-content:space-between"><span>${esc(args.header)}</span></div>`
    : '<div></div>';
  const footer = (number || args.footer)
    ? `<div style="${chrome_.font};width:100%;padding:0 ${margin}mm;display:flex;justify-content:space-between">
         <span>${args.footer ? esc(args.footer) : ''}</span>
         ${number ? '<span class="pageNumber"></span>' : '<span></span>'}</div>`
    : '<div></div>';

  const { data } = await cdp.send('Page.printToPDF', {
    printBackground: true,
    preferCSSPageSize: true,
    landscape: !!args.landscape,
    displayHeaderFooter: !!(args.header || args.footer || number),
    headerTemplate: header,
    footerTemplate: footer,
    marginTop: mm(marginTop), marginBottom: mm(marginBottom),
    marginLeft: mm(margin), marginRight: mm(margin),
  }, sessionId);

  writeFileSync(out, Buffer.from(data, 'base64'));
  console.log(out);
  cleanup();
  process.exit(0);
})().catch(e => { console.error('FAILED: ' + e.message); cleanup(); process.exit(1); });
