import test from 'node:test';
import assert from 'node:assert/strict';
import { seeded, porcelainTile, bandTile, flyTile, cornerGroup, heroGroup, bandVariant, bandSprite, bandUse, allMosaics, COLOURS, BAND_VARIANTS, BORDER_Y } from '../src/render/mosaic.mjs';

const rects = (svg) => [...svg.matchAll(/<rect x="(-?\d+)" y="(-?\d+)" width="(\d+)" height="(\d+)" rx="6" fill-opacity="([.\d]+)"\/>/g)].map((m) => ({ x: Number(m[1]), y: Number(m[2]), w: Number(m[3]), h: Number(m[4]), opacity: Number(m[5]) }));
const fills = (svg) => [...svg.matchAll(/fill="(#[0-9A-Fa-f]{6})"/g)].map((m) => m[1]);
const viewBox = (svg) => svg.match(/viewBox="0 0 (\d+) (\d+)"/).slice(1, 3).map(Number);
const tilesByFill = (svg) => [...svg.matchAll(/<g fill="(#[0-9A-Fa-f]{6})">([^]*?)<\/g>/g)].flatMap(([, fill, body]) => rects(body).map((r) => ({ ...r, fill })));

test('the seeded generator gives the same sequence for the same seed and a different one for another', () => {
  const a = seeded(7);
  const b = seeded(7);
  const c = seeded(8);
  const first = Array.from({ length: 5 }, () => a());
  assert.deepEqual(first, Array.from({ length: 5 }, () => b()));
  assert.notDeepEqual(first, Array.from({ length: 5 }, () => c()));
});

test('tile kinds: porcelain tiles aubergine 0.05 to 0.20 (most below 0.12), champagne 0.35 to 0.6, warm grey; band tiles 0.04 to 0.10; flying tiles 0.08 to 0.35', () => {
  const rnd = seeded(1);
  const tiles = Array.from({ length: 3000 }, () => porcelainTile(rnd));
  const aubergine = tiles.filter((t) => t.fill === COLOURS.aubergine);
  assert.ok(aubergine.length > tiles.length * 0.7);
  for (const t of aubergine) assert.ok(t.opacity >= 0.05 && t.opacity <= 0.2, String(t.opacity));
  assert.ok(aubergine.filter((t) => t.opacity <= 0.12).length > aubergine.length * 0.6, 'most tiles are faint');
  for (const t of tiles.filter((t) => t.fill === COLOURS.champagne)) assert.ok(t.opacity >= 0.35 && t.opacity <= 0.6);
  for (const t of Array.from({ length: 500 }, () => bandTile(rnd))) assert.ok(t.fill === COLOURS.onAubergine && t.opacity >= 0.04 && t.opacity <= 0.1);
  for (const t of Array.from({ length: 500 }, () => flyTile(rnd))) assert.ok(t.fill === COLOURS.aubergine && t.opacity >= 0.08 && t.opacity <= 0.35);
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

test('the hero groups (wide and phone): porcelain palette, drawn at their own size, strong at the top-right corner, faint at the left and bottom edges', () => {
  const porcelainPalette = new Set([COLOURS.aubergine, COLOURS.champagne, COLOURS.warmGrey]);
  for (const [svg, width, height] of [[heroGroup(), 204, 140], [heroGroup({ phone: true }), 104, 104]]) {
    for (const fill of fills(svg)) assert.ok(porcelainPalette.has(fill), fill);
    assert.ok(svg.includes(`width="${width}" height="${height}"`), 'drawn at its own size');
    const tiles = rects(svg);
    assert.ok(tiles.length >= 6, `${tiles.length} tiles`);
    const corner = tiles.filter((t) => t.x + t.w >= width - 12 && t.y <= 12);
    assert.ok(corner.length >= 1 && Math.max(...corner.map((t) => t.opacity)) >= 0.05, 'a whole tile at full strength sits in the top-right corner');
    const edges = tiles.filter((t) => t.x <= 6 || t.y + t.h >= height - 6);
    for (const t of edges) assert.ok(t.opacity <= 0.3, `a tile at the left or bottom edge is faint (${t.opacity})`);
  }
  assert.equal(cornerGroup({ seed: 44, width: 204, height: 140, anchor: 'tr' }), heroGroup());
});

test('the band drawings: five widths; over the border only aubergine within the page margin, below it only on-aubergine within the side zone; some tiles straddle the border; the sprite and the mirrored uses', () => {
  for (const [name, v] of Object.entries(BAND_VARIANTS)) {
    const variant = bandVariant(name);
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
      } else if (straddles) {
        straddling += 1;
      } else {
        assert.equal(t.fill, COLOURS.onAubergine, `${name}: below the border only tone in tone`);
        assert.ok(t.x + t.w <= v.side, `${name}: below the border only in the side zone`);
      }
    }
    assert.ok(straddling >= 2 && straddling % 2 === 0, `${name}: ${straddling} straddling rects, in pairs`);
    assert.ok(v.height - BORDER_Y <= 400, `${name}: the drawing below the border is short enough for the modest band (${v.height - BORDER_Y} px)`);
  }
  const sprite = bandSprite();
  assert.ok(sprite.startsWith('<svg class="mosaic-sprite" aria-hidden="true"'));
  for (const name of Object.keys(BAND_VARIANTS)) assert.ok(sprite.includes(`<symbol id="band-${name}" viewBox="0 0 ${BAND_VARIANTS[name].width} ${BAND_VARIANTS[name].height}">`));
  assert.ok(bandUse('wide', 'right').includes('<use href="#band-wide" transform="translate(292 0) scale(-1 1)"/>'));
});
