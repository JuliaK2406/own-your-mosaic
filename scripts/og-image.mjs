// The link card (og:image) for LinkedIn and the like: a 1200 x 627 PNG made only from what the
// page already shows: hero.title and hero.subtitle in Lora on porcelain, and a mosaic of tiles
// in the brand aubergine. No other text. Writes assets/og-image.png, which the build copies
// into dist/. Fonts and colours come from the repository itself. Run: npm run og

import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright';
import { ROOT, loadContent } from '../src/check.mjs';
import { OG_IMAGE, FONTS, STYLES_DIR, readToken } from '../src/build.mjs';
import { OG_WIDTH, OG_HEIGHT, esc } from '../src/render/page.mjs';
import { startServer } from './serve.mjs';

// Three columns of four tiles: heights in px and opacities, as the decorative mosaic of Snapshot.
export const TILE_HEIGHTS = [[102, 72, 90, 78], [78, 102, 72, 90], [90, 78, 108, 66]];
export const TILE_ALPHAS = [[0.8, 0.41, 0.6, 0.5], [0.7, 0.9, 0.5, 0.6], [0.41, 0.6, 0.32, 0.7]];

export function cardHtml(content, tokens, base) {
  const hex = readToken(tokens, '--aubergine');
  const rgb = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16)).join(', ');
  const navy = readToken(tokens, '--navy');
  const porcelain = readToken(tokens, '--porcelain');
  const muted = readToken(tokens, '--text-muted');
  const faces = FONTS.map((font) => `@font-face { font-family: '${font.family}'; font-style: normal; font-weight: ${font.weights[0]} ${font.weights[font.weights.length - 1]}; src: url(${base}/assets/fonts/${font.file}) format('woff2'); }`).join('\n');
  const columns = TILE_HEIGHTS.map((heights, column) => `<div class="col">${heights.map((height, row) => `<div class="tile" style="height: ${height}px; background: rgba(${rgb}, ${TILE_ALPHAS[column][row]})"></div>`).join('')}</div>`).join('');
  return `<!doctype html>
<html lang="en"><head><meta charset="utf-8"><style>
${faces}
html, body { margin: 0; background: ${porcelain}; }
.card { box-sizing: border-box; width: ${OG_WIDTH}px; height: ${OG_HEIGHT}px; padding: 72px 80px; display: grid; grid-template-columns: minmax(0, 1fr) 390px; column-gap: 72px; align-items: center; }
.title { margin: 0 0 28px; font-family: 'Lora', Georgia, serif; font-weight: 500; font-size: 64px; line-height: 1.12; color: ${navy}; }
.subtitle { margin: 0; font-family: 'Lora', Georgia, serif; font-weight: 500; font-size: 30px; line-height: 1.3; color: ${muted}; }
.mosaic { display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); gap: 12px; }
.col { display: flex; flex-direction: column; gap: 12px; }
.tile { border-radius: 14px; }
</style></head>
<body><div class="card">
  <div><h1 class="title">${esc(content.hero.title)}</h1><p class="subtitle">${esc(content.hero.subtitle)}</p></div>
  <div class="mosaic">${columns}</div>
</div></body></html>
`;
}

export async function makeCard(output = OG_IMAGE) {
  const content = await loadContent();
  const tokens = await readFile(path.join(STYLES_DIR, 'tokens.css'), 'utf8');
  const { server, url } = await startServer(0, ROOT);
  const browser = await chromium.launch();
  try {
    const page = await browser.newPage({ viewport: { width: OG_WIDTH, height: OG_HEIGHT }, deviceScaleFactor: 1 });
    await page.setContent(cardHtml(content, tokens, url), { waitUntil: 'networkidle' });
    await page.evaluate(() => document.fonts.ready);
    await page.waitForTimeout(200);
    const loaded = await page.evaluate(() => [...document.fonts].filter((f) => f.status === 'loaded').map((f) => f.family));
    if (!loaded.includes('Lora')) throw new Error(`Lora did not load for the card (loaded: ${loaded.join(', ') || 'none'})`);
    await page.screenshot({ path: output, type: 'png', clip: { x: 0, y: 0, width: OG_WIDTH, height: OG_HEIGHT } });
    console.log(`${path.relative(ROOT, output)}  ${OG_WIDTH} x ${OG_HEIGHT}`);
  } finally {
    await browser.close();
    server.close();
  }
}

const isMain = process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (isMain) await makeCard();
