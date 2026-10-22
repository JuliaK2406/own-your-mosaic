// Build: content/offer.yaml -> check -> photo versions -> dist/ with index.html, styles.css
// (with the @font-face rules), the fonts and their licences, favicon.svg, the link card
// og-image.png and, while unpublished, robots.txt. Run with npm run build.

import { readFile, writeFile, mkdir, rm, stat, copyFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { load } from 'js-yaml';
import { ROOT, CONTENT_FILE, PHOTOS_DIR, loadRaw, listPhotos, checkContent, report } from './check.mjs';
import { buildImages } from './images.mjs';
import { renderPage, OG_IMAGE_FILE } from './render/page.mjs';

export const DIST = path.join(ROOT, 'dist');
export const ASSETS = path.join(ROOT, 'assets');
export const STYLES_DIR = path.join(ROOT, 'src', 'styles');
// The link card for LinkedIn and the like, made by scripts/og-image.mjs (npm run og).
export const OG_IMAGE = path.join(ASSETS, OG_IMAGE_FILE);
// Fonts are served by the site itself, so no request leaves for Google. These are the latin
// woff2 files Google Fonts serves for the same weights (variable weight, one file per family);
// the OFL licence files live beside them in assets/fonts.
export const FONTS = [
  { family: 'Inter', file: 'inter-latin.woff2', weights: [400, 500, 600] },
  { family: 'Lora', file: 'lora-latin.woff2', weights: [500, 600] },
];
export const FONT_LICENCES = ['OFL-Inter.txt', 'OFL-Lora.txt'];
const LATIN_RANGE = 'U+0000-00FF, U+0131, U+0152-0153, U+02BB-02BC, U+02C6, U+02DA, U+02DC, U+0304, U+0308, U+0329, U+2000-206F, U+20AC, U+2122, U+2191, U+2193, U+2212, U+2215, U+FEFF, U+FFFD';
export const ROBOTS_TXT = 'User-agent: *\nDisallow: /\n';

// One @font-face per weight, as Google Fonts declares them, all pointing at the same file.
export function fontFaceCss() {
  const rules = [];
  for (const font of FONTS) {
    for (const weight of font.weights) {
      rules.push(`@font-face {\n  font-family: '${font.family}';\n  font-style: normal;\n  font-weight: ${weight};\n  font-display: swap;\n  src: url(fonts/${font.file}) format('woff2');\n  unicode-range: ${LATIN_RANGE};\n}`);
    }
  }
  return `/* Fonts served by the site itself (assets/fonts, SIL Open Font License) */\n${rules.join('\n')}\n\n`;
}

// Reads one colour token (#rrggbb) from tokens.css, so no colour is written twice.
export function readToken(css, name) {
  const match = css.match(new RegExp(name + '\\s*:\\s*(#[0-9A-Fa-f]{6})'));
  if (!match) throw new Error(`tokens.css: ${name} not found`);
  return match[1];
}

// options.distDir: where to write (default dist/); options.contentFile: another yaml (tests);
// options.patch: a function that changes the loaded content before the check (tests only);
// options.quiet: no console output; options.forceImages: remake every photo version.
export async function build(options = {}) {
  const distDir = options.distDir || DIST;
  const contentFile = options.contentFile || CONTENT_FILE;
  const log = options.quiet ? () => {} : console.log;
  const raw = await loadRaw(contentFile);
  const content = load(raw);
  if (typeof options.patch === 'function') options.patch(content);
  const checked = checkContent(content, { photos: await listPhotos(), raw });
  const result = report(content, checked);
  log(result.lines.join('\n'));
  if (!result.ok) throw new Error('Content check failed, nothing was built');
  const published = content.meta.published === true;

  await mkdir(path.join(distDir, 'fonts'), { recursive: true });
  const manifest = await buildImages({
    photosDir: PHOTOS_DIR,
    distDir,
    files: [content.hero.photo, content.proof.photo],
    force: Boolean(options.forceImages),
    log,
  });

  const tokens = await readFile(path.join(STYLES_DIR, 'tokens.css'), 'utf8');
  const page = await readFile(path.join(STYLES_DIR, 'page.css'), 'utf8');
  const drafts = new Set(checked.drafts.map((draft) => draft.path));
  const files = {
    'index.html': renderPage(content, { manifest, drafts, themeColor: readToken(tokens, '--porcelain') }),
    'styles.css': `${fontFaceCss()}/* ---- tokens.css ---- */\n${tokens}\n/* ---- page.css ---- */\n${page}`,
  };
  if (!published) files['robots.txt'] = ROBOTS_TXT;

  // Only the build's own files are replaced; dist/img keeps the photo versions between builds.
  // register.js was the form script until PROMPT 03b and is removed if a build left it behind.
  for (const name of [...Object.keys(files), 'robots.txt', 'register.js', 'CNAME']) await rm(path.join(distDir, name), { force: true });
  for (const [name, body] of Object.entries(files)) await writeFile(path.join(distDir, name), body, 'utf8');
  const copies = [
    ...FONTS.map((font) => [path.join(ASSETS, 'fonts', font.file), path.join('fonts', font.file)]),
    ...FONT_LICENCES.map((name) => [path.join(ASSETS, 'fonts', name), path.join('fonts', name)]),
    [path.join(ASSETS, 'favicon.svg'), 'favicon.svg'],
    [OG_IMAGE, OG_IMAGE_FILE],
  ];
  const written = Object.keys(files);
  for (const [from, to] of copies) {
    if (!(await stat(from).catch(() => null))) {
      if (from === OG_IMAGE) {
        log(`  WARNING: ${path.relative(ROOT, from)} is missing, run npm run og; the page links to it once site_url is set`);
        continue;
      }
      throw new Error(`${path.relative(ROOT, from)} is missing`);
    }
    await copyFile(from, path.join(distDir, to));
    written.push(to);
  }
  for (const name of written) {
    const { size } = await stat(path.join(distDir, name));
    log(`  ${path.relative(ROOT, path.join(distDir, name))}  ${size} bytes`);
  }
  log(published ? 'Published mode: indexable, no robots.txt, no TODO or draft tags' : 'Unpublished mode: noindex, robots.txt with Disallow, TODO and draft tags visible');
  return { files, manifest, content, written };
}

const isMain = process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (isMain) {
  try {
    await build({ forceImages: process.argv.includes('--force-images') });
  } catch (error) {
    console.error(error.message);
    process.exitCode = 1;
  }
}
