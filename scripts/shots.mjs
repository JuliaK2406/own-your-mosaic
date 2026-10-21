// Screenshots and browser checks through Playwright. Run after npm run build (npm run shots).
// Serves dist/ under /own-your-mosaic/ (the path of the GitHub Pages preview) and takes:
//   360-full.png, 390-full.png, 834-full.png, 1440-full.png   the whole page
//   390-hero.png, 1440-hero.png                               the first screen, no scrolling
//   390-process.png, 1440-process.png                         the Process block
//   390-pricing.png, 1440-pricing.png                         the Pricing block
// Checks on the way: no horizontal overflow (scrollWidth equals clientWidth), Lora and Inter
// loaded from the site itself, not one request to another origin, every photo loaded
// (naturalWidth above zero), on the phone the title and subtitle are on the first screen and
// the button within two screens, the TODO and draft tags are present, and the weight of the
// first load at 390 (all files, and the pictures on their own).
// Output folder: ../screenshots 01 - каркас/ (override with SHOTS_DIR).
// npm run shots -- --live https://juliak2406.github.io/own-your-mosaic/  opens that address
// instead of the local server and takes live-390-hero.png with the same checks.

import { mkdir } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright';
import { ROOT } from '../src/check.mjs';
import { startServer, PREVIEW_BASE } from './serve.mjs';

const DEFAULT_OUT_DIR = process.env.SHOTS_DIR || path.resolve(ROOT, '..', 'screenshots 01 - каркас');
export const VIEWPORTS = [
  { name: '360', width: 360, height: 780, deviceScaleFactor: 2, isMobile: true, hasTouch: true, shots: ['full'] },
  { name: '390', width: 390, height: 844, deviceScaleFactor: 2, isMobile: true, hasTouch: true, shots: ['full', 'hero', 'process', 'pricing'], weigh: true },
  { name: '834', width: 834, height: 1194, deviceScaleFactor: 2, isMobile: true, hasTouch: true, shots: ['full'] },
  { name: '1440', width: 1440, height: 900, deviceScaleFactor: 1, isMobile: false, hasTouch: false, shots: ['full', 'hero', 'process', 'pricing'] },
];
const BLOCKS = { process: '.process', pricing: '.pricing' };

// Scrolls through the page so the lazy photo loads, then back to the top.
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
      return { top: Math.round(box.top + window.scrollY), bottom: Math.round(box.bottom + window.scrollY) };
    };
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
    };
  });
}

const kb = (bytes) => `${Math.round(bytes / 1024)} KB`;

export async function takeShots({ outDir = DEFAULT_OUT_DIR, liveUrl = '', viewports = VIEWPORTS } = {}) {
  await mkdir(outDir, { recursive: true });
  const local = liveUrl ? null : await startServer(0);
  const base = liveUrl ? liveUrl.replace(/\/?$/, '/') : `${local.url}${PREVIEW_BASE}/`;
  const origin = new URL(base).origin;
  const browser = await chromium.launch();
  const problems = [];
  const summary = [];
  const chosen = liveUrl ? viewports.filter((vp) => vp.name === '390').map((vp) => ({ ...vp, shots: ['hero'] })) : viewports;
  try {
    for (const vp of chosen) {
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
      const prefix = liveUrl ? `live-${vp.name}` : vp.name;
      const flags = [];
      if (f.scrollWidth !== f.clientWidth) flags.push(`horizontal overflow ${f.scrollWidth} > ${f.clientWidth}`);
      if (!f.lora || !f.inter) flags.push('fonts not loaded');
      if (foreign.length) flags.push(`requests to other origins: ${[...new Set(foreign)].join(', ')}`);
      const broken = f.images.filter((img) => !img.ok);
      if (broken.length) flags.push(`photos not loaded: ${broken.map((img) => img.src).join(', ')}`);
      if (vp.width < 500) {
        if (!f.title || f.title.bottom > vp.height) flags.push('the title is not on the first screen');
        if (!f.subtitle || f.subtitle.bottom > vp.height) flags.push('the subtitle is not on the first screen');
        if (!f.button || f.button.bottom > 2 * vp.height) flags.push(`the button is below the second screen (${f.button && f.button.bottom} px)`);
      }
      summary.push(`${prefix}: ${f.buttons} buttons, ${f.todoTags} TODO tags, ${f.draftTags} draft tags, ${f.images.length} photos, fonts ${f.lora && f.inter ? 'from the site' : 'MISSING'}, width ${f.scrollWidth}/${f.clientWidth}${f.button ? `, hero button bottom at ${f.button.bottom} px` : ''}`);
      if (vp.weigh || liveUrl) {
        const loaded = (await Promise.all(bodies)).filter(Boolean);
        const first = loaded.slice(0, firstLoad);
        const sum = (list, test = () => true) => list.filter(test).reduce((n, r) => n + r.bytes, 0);
        const isPicture = (r) => /^image\/(jpeg|webp|png)$/.test(r.type);
        const isFont = (r) => /woff2/.test(r.type) || /\.woff2$/.test(r.url);
        summary.push(`${prefix}: first load ${kb(sum(first))} in ${first.length} files (pictures ${kb(sum(first, isPicture))}, fonts ${kb(sum(first, isFont))}); whole page ${kb(sum(loaded))} in ${loaded.length} files (pictures ${kb(sum(loaded, isPicture))})`);
        for (const r of loaded) summary.push(`  ${kb(r.bytes).padStart(7)}  ${r.url.replace(base, '') || 'index.html'}  ${r.type}${loaded.indexOf(r) >= firstLoad ? '  (after scrolling)' : ''}`);
      }
      for (const kind of vp.shots) {
        const file = path.join(outDir, `${prefix}-${kind}.png`);
        if (kind === 'full') await page.screenshot({ path: file, fullPage: true });
        else if (kind === 'hero') await page.screenshot({ path: file });
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
  const liveAt = args.indexOf('--live');
  const liveUrl = liveAt >= 0 ? args[liveAt + 1] : '';
  if (liveAt >= 0 && !liveUrl) throw new Error('--live needs the address of the page');
  const { problems, summary } = await takeShots({ liveUrl });
  console.log(`\n${summary.join('\n')}`);
  if (problems.length) {
    console.error(`\n${problems.length} problem(s):\n${problems.join('\n')}`);
    process.exitCode = 1;
  } else {
    console.log('\nAll screenshots taken, no problems found.');
  }
}
