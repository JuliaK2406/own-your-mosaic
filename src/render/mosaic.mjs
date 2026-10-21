// Decorative mosaics as inline SVG, drawn at build time from a fixed seed, so every build
// gives the same picture. The tile language of Snapshot: columns of rounded tiles of varying
// height, 6 px gaps, 6 px corners. Colours: the brand aubergine at low opacity, a little
// champagne and warm grey; on the closing band the on-aubergine colour; gold only as the one
// dot at the end of the Promise panel. No pictures, no script, every svg is aria-hidden.

export const COLOURS = {
  aubergine: '#5E1A4D',
  champagne: '#EFDCAC',
  warmGrey: '#E4E2DD',
  gold: '#B89B5E',
  onAubergine: '#F3E9EF',
};
export const TILE = 28;
export const GAP = 6;
export const RADIUS = 6;

// mulberry32: a small seeded random generator, enough for a decorative pattern.
export function seeded(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6D2B79F5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const lerp = (a, b, t) => a + (b - a) * t;
const between = (rnd, min, max) => min + (max - min) * rnd();
const smooth = (t) => t * t * (3 - 2 * t);
const clamp01 = (t) => Math.min(1, Math.max(0, t));

// A tile on porcelain: mostly faint aubergine (0.05 to 0.12, some up to 0.20), a little
// champagne (0.35 to 0.6) and warm grey.
export function porcelainTile(rnd) {
  const r = rnd();
  if (r < 0.78) {
    const deeper = rnd() < 0.3;
    return { fill: COLOURS.aubergine, opacity: deeper ? between(rnd, 0.12, 0.2) : between(rnd, 0.05, 0.12) };
  }
  if (r < 0.9) return { fill: COLOURS.champagne, opacity: between(rnd, 0.35, 0.6) };
  return { fill: COLOURS.warmGrey, opacity: between(rnd, 0.7, 1) };
}

// A tile on the aubergine band: the on-aubergine colour at 0.04 to 0.10.
export function bandTile(rnd) {
  return { fill: COLOURS.onAubergine, opacity: between(rnd, 0.04, 0.1) };
}

// Rects grouped by fill, so the colour is written once per group.
function draw(tiles, extra = '') {
  const groups = new Map();
  for (const t of tiles) {
    if (!groups.has(t.fill)) groups.set(t.fill, []);
    groups.get(t.fill).push(`<rect x="${Math.round(t.x)}" y="${Math.round(t.y)}" width="${Math.round(t.w)}" height="${Math.round(t.h)}" rx="${RADIUS}" fill-opacity="${t.opacity.toFixed(2).replace(/^0/, '')}"/>`);
  }
  return [...groups].map(([fill, rects]) => `<g fill="${fill}">${rects.join('')}</g>`).join('') + extra;
}

function svg(className, width, height, body, align = 'xMidYMid slice') {
  return `<svg class="mosaic ${className}" viewBox="0 0 ${width} ${height}" preserveAspectRatio="${align}" aria-hidden="true" focusable="false">${body}</svg>`;
}

// Fills one column from y0 downwards with tiles of random height; keep(tile) can refuse one.
function fillColumn(rnd, tiles, x, y0, bottom, { minH = 18, maxH = 60, skip = 0.3, pick = porcelainTile, keep = () => true, tile = TILE } = {}) {
  let y = y0;
  while (y < bottom) {
    const h = between(rnd, minH, maxH);
    const t = { x, y, w: tile, h };
    if (rnd() >= skip && keep(t)) tiles.push({ ...t, ...pick(rnd) });
    y += h + GAP;
  }
}

// 2a. The field behind the first-screen photo (from 900 px): a box larger than the photo with
// tiles in its top-right and bottom-left quadrants and nothing near the other two corners, so
// the field reads as the photo's shape shifted up-right and down-left. CSS fades it toward
// the text with a gradient mask.
export function heroField({ seed = 11, width = 500, height = 720 } = {}) {
  const rnd = seeded(seed);
  const tiles = [];
  const keep = ({ x, y, w, h }) => {
    const u = (x + w / 2) / width;
    const v = (y + h / 2) / height;
    return (u > 0.42 && v < 0.58) || (u < 0.58 && v > 0.42);
  };
  for (let x = 0; x + TILE <= width; x += TILE + GAP) fillColumn(rnd, tiles, x, -between(rnd, 0, 30), height, { skip: 0.28, keep });
  return svg('mosaic--field', width, height, draw(tiles));
}

// A small group of tiles for a corner of a photo (the phone version of the first screen,
// and the Meet your mentor composition). Drawn at its own size, never scaled.
export function cornerGroup({ seed = 12, width = 132, height = 96 } = {}) {
  const rnd = seeded(seed);
  const tiles = [];
  for (let x = 0; x + TILE <= width; x += TILE + GAP) fillColumn(rnd, tiles, x, -between(rnd, 0, 16), height, { minH: 16, maxH: 44, skip: 0.22 });
  return svg('mosaic--corner', width, height, draw(tiles), 'xMinYMin meet');
}

// 5. The Promise panel: on the left the tiles lie scattered, toward the right they line up
// into one even row, which ends in a gold dot (the sign of the end of the path in Method).
// strip: the phone version, a low band under the text.
// transition: where (as a share of the width) the tiles start lining up. The wide panel is
// drawn with "meet", so the whole picture stays inside the panel whatever its height; the
// strip is drawn with "slice" from the right, so the phone shows its right part (the row and
// the dot) and a tablet nearly all of it.
export function promisePanel({ seed = 13, width = 480, height = 540, strip = false, transition = 0.42 } = {}) {
  const rnd = seeded(seed);
  const tiles = [];
  const pitch = TILE + GAP;
  const columns = Math.floor((width - 44) / pitch);
  const rowH = strip ? 24 : 28;
  const rowY = height / 2 - rowH / 2;
  for (let i = 0; i < columns; i += 1) {
    const x = 12 + i * pitch;
    const t = columns > 1 ? i / (columns - 1) : 1;
    if (t < transition) {
      // free side: a loose stack with gaps
      fillColumn(rnd, tiles, x, -between(rnd, 0, 24), height, { minH: strip ? 14 : 18, maxH: strip ? 40 : 56, skip: 0.34 });
      continue;
    }
    // one tile per column slides into the row and takes its size
    const s = smooth(clamp01((t - transition) / (0.82 - transition)));
    const freeH = between(rnd, 18, 52);
    const freeY = between(rnd, 0, height - freeH);
    const h = lerp(freeH, rowH, s);
    const y = lerp(freeY, rowY, s);
    const tile = porcelainTile(rnd);
    tiles.push({ x, y, w: TILE, h, ...(s === 1 ? { fill: COLOURS.aubergine, opacity: tile.fill === COLOURS.aubergine ? tile.opacity : 0.14 } : tile) });
    // a faint second tile fades out as the row forms
    if (s < 0.6 && rnd() < 0.5 * (1 - s)) {
      const h2 = between(rnd, 14, 30);
      const y2 = y > height / 2 ? between(rnd, 0, Math.max(0, y - h2 - GAP)) : between(rnd, Math.min(height - h2, y + h + GAP), height - h2);
      tiles.push({ x, y: y2, w: TILE, h: h2, ...porcelainTile(rnd) });
    }
  }
  const dot = `<circle cx="${12 + columns * pitch + 4}" cy="${Math.round(height / 2)}" r="5" fill="${COLOURS.gold}"/>`;
  return svg(strip ? 'mosaic--promise-strip' : 'mosaic--promise', width, height, draw(tiles, dot), strip ? 'xMaxYMid slice' : 'xMaxYMid meet');
}

// 2c. The closing band: tiles tone in tone, denser toward the edges of the band and almost
// none behind the text in the middle. The wide variant (900 px and up) grows denser toward
// the left and right edges, the tall one (the phone) toward the top and bottom.
export function closingBand({ seed = 14, width = 1440, height = 560, tall = false } = {}) {
  const rnd = seeded(seed);
  const tiles = [];
  const tile = 36;
  const quiet = tall ? 0.75 : 0.55; // the share of the band (middle) that stays almost empty
  const density = (u) => {
    const d = Math.abs(u - 0.5) * 2; // 0 in the middle, 1 at the edge
    return d < quiet ? 0.03 : 0.03 + 0.62 * clamp01((d - quiet) / (0.9 - quiet));
  };
  for (let x = 0; x + tile <= width; x += tile + GAP) {
    let y = -between(rnd, 0, 40);
    while (y < height) {
      const h = between(rnd, 28, 84);
      const u = tall ? (y + h / 2) / height : (x + tile / 2) / width;
      if (rnd() < density(u)) tiles.push({ x, y, w: tile, h, ...bandTile(rnd) });
      y += h + GAP;
    }
  }
  return svg(tall ? 'mosaic--band-tall' : 'mosaic--band', width, height, draw(tiles));
}

// Every mosaic of the page, for the tests and the size budget.
export function allMosaics() {
  return {
    heroField: heroField(),
    heroCornerTopRight: cornerGroup({ seed: 21 }),
    heroCornerBottomLeft: cornerGroup({ seed: 22 }),
    promise: promisePanel(),
    promiseStrip: promisePanel({ seed: 23, width: 720, height: 120, strip: true, transition: 0.6 }),
    mentorCorner: cornerGroup({ seed: 24 }),
    band: closingBand(),
    bandTall: closingBand({ seed: 25, width: 390, height: 760, tall: true }),
  };
}
