import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile, writeFile, mkdtemp, rm, readdir } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { loadRaw } from '../src/check.mjs';
import { build, fontFaceCss, readToken, FONTS, FONT_LICENCES, ASSETS, OG_IMAGE, ROBOTS_TXT } from '../src/build.mjs';

const OUTPUT = ['index.html', 'styles.css', 'robots.txt', 'favicon.svg', 'og-image.png', 'fonts/inter-latin.woff2', 'fonts/lora-latin.woff2', 'fonts/OFL-Inter.txt', 'fonts/OFL-Lora.txt'];

test('fonts: @font-face for Inter 400, 500, 600 and Lora 500, 600 from the site, latin only, files and licences present', async () => {
  const css = fontFaceCss();
  for (const [family, weight] of [['Inter', 400], ['Inter', 500], ['Inter', 600], ['Lora', 500], ['Lora', 600]]) {
    assert.ok(new RegExp(`font-family: '${family}';\\s*font-style: normal;\\s*font-weight: ${weight};`).test(css), `${family} ${weight}`);
  }
  assert.ok(css.includes("url(fonts/inter-latin.woff2) format('woff2')") && css.includes("url(fonts/lora-latin.woff2) format('woff2')"));
  assert.ok(!/https?:/.test(css), 'no remote font');
  assert.equal((css.match(/unicode-range: U\+0000-00FF/g) || []).length, 5);
  for (const font of FONTS) {
    const bytes = await readFile(path.join(ASSETS, 'fonts', font.file));
    assert.equal(bytes.slice(0, 4).toString(), 'wOF2', `${font.file} is woff2`);
  }
  for (const name of FONT_LICENCES) {
    assert.ok((await readFile(path.join(ASSETS, 'fonts', name), 'utf8')).includes('SIL Open Font License, Version 1.1'), name);
  }
});

test('the link card assets/og-image.png exists and is a 1200 x 627 PNG', async () => {
  const png = await readFile(OG_IMAGE);
  assert.equal(png.slice(1, 4).toString(), 'PNG');
  assert.equal(png.readUInt32BE(16), 1200);
  assert.equal(png.readUInt32BE(20), 627);
});

test('colour tokens are read from tokens.css', () => {
  assert.equal(readToken(':root {\n  --aubergine: #5E1A4D;\n}', '--aubergine'), '#5E1A4D');
  assert.throws(() => readToken(':root {}', '--missing'), /not found/);
});

test('the build writes the page, the styles with the fonts, robots.txt, the fonts and licences, the icon, the card and the photo versions', async () => {
  const dir = await mkdtemp(path.join(os.tmpdir(), 'own-your-mosaic-build-'));
  try {
    const { files, manifest } = await build({ distDir: dir, quiet: true });
    assert.ok(files['index.html'].includes('<html lang="en">'));
    assert.ok(files['index.html'].includes('<meta name="robots" content="noindex, nofollow">'));
    assert.ok(files['styles.css'].startsWith('/* Fonts served by the site itself'));
    assert.ok(files['styles.css'].includes('--aubergine: #5E1A4D') && files['styles.css'].includes('.closing {'));
    assert.ok(!/googleapis|gstatic|https?:\/\//.test(files['styles.css']), 'no outside address in the styles');
    assert.equal(files['robots.txt'], ROBOTS_TXT);
    assert.equal(files['register.js'], undefined, 'no script since PROMPT 03b');
    assert.ok(!files['index.html'].includes('<script'));
    for (const name of OUTPUT) assert.ok((await readFile(path.join(dir, name))).length > 0, name);
    const written = await readdir(dir);
    assert.ok(!written.includes('register.js') && !written.includes('CNAME'), 'no form script, no CNAME until the subdomain is chosen');
    assert.ok(files['index.html'].includes('hero__tiles--wide'), 'the detached tile group by default');
    const bare = await build({ distDir: dir, quiet: true, heroTiles: 'none' });
    assert.ok(!bare.files['index.html'].includes('hero__tiles'), 'heroTiles none: no tiles on the first screen');
    const images = (await readdir(path.join(dir, 'img'))).sort();
    const expected = Object.values(manifest).flatMap((m) => m.widths.flatMap((w) => [`${m.slug}-${w}.jpg`, `${m.slug}-${w}.webp`])).sort();
    assert.deepEqual(images, expected);
    assert.equal(images.length, 26, 'four photos: three widths each, four for the group band, webp and jpg');
    assert.deepEqual(Object.values(manifest).map((m) => `${m.width}x${m.height}`), ['1872x2340', '3859x4824', '6240x3060', '5720x2383'], 'all four cropped as in src/images.mjs');
    assert.deepEqual(manifest['julia-krylova-group.jpg'].widths, [640, 1024, 1600, 2400], 'the band gets a 2400 px version');
    assert.deepEqual(manifest['julia-krylova-mentoring.jpg'].widths, [640, 1024, 1600]);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

test('a copy of the yaml with published: true and the current TODO (the empty site_url) stops the build; without TODO and drafts it builds open', async () => {
  const dir = await mkdtemp(path.join(os.tmpdir(), 'own-your-mosaic-published-'));
  try {
    const raw = await loadRaw();
    const published = raw.replace(/^(\s*published:\s*)false/m, '$1true');
    assert.notEqual(published, raw);
    const yaml = path.join(dir, 'offer.yaml');
    const distDir = path.join(dir, 'dist');
    await writeFile(yaml, published);
    await assert.rejects(build({ distDir, contentFile: yaml, quiet: true }), /Content check failed/);
    // the same file with the addresses set and the draft marks removed: published mode
    const clean = published
      .replace('site_url: ""', 'site_url: "https://program.juliakrylova.com"')
      .replace(/#\s*draft[^\n]*/g, '');
    await writeFile(yaml, clean);
    const { files } = await build({ distDir, contentFile: yaml, quiet: true });
    assert.equal(files['robots.txt'], undefined, 'published: no robots.txt');
    assert.ok(!(await readdir(distDir)).includes('robots.txt'));
    assert.ok(!files['index.html'].includes('name="robots"'));
    assert.ok(!files['index.html'].includes('class="tag'));
    assert.ok(files['index.html'].includes('<link rel="canonical" href="https://program.juliakrylova.com/">'));
    assert.equal((files['index.html'].match(/href="https:\/\/calendly\.com\/juliakrylova\/30min\?utm_source=own-your-mosaic/g) || []).length, 4);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

test('a button address without https, or none at all, stops the build', async () => {
  const dir = await mkdtemp(path.join(os.tmpdir(), 'own-your-mosaic-url-'));
  try {
    const raw = await loadRaw();
    const yaml = path.join(dir, 'offer.yaml');
    const distDir = path.join(dir, 'dist');
    await writeFile(yaml, raw.replace('url: https://calendly.com/juliakrylova/30min', 'url: http://calendly.com/juliakrylova/30min'));
    await assert.rejects(build({ distDir, contentFile: yaml, quiet: true }), /Content check failed/);
    await writeFile(yaml, raw.replace('url: https://calendly.com/juliakrylova/30min', 'url: ""'));
    await assert.rejects(build({ distDir, contentFile: yaml, quiet: true }), /Content check failed/);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});
