// Screenshots and browser checks through Playwright. Run after npm run build (npm run shots).
// Serves dist/ under /own-your-mosaic/ (the path of the GitHub Pages preview).
//
// Two sets of screenshots:
//   skeleton (default, PROMPT 01): 360/390/834/1440 full pages, hero at 390 and 1440,
//                                  the Process and Pricing blocks at 390 and 1440
//   design (--set design, PROMPT 02): full pages and hero at 390 and 1440, the Promise,
//                                  Meet your mentor and closing blocks at 390 and 1440,
//                                  Meet your mentor at 1280; 360 and 834 are checked only
//   design2 (--set design2, PROMPT 02b): as design, with the seam of Practical details and
//                                  the closing band (seam) instead of the closing block
// Checks on the way: no horizontal overflow (scrollWidth equals clientWidth), Lora and Inter
// loaded from the site itself, not one request to another origin, every photo loaded
// (naturalWidth above zero), on the phone the title and subtitle are on the first screen and
// the button within two screens, the TODO and draft tags are present, the weight of the
// first load at 390 (all files, and the pictures on their own), the computed font sizes,
// the height difference of the Meet your mentor columns, and the size of the inline mosaics.
//
// Options: --out <dir> (default ../screenshots 01 - каркас/, or SHOTS_DIR),
// --live <url> opens that address instead of the local server and takes live-390-hero.png
// and live-1440-hero.png with the same checks.

import { mkdir, readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright';
import { ROOT } from '../src/check.mjs';
import { startServer, PREVIEW_BASE, DIST } from './serve.mjs';

const DEFAULT_OUT_DIR = process.env.SHOTS_DIR || path.resolve(ROOT, '..', 'screenshots 01 - каркас');
export const VIEWPORTS = {
  360: { width: 360, height: 780, deviceScaleFactor: 2, isMobile: true, hasTouch: true },
  390: { width: 390, height: 844, deviceScaleFactor: 2, isMobile: true, hasTouch: true, weigh: true },
  834: { width: 834, height: 1194, deviceScaleFactor: 2, isMobile: true, hasTouch: true },
  1280: { width: 1280, height: 800, deviceScaleFactor: 1, isMobile: false, hasTouch: false },
  1440: { width: 1440, height: 900, deviceScaleFactor: 1, isMobile: false, hasTouch: false },
};
export const SETS = {
  skeleton: { 360: ['full'], 390: ['full', 'hero', 'process', 'pricing'], 834: ['full'], 1440: ['full', 'hero', 'process', 'pricing'] },
  design: { 360: [], 390: ['full', 'hero', 'promise', 'mentor', 'closing'], 834: [], 1280: ['mentor'], 1440: ['full', 'hero', 'promise', 'mentor', 'closing'] },
  design2: { 360: [], 390: ['full', 'hero', 'promise', 'mentor', 'seam'], 834: [], 1280: ['mentor'], 1440: ['full', 'hero', 'promise', 'mentor', 'seam'] },
  live: { 390: ['hero'], 1440: ['hero'] },
};
const BLOCKS = { process: '.process', pricing: '.pricing', promise: '.promise', mentor: '.proof', closing: '.closing' };

// Scrolls through the page so the lazy photos load, then back to the top.
async function loadEverything(page) {
  await page.evaluate(async () => {
    const step = window.innerHeight;
    for (let y = 0; y < document.documentElement.scrollHeight; y += step) {
      window.scrollTo(0, y);
      await new Promise((resolve) => setTimeout(resolve, 60));
    }
    window.scrollTo(0, 0);
    await Promise.all([...document.images].map((img) => (img.complete ? null : new Promise((resolve) => { img.onload = resolve; img.onerror = resolve; }))));
  });
  await page.evaluate(() => document.fonts.ready);
  await page.waitForTimeout(300);
}

function facts(page) {
  return page.evaluate(() => {
    const loadedFont = (family) => [...document.fonts].some((f) => f.family.replace(/"/g, '') === family && f.status === 'loaded');
    const rect = (selector) => {
      const node = document.querySelector(selector);
      if (!node) return null;
      const box = node.getBoundingClientRect();
      return { top: Math.round(box.top + window.scrollY), bottom: Math.round(box.bottom + window.scrollY), left: Math.round(box.left), right: Math.round(box.right) };
    };
    const size = (selector) => {
      const node = document.querySelector(selector);
      return node ? Math.round(parseFloat(getComputedStyle(node).fontSize) * 10) / 10 : null;
    };
    const h1 = document.querySelector('h1');
    const photos = document.querySelector('.proof__photos');
    const lastParagraph = [...document.querySelectorAll('.proof__copy p')].pop();
    const boxes = (selector) => [...document.querySelectorAll(selector)].map((node) => node.getBoundingClientRect());
    const intersects = (a, b) => a.left < b.right && b.left < a.right && a.top < b.bottom && b.top < a.bottom;
    // no tile of any mosaic may sit on a text box (the tiles of the Promise diagram carry
    // their own labels and are html, not svg, so they are not tiles here)
    const textBoxes = boxes('main p, main h1, main h2, main h3, main li, main dt, main dd, main figcaption, main blockquote, main .btn, main .tag').filter((b) => b.width > 0 && b.height > 0);
    const tileBoxes = [];
    for (const svgNode of document.querySelectorAll('svg.mosaic')) {
      const box = svgNode.getBoundingClientRect();
      if (!box.width || !box.height) continue;
      const use = svgNode.querySelector('use');
      if (use) {
        // a band drawing shown through <use>, at its own size: each tile of the symbol, mirrored on the right
        const symbol = document.querySelector(use.getAttribute('href'));
        const viewWidth = Number(svgNode.getAttribute('viewBox').split(' ')[2]);
        const mirrored = use.hasAttribute('transform');
        for (const r of symbol.querySelectorAll('rect')) {
          const [x, y, w, h] = ['x', 'y', 'width', 'height'].map((name) => Number(r.getAttribute(name)));
          const left = box.left + (mirrored ? viewWidth - x - w : x);
          tileBoxes.push({ left, right: left + w, top: box.top + y, bottom: box.top + y + h, width: w, height: h });
        }
      } else {
        for (const r of svgNode.querySelectorAll('rect')) {
          const b = r.getBoundingClientRect();
          if (b.width && b.height) tileBoxes.push(b);
        }
      }
    }
    const tilesOverText = tileBoxes.filter((t) => textBoxes.some((b) => intersects(t, b))).length;
    const field = boxes('.hero__field');
    const heroText = boxes('.hero__head, .hero__body');
    return {
      scrollWidth: document.documentElement.scrollWidth,
      clientWidth: document.documentElement.clientWidth,
      lora: document.fonts.check('500 16px Lora') && loadedFont('Lora'),
      inter: document.fonts.check('400 16px Inter') && loadedFont('Inter'),
      images: [...document.images].map((img) => ({ src: img.currentSrc, ok: img.naturalWidth > 0 })),
      title: rect('h1'),
      subtitle: rect('.hero__subtitle'),
      button: rect('.hero .btn'),
      buttons: document.querySelectorAll('a.btn').length,
      todoTags: document.querySelectorAll('.tag--todo').length,
      draftTags: document.querySelectorAll('.tag--draft').length,
      fonts: { h1: size('h1'), h2: size('h2'), h3: size('h3'), heroParagraph: size('.hero__body p'), body: size('.package__list li'), statement: size('.problem__text'), caps: size('.hero__positioning'), price: size('.tier__amount'), quote: size('.quote__text') },
      h1Lines: h1 ? Math.round(h1.getBoundingClientRect().height / parseFloat(getComputedStyle(h1).lineHeight)) : null,
      mentor: photos && lastParagraph && getComputedStyle(photos).display !== 'contents' ? { photosBottom: Math.round(photos.getBoundingClientRect().bottom + window.scrollY), textBottom: Math.round(lastParagraph.getBoundingClientRect().bottom + window.scrollY), sticky: getComputedStyle(photos).position } : null,
      heroFieldOverlapsText: field.some((f) => heroText.some((t) => intersects(f, t))),
      tilesOverText,
      tiles: tileBoxes.length,
      mosaics: document.querySelectorAll('svg.mosaic').length,
      closingTop: (() => { const node = document.querySelector('.closing'); return node ? Math.round(node.getBoundingClientRect().top + window.scrollY) : null; })(),
      // the band drawings hang 200 px above the band; they must never reach below its bottom edge
      bandOverflow: (() => {
        const band = document.querySelector('.closing');
        if (!band) return 0;
        const bottom = band.getBoundingClientRect().bottom;
        return Math.max(0, ...[...document.querySelectorAll('.closing svg.mosaic--band')].map((node) => node.getBoundingClientRect()).filter((b) => b.height > 0).map((b) => Math.round(b.bottom - bottom)));
      })(),
    };
  });
}

const kb = (bytes) => `${Math.round(bytes / 1024)} KB`;

// Bytes of the inline mosaics in the page (the <svg class="mosaic ..."> elements).
export function mosaicBytes(html) {
  return (html.match(/<svg class="mosaic[^]*?<\/svg>/g) || []).reduce((n, svg) => n + Buffer.byteLength(svg), 0);
}

export async function takeShots({ outDir = DEFAULT_OUT_DIR, liveUrl = '', set = 'skeleton' } = {}) {
  await mkdir(outDir, { recursive: true });
  const local = liveUrl ? null : await startServer(0);
  const base = liveUrl ? liveUrl.replace(/\/?$/, '/') : `${local.url}${PREVIEW_BASE}/`;
  const origin = new URL(base).origin;
  const plan = liveUrl ? SETS.live : SETS[set];
  if (!plan) throw new Error(`unknown set "${set}": ${Object.keys(SETS).join(', ')}`);
  const browser = await chromium.launch();
  const problems = [];
  const summary = [];
  try {
    const html = liveUrl ? await (await fetch(base)).text() : await readFile(path.join(DIST, 'index.html'), 'utf8');
    summary.push(`inline mosaics: ${kb(mosaicBytes(html))} (${Buffer.byteLength(html) ? mosaicBytes(html) : 0} bytes) in a page of ${kb(Buffer.byteLength(html))}`);
    for (const [name, shots] of Object.entries(plan)) {
      const vp = VIEWPORTS[name];
      const context = await browser.newContext({
        viewport: { width: vp.width, height: vp.height },
        deviceScaleFactor: vp.deviceScaleFactor,
        isMobile: vp.isMobile,
        hasTouch: vp.hasTouch,
      });
      const page = await context.newPage();
      const foreign = [];
      const bodies = [];
      page.on('request', (request) => {
        if (new URL(request.url()).origin !== origin) foreign.push(request.url());
      });
      page.on('response', (response) => {
        bodies.push(response.body().then((buffer) => ({ url: response.url(), type: (response.headers()['content-type'] || '').split(';')[0], bytes: buffer.length })).catch(() => null));
      });
      await page.goto(base, { waitUntil: 'networkidle' });
      const firstLoad = bodies.length;
      await loadEverything(page);
      const f = await facts(page);
      const prefix = liveUrl ? `live-${name}` : name;
      const flags = [];
      if (f.scrollWidth !== f.clientWidth) flags.push(`horizontal overflow ${f.scrollWidth} > ${f.clientWidth}`);
      if (!f.lora || !f.inter) flags.push('fonts not loaded');
      if (foreign.length) flags.push(`requests to other origins: ${[...new Set(foreign)].join(', ')}`);
      const broken = f.images.filter((img) => !img.ok);
      if (broken.length) flags.push(`photos not loaded: ${broken.map((img) => img.src).join(', ')}`);
      if (f.heroFieldOverlapsText) flags.push('the tile field of the first screen overlaps the text');
      if (f.tilesOverText) flags.push(`${f.tilesOverText} tile(s) sit on a text box`);
      if (f.bandOverflow > 0) flags.push(`the band drawing reaches ${f.bandOverflow} px below the closing band`);
      if (vp.width < 500) {
        if (!f.title || f.title.bottom > vp.height) flags.push('the title is not on the first screen');
        if (!f.subtitle || f.subtitle.bottom > vp.height) flags.push('the subtitle is not on the first screen');
        if (!f.button || f.button.bottom > 2 * vp.height) flags.push(`the button is below the second screen (${f.button && f.button.bottom} px)`);
        if (f.h1Lines > 3) flags.push(`the title takes ${f.h1Lines} lines`);
      }
      summary.push(`${prefix}: ${f.buttons} buttons, ${f.todoTags} TODO tags, ${f.draftTags} draft tags, ${f.images.length} photos, ${f.mosaics} mosaics with ${f.tiles} visible tiles (${f.tilesOverText} on text), fonts ${f.lora && f.inter ? 'from the site' : 'MISSING'}, width ${f.scrollWidth}/${f.clientWidth}${f.button ? `, hero button bottom at ${f.button.bottom} px` : ''}, h1 on ${f.h1Lines} line(s)`);
      summary.push(`${prefix}: font sizes px: ${Object.entries(f.fonts).map(([k, v]) => `${k} ${v}`).join(', ')}`);
      if (f.mentor) summary.push(`${prefix}: Meet your mentor: photos end at ${f.mentor.photosBottom}, text ends at ${f.mentor.textBottom}, difference ${f.mentor.textBottom - f.mentor.photosBottom} px, photo column position ${f.mentor.sticky}`);
      if (vp.weigh || liveUrl) {
        const loaded = (await Promise.all(bodies)).filter(Boolean);
        const first = loaded.slice(0, firstLoad);
        const sum = (list, test = () => true) => list.filter(test).reduce((n, r) => n + r.bytes, 0);
        const isPicture = (r) => /^image\/(jpeg|webp|png)$/.test(r.type);
        const isFont = (r) => /woff2/.test(r.type) || /\.woff2$/.test(r.url);
        summary.push(`${prefix}: first load ${kb(sum(first))} in ${first.length} files (pictures ${kb(sum(first, isPicture))}, fonts ${kb(sum(first, isFont))}); whole page ${kb(sum(loaded))} in ${loaded.length} files (pictures ${kb(sum(loaded, isPicture))})`);
        for (const r of loaded) summary.push(`  ${kb(r.bytes).padStart(7)}  ${r.url.replace(base, '') || 'index.html'}  ${r.type}${loaded.indexOf(r) >= firstLoad ? '  (after scrolling)' : ''}`);
      }
      for (const kind of shots) {
        const file = path.join(outDir, `${prefix}-${kind}.png`);
        if (kind === 'full') await page.screenshot({ path: file, fullPage: true });
        else if (kind === 'hero') await page.screenshot({ path: file });
        else if (kind === 'seam') await page.screenshot({ path: file, fullPage: true, clip: { x: 0, y: Math.max(0, f.closingTop - 260), width: vp.width, height: 560 } });
        else await page.locator(BLOCKS[kind]).screenshot({ path: file });
        console.log(path.basename(file));
      }
      console.log(`${prefix}  ${flags.length ? `PROBLEM: ${flags.join('; ')}` : 'ok'}`);
      if (flags.length) problems.push(`${prefix}: ${flags.join('; ')}`);
      await context.close();
    }
  } finally {
    await browser.close();
    if (local) local.server.close();
  }
  return { problems, summary };
}

const isMain = process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (isMain) {
  const args = process.argv.slice(2);
  const option = (flag) => (args.indexOf(flag) >= 0 ? args[args.indexOf(flag) + 1] : '');
  const liveUrl = option('--live');
  if (args.includes('--live') && !liveUrl) throw new Error('--live needs the address of the page');
  const { problems, summary } = await takeShots({ liveUrl, set: option('--set') || 'skeleton', outDir: option('--out') ? path.resolve(option('--out')) : undefined });
  console.log(`\n${summary.join('\n')}`);
  if (problems.length) {
    console.error(`\n${problems.length} problem(s):\n${problems.join('\n')}`);
    process.exitCode = 1;
  } else {
    console.log('\nAll screenshots taken, no problems found.');
  }
}
