import test from 'node:test';
import assert from 'node:assert/strict';
import { seeded, porcelainTile, bandTile, flyTile, heroField, mentorField, cornerGroup, bandVariant, bandSprite, bandUse, allMosaics, COLOURS, BAND_VARIANTS, BORDER_Y } from '../src/render/mosaic.mjs';

const rects = (svg) => [...svg.matchAll(/<rect x="(-?\d+)" y="(-?\d+)" width="(\d+)" height="(\d+)" rx="6" fill-opacity="([.\d]+)"\/>/g)].map((m) => ({ x: Number(m[1]), y: Number(m[2]), w: Number(m[3]), h: Number(m[4]), opacity: Number(m[5]) }));
const fills = (svg) => [...svg.matchAll(/fill="(#[0-9A-Fa-f]{6})"/g)].map((m) => m[1]);
const viewBox = (svg) => svg.match(/viewBox="0 0 (\d+) (\d+)"/).slice(1, 3).map(Number);
// the rects of each <g fill> group with their fill
const tilesByFill = (svg) => [...svg.matchAll(/<g fill="(#[0-9A-Fa-f]{6})">([^]*?)<\/g>/g)].flatMap(([, fill, body]) => rects(body).map((r) => ({ ...r, fill })));

test('the seeded generator gives the same sequence for the same seed and a different one for another', () => {
  const a = seeded(7);
  const b = seeded(7);
  const c = seeded(8);
  const first = Array.from({ length: 5 }, () => a());
  assert.deepEqual(first, Array.from({ length: 5 }, () => b()));
  assert.notDeepEqual(first, Array.from({ length: 5 }, () => c()));
  for (const value of first) assert.ok(value >= 0 && value < 1);
});

test('tile kinds: porcelain tiles aubergine 0.05 to 0.20 (most below 0.12), champagne 0.35 to 0.6, warm grey; band tiles 0.04 to 0.10; flying tiles 0.08 to 0.35', () => {
  const rnd = seeded(1);
  const tiles = Array.from({ length: 3000 }, () => porcelainTile(rnd));
  const aubergine = tiles.filter((t) => t.fill === COLOURS.aubergine);
  assert.ok(aubergine.length > tiles.length * 0.7);
  for (const t of aubergine) assert.ok(t.opacity >= 0.05 && t.opacity <= 0.2, String(t.opacity));
  assert.ok(aubergine.filter((t) => t.opacity <= 0.12).length > aubergine.length * 0.6, 'most tiles are faint');
  for (const t of tiles.filter((t) => t.fill === COLOURS.champagne)) assert.ok(t.opacity >= 0.35 && t.opacity <= 0.6);
  assert.deepEqual([...new Set(tiles.map((t) => t.fill))].sort(), [COLOURS.aubergine, COLOURS.warmGrey, COLOURS.champagne].sort());
  for (const t of Array.from({ length: 500 }, () => bandTile(rnd))) {
    assert.equal(t.fill, COLOURS.onAubergine);
    assert.ok(t.opacity >= 0.04 && t.opacity <= 0.1);
  }
  for (const t of Array.from({ length: 500 }, () => flyTile(rnd))) {
    assert.equal(t.fill, COLOURS.aubergine);
    assert.ok(t.opacity >= 0.08 && t.opacity <= 0.35);
  }
});

test('every drawing is deterministic, aria-hidden, never scaled with slice, without pictures or script, and every tile lies whole inside its viewBox', () => {
  const all = allMosaics();
  const again = allMosaics();
  let total = 0;
  for (const [name, svg] of Object.entries(all)) {
    assert.equal(svg, again[name], `${name} is the same in every build`);
    assert.ok(svg.startsWith('<svg class="mosaic ') && svg.endsWith('</svg>'));
    assert.ok(svg.includes('aria-hidden="true"'), name);
    assert.ok(!svg.includes('slice'), `${name} is not cropped by scaling`);
    assert.ok(!/<(image|script|text|foreignObject)\b/.test(svg), name);
    const [width, height] = viewBox(svg);
    const tiles = rects(svg);
    assert.ok(tiles.length >= 6, `${name} has tiles (${tiles.length})`);
    for (const t of tiles) {
      assert.ok(t.x >= 0 && t.y >= 0 && t.x + t.w <= width && t.y + t.h <= height, `${name}: tile ${t.x},${t.y} ${t.w}x${t.h} outside ${width}x${height}`);
      assert.ok(t.opacity >= 0.01 && t.opacity <= 1, `${name}: opacity ${t.opacity}`);
    }
    total += Buffer.byteLength(svg);
  }
  assert.ok(total <= 30 * 1024, `${total} bytes`);
});

test('the fields behind the photos: porcelain palette, nothing drawn behind the photo itself, more below the photo than above it, faded at every edge', () => {
  const porcelainPalette = new Set([COLOURS.aubergine, COLOURS.champagne, COLOURS.warmGrey]);
  for (const [svg, photo, margins] of [[heroField(), { width: 411, height: 514 }, { top: 48, left: 40 }], [mentorField(), { width: 387, height: 484 }, { top: 40, left: 40 }]]) {
    for (const fill of fills(svg)) assert.ok(porcelainPalette.has(fill), fill);
    const tiles = rects(svg);
    const inner = { x1: margins.left + 6, y1: margins.top + 6, x2: margins.left + photo.width - 6, y2: margins.top + photo.height - 6 };
    assert.ok(!tiles.some((t) => t.x >= inner.x1 && t.x + t.w <= inner.x2 && t.y >= inner.y1 && t.y + t.h <= inner.y2), 'no tile hidden behind the photo');
    const above = tiles.filter((t) => t.y + t.h / 2 < margins.top).length;
    const below = tiles.filter((t) => t.y + t.h / 2 > margins.top + photo.height).length;
    assert.ok(below > above, `${below} tiles below, ${above} above`);
    const [width, height] = viewBox(svg);
    const edge = tiles.filter((t) => t.y < 6 || t.y + t.h > height - 6 || t.x < 6 || t.x + t.w > width - 6);
    for (const t of edge) assert.ok(t.opacity <= 0.12, `a tile at the edge is faint (${t.opacity})`);
    assert.ok(!tiles.some((t) => t.y <= 2 || t.y + t.h >= height - 2), 'no tile touches the top or bottom edge');
  }
  for (const svg of [cornerGroup({ seed: 32, anchor: 'tr' }), cornerGroup({ seed: 33, anchor: 'bl' })]) {
    for (const fill of fills(svg)) assert.ok(porcelainPalette.has(fill), fill);
    assert.ok(svg.includes('width="150" height="110"'), 'drawn at its own size');
  }
});

test('the band drawings: five widths; over the border only aubergine within the page margin, below it only on-aubergine within the side zone; some tiles straddle the border; the sprite and the mirrored uses', () => {
  for (const [name, v] of Object.entries(BAND_VARIANTS)) {
    const variant = bandVariant(name);
    assert.equal(variant.width, v.width);
    const tiles = tilesByFill(`<svg>${variant.body}</svg>`);
    assert.ok(tiles.length >= 8, `${name} has tiles`);
    let straddling = 0;
    for (const t of tiles) {
      assert.ok(t.x >= 0 && t.x + t.w <= v.width && t.y >= 0 && t.y + t.h <= v.height, `${name}: tile inside`);
      const above = t.y + t.h <= BORDER_Y;
      const straddles = t.y < BORDER_Y && t.y + t.h > BORDER_Y;
      if (above) {
        assert.equal(t.fill, COLOURS.aubergine, `${name}: over the border only aubergine`);
        assert.ok(t.x + t.w <= v.fly, `${name}: over the border only in the page margin`);
        assert.ok(t.opacity <= 0.35);
      } else if (straddles) {
        straddling += 1;
        assert.ok(t.x + t.w <= v.fly && t.x + t.w <= v.side);
      } else {
        assert.equal(t.fill, COLOURS.onAubergine, `${name}: below the border only tone in tone`);
        assert.ok(t.x + t.w <= v.side, `${name}: below the border only in the side zone`);
        assert.ok(t.opacity <= 0.1);
      }
    }
    assert.ok(straddling >= 2, `${name}: ${straddling} straddling rects (each tile is drawn twice)`);
    assert.ok(straddling % 2 === 0, `${name}: straddling tiles come in pairs`);
  }
  const sprite = bandSprite();
  assert.ok(sprite.startsWith('<svg class="mosaic-sprite" aria-hidden="true"'));
  for (const name of Object.keys(BAND_VARIANTS)) assert.ok(sprite.includes(`<symbol id="band-${name}" viewBox="0 0 ${BAND_VARIANTS[name].width} ${BAND_VARIANTS[name].height}">`));
  assert.ok(bandUse('wide', 'left').includes('<use href="#band-wide"/>'));
  assert.ok(bandUse('wide', 'right').includes('<use href="#band-wide" transform="translate(292 0) scale(-1 1)"/>'));
  assert.ok(bandUse('wide', 'left').includes('width="292" height="640"'), 'placed at its own size');
});
