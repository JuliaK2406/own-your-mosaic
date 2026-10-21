import test from 'node:test';
import assert from 'node:assert/strict';
import { seeded, porcelainTile, bandTile, heroField, cornerGroup, promisePanel, closingBand, allMosaics, COLOURS } from '../src/render/mosaic.mjs';

const opacities = (svg) => [...svg.matchAll(/fill-opacity="([.\d]+)"/g)].map((m) => Number(m[1]));
const fills = (svg) => [...svg.matchAll(/fill="(#[0-9A-Fa-f]{6})"/g)].map((m) => m[1]);

test('the seeded generator gives the same sequence for the same seed and a different one for another', () => {
  const a = seeded(7);
  const b = seeded(7);
  const c = seeded(8);
  const first = Array.from({ length: 5 }, () => a());
  assert.deepEqual(first, Array.from({ length: 5 }, () => b()));
  assert.notDeepEqual(first, Array.from({ length: 5 }, () => c()));
  for (const value of first) assert.ok(value >= 0 && value < 1);
});

test('tiles on porcelain: aubergine 0.05 to 0.20 (most below 0.12), champagne 0.35 to 0.6, warm grey; band tiles 0.04 to 0.10 on-aubergine', () => {
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
});

test('every mosaic is deterministic, aria-hidden, without pictures or script, and all eight fit in 30 KB', () => {
  const all = allMosaics();
  const again = allMosaics();
  let total = 0;
  for (const [name, svg] of Object.entries(all)) {
    assert.equal(svg, again[name], `${name} is the same in every build`);
    assert.ok(svg.startsWith('<svg class="mosaic ') && svg.endsWith('</svg>'));
    assert.ok(svg.includes('aria-hidden="true"'), name);
    assert.ok(!/<(image|script|text|foreignObject)\b/.test(svg), name);
    assert.ok((svg.match(/<rect/g) || []).length >= 8, `${name} has tiles`);
    total += Buffer.byteLength(svg);
  }
  assert.ok(total <= 30 * 1024, `${total} bytes`);
});

test('first-screen field and corners use the porcelain palette; the band uses only on-aubergine at 0.04 to 0.10', () => {
  const porcelainPalette = new Set([COLOURS.aubergine, COLOURS.champagne, COLOURS.warmGrey]);
  for (const svg of [heroField(), cornerGroup(), cornerGroup({ seed: 99 })]) {
    for (const fill of fills(svg)) assert.ok(porcelainPalette.has(fill), fill);
  }
  for (const svg of [closingBand(), closingBand({ seed: 25, width: 390, height: 760, tall: true })]) {
    assert.deepEqual([...new Set(fills(svg))], [COLOURS.onAubergine]);
    for (const o of opacities(svg)) assert.ok(o >= 0.04 && o <= 0.1, String(o));
  }
});

test('the Promise panel ends in exactly one gold dot near its right edge; the strip is the phone variant', () => {
  const wide = promisePanel();
  const strip = promisePanel({ seed: 23, width: 720, height: 120, strip: true, transition: 0.6 });
  for (const svg of [wide, strip]) {
    assert.equal((svg.match(/<circle/g) || []).length, 1);
    assert.ok(svg.includes(`<circle cx="`) && svg.includes(`fill="${COLOURS.gold}"`));
    assert.ok(svg.includes(svg === wide ? 'preserveAspectRatio="xMaxYMid meet"' : 'preserveAspectRatio="xMaxYMid slice"'), 'the wide panel fits whole, the strip is cut from the right');
    const cx = Number(svg.match(/<circle cx="(\d+)"/)[1]);
    const width = Number(svg.match(/viewBox="0 0 (\d+) /)[1]);
    assert.ok(cx < width - 8 && cx > width * 0.8, `the dot at ${cx} of ${width}`);
  }
  assert.ok(wide.includes('class="mosaic mosaic--promise"') && strip.includes('class="mosaic mosaic--promise-strip"'));
});

test('the closing band is denser at the edges than in the middle', () => {
  const svg = closingBand();
  const xs = [...svg.matchAll(/<rect x="(\d+)"/g)].map((m) => Number(m[1]));
  const middle = xs.filter((x) => x > 1440 * 0.3 && x < 1440 * 0.7).length;
  const edges = xs.filter((x) => x < 1440 * 0.2 || x > 1440 * 0.8).length;
  assert.ok(edges > middle * 3, `${edges} tiles at the edges, ${middle} in the middle`);
});
