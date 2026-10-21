// Decorative mosaics as inline SVG, drawn at build time from a fixed seed, so every build
// gives the same picture. The tile language of Snapshot: columns of rounded tiles of varying
// height, 6 px gaps, 6 px corners. Colours: the brand aubergine at low opacity, a little
// champagne and warm grey; on the closing band the on-aubergine colour; over its upper border
// the aubergine itself. No pictures, no script, every svg is aria-hidden.
//
// One rule for all of them: no tile is ever cut by an edge. Every tile lies whole inside its
// viewBox (a test checks it), the svgs are never scaled with "slice" or clipped, and the
// fields dissolve through the opacity of the tiles themselves: the farther from the heart
// of the field, the fainter, down to nothing at the edge.

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

const between = (rnd, min, max) => min + (max - min) * rnd();
const smooth = (t) => t * t * (3 - 2 * t);
const clamp01 = (t) => Math.min(1, Math.max(0, t));
// 1 away from an edge, falling smoothly to 0 at the edge over `size` units
const edgeFade = (distance, size) => smooth(clamp01(distance / size));

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

// A tile flying over the upper border of the band, on the porcelain-deep of Practical
// details: the aubergine itself at 0.08 to 0.35.
export function flyTile(rnd) {
  return { fill: COLOURS.aubergine, opacity: between(rnd, 0.08, 0.35) };
}

// Rects grouped by fill, so the colour is written once per group. Tiles faded below 0.015
// would be invisible and are not written at all.
function draw(tiles, extra = '') {
  const groups = new Map();
  for (const t of tiles) {
    if (t.opacity < 0.015) continue;
    if (!groups.has(t.fill)) groups.set(t.fill, []);
    groups.get(t.fill).push(`<rect x="${Math.round(t.x)}" y="${Math.round(t.y)}" width="${Math.round(t.w)}" height="${Math.round(t.h)}" rx="${RADIUS}" fill-opacity="${t.opacity.toFixed(2).replace(/^0/, '')}"/>`);
  }
  return [...groups].map(([fill, rects]) => `<g fill="${fill}">${rects.join('')}</g>`).join('') + extra;
}

function svg(className, width, height, body, { align = 'xMidYMid meet', size = false } = {}) {
  const sized = size ? ` width="${width}" height="${height}"` : '';
  return `<svg class="mosaic ${className}" viewBox="0 0 ${width} ${height}"${sized} preserveAspectRatio="${align}" aria-hidden="true" focusable="false">${body}</svg>`;
}

// Walks the columns of a box and stacks tiles of random height in each, always whole inside
// the box; place(tile) returns the tile to keep (with fill and opacity) or null.
function stackTiles(rnd, { width, height, tile = TILE, gap = GAP, minH = 18, maxH = 56, startMax = 26, firstX = null, adjust = null, place }) {
  const tiles = [];
  let x0 = firstX === null ? Math.round(between(rnd, 2, 8)) : firstX;
  if (x0 + tile > width - 2) x0 = Math.max(2, Math.floor((width - tile) / 2));
  for (let x = x0; x + tile <= width - 2; x += tile + gap) {
    let y = Math.round(between(rnd, 2, startMax));
    while (y + minH <= height - 2) {
      let h = between(rnd, minH, maxH);
      if (adjust) h = adjust(y, h);
      if (y + h > height - 2) h = height - 2 - y;
      if (h < minH) break;
      const kept = place({ x, y, w: tile, h, cx: x + tile / 2, cy: y + h / 2 });
      if (kept) tiles.push(...(Array.isArray(kept) ? kept : [kept]));
      y += h + gap;
    }
  }
  return tiles;
}

// 2a and 5. The field behind a photo: a box larger than the photo (margins in px of the
// reference layout), tiles only in the margins (behind the photo nothing is drawn), denser
// below the photo than above it, stronger in two opposite corners (bias), dissolving to
// nothing at every edge and most of all toward the text (textSide). Drawn with "meet", so
// the whole picture always fits its box and nothing is cropped.
export function photoField({ seed, photo, margins, textSide, bias, className }) {
  const rnd = seeded(seed);
  const W = photo.width + margins.left + margins.right;
  const H = photo.height + margins.top + margins.bottom;
  const inner = { x1: margins.left + 6, y1: margins.top + 6, x2: margins.left + photo.width - 6, y2: margins.top + photo.height - 6 };
  const tiles = stackTiles(rnd, {
    width: W,
    height: H,
    firstX: 8,
    place: (t) => {
      const hidden = t.x >= inner.x1 && t.x + t.w <= inner.x2 && t.y >= inner.y1 && t.y + t.h <= inner.y2;
      if (hidden) return null;
      const u = t.cx / W;
      const v = t.cy / H;
      const above = t.cy < margins.top;
      const below = t.cy > margins.top + photo.height;
      const vertical = above ? 0.5 : below ? 1 : 0.75;
      const strong = bias === 'tr-bl' ? (u > 0.5 && v < 0.5) || (u < 0.5 && v > 0.5) : (u < 0.5 && v < 0.5) || (u > 0.5 && v > 0.5);
      const density = 0.92 * vertical * (strong ? 1 : 0.6);
      // distances from the tile's own edges to the edges of the field
      const toText = textSide === 'left' ? t.x : W - (t.x + t.w);
      const away = textSide === 'left' ? W - (t.x + t.w) : t.x;
      // next to the photo the tiles stand at full strength; toward every edge of the field they
      // fade to nothing (vertically over the whole margin, sideways over the last 26 px)
      const fade = Math.min(edgeFade(t.y + 6, margins.top - 4), edgeFade(H - (t.y + t.h) + 6, margins.bottom - 10), edgeFade(toText, 0.32 * W), edgeFade(away + 12, 26));
      if (rnd() >= density || fade < 0.05) return null;
      const tile = porcelainTile(rnd);
      return { ...t, fill: tile.fill, opacity: tile.opacity * fade };
    },
  });
  return svg(className, W, H, draw(tiles));
}

// The first screen at the reference width 1440: photo 411 x 514, 40 px of field at the sides,
// 48 px above (sparse) and 90 px below (denser); the text stands on the left.
export function heroField({ seed = 31 } = {}) {
  return photoField({ seed, photo: { width: 411, height: 514 }, margins: { top: 48, right: 40, bottom: 90, left: 40 }, textSide: 'left', bias: 'tr-bl', className: 'mosaic--field' });
}

// Meet your mentor at 1440: portrait 387 x 484, the text stands on the right, the strong
// corners are the top-left and the bottom-right (the mirror of the first screen).
export function mentorField({ seed = 34 } = {}) {
  return photoField({ seed, photo: { width: 387, height: 484 }, margins: { top: 40, right: 40, bottom: 90, left: 40 }, textSide: 'right', bias: 'tl-br', className: 'mosaic--field' });
}

// The phone version of the first screen: a small group of whole tiles at a corner of the
// photo, strongest next to the corner and melting away from it. Drawn at its own pixel size.
// anchor tr: the group sits over the top-right corner (24 px above, 16 px to the right);
// anchor bl: over the bottom-left corner.
export function cornerGroup({ seed = 32, width = 150, height = 110, anchor = 'tr' } = {}) {
  const rnd = seeded(seed);
  const [ax, ay] = anchor === 'tr' ? [width - 16, 24] : [16, height - 24];
  const reach = 0.85 * Math.max(width, height);
  const tiles = stackTiles(rnd, {
    width,
    height,
    minH: 16,
    maxH: 44,
    startMax: 14,
    place: (t) => {
      const radial = 1 - smooth(clamp01((Math.hypot(t.cx - ax, t.cy - ay) - 0.15 * reach) / (0.85 * reach)));
      const outer = anchor === 'tr' ? Math.min(edgeFade(t.y, 16), edgeFade(width - (t.x + t.w), 12)) : Math.min(edgeFade(height - (t.y + t.h), 16), edgeFade(t.x, 12));
      const fade = Math.min(radial, outer);
      if (rnd() >= 0.9 || fade < 0.05) return null;
      const tile = porcelainTile(rnd);
      return { ...t, fill: tile.fill, opacity: tile.opacity * fade };
    },
  });
  return svg('mosaic--corner', width, height, draw(tiles), { align: 'xMinYMin meet', size: true });
}

// 6. The closing band and its seam with Practical details, for the left side of the window
// (the right side is the same drawing mirrored through <use>). One drawing per class of window
// width, at its own pixel size, never scaled. The picture begins 200 px above the band
// (y 0 to 200 lies on Practical details): aubergine tiles at 0.08 to 0.35 that fade out
// upwards and toward the page, some straddling the border (drawn twice, once in each colour);
// below the border tiles tone in tone, densest at the window edge, fading toward the middle
// of the window and toward the bottom of the picture. Above the border the drawing stays in
// the page margin (fly), below it in the side zone outside the text column plus 48 px (side).
export const BORDER_Y = 200;
export const BAND_VARIANTS = {
  phone: { width: 24, fly: 24, side: 24, height: 800, tile: 16, gap: 4, minH: 12, maxH: 32 },   // under 480 px
  tablet: { width: 24, fly: 24, side: 24, height: 540, tile: 16, gap: 4, minH: 12, maxH: 32 },  // 480 to 899 px
  narrow: { width: 40, fly: 40, side: 40, height: 640, tile: 24, gap: 6, minH: 16, maxH: 44 },  // 900 to 1279 px
  mid: { width: 212, fly: 80, side: 212, height: 640, tile: 36, gap: 6, minH: 24, maxH: 70 },   // 1280 to 1439 px
  wide: { width: 292, fly: 160, side: 292, height: 640, tile: 36, gap: 6, minH: 24, maxH: 70 }, // 1440 px and up
};
const BAND_SEEDS = { phone: 41, tablet: 42, narrow: 43, mid: 44, wide: 45 };

export function bandVariant(name, seed = BAND_SEEDS[name]) {
  const v = BAND_VARIANTS[name];
  if (!v) throw new Error(`unknown band variant "${name}"`);
  const rnd = seeded(seed);
  const tiles = stackTiles(rnd, {
    width: v.width,
    height: v.height,
    tile: v.tile,
    gap: v.gap,
    minH: v.minH,
    maxH: v.maxH,
    startMax: 40,
    adjust: (y, h) => (y + h >= BORDER_Y - 8 && y + h <= BORDER_Y ? h + 14 : h),
    place: (t) => {
      const above = t.y + t.h <= BORDER_Y;
      const straddles = t.y < BORDER_Y && t.y + t.h > BORDER_Y;
      const fitsFly = t.x + t.w <= v.fly;
      const fitsSide = t.x + t.w <= v.side;
      const oneColumn = v.width <= 48;
      const towardPage = oneColumn ? 1 : edgeFade(v.fly - (t.x + t.w), 0.5 * v.fly);
      if (above) {
        if (!fitsFly) return null;
        const lift = (BORDER_Y - t.y) / BORDER_Y; // 0 at the border, 1 at the top of the picture
        const fade = (1 - smooth(clamp01((lift - 0.05) / 0.9))) * towardPage;
        if (rnd() >= 0.75 * (1 - 0.55 * lift) || fade < 0.05) return null;
        const tile = flyTile(rnd);
        return { ...t, fill: tile.fill, opacity: tile.opacity * fade };
      }
      if (straddles) {
        if (!fitsFly || !fitsSide || (!oneColumn && rnd() >= 0.75)) return null;
        const over = flyTile(rnd);
        const under = bandTile(rnd);
        return [{ ...t, fill: over.fill, opacity: over.opacity * towardPage }, { ...t, fill: under.fill, opacity: under.opacity }];
      }
      if (!fitsSide) return null;
      const fade = (oneColumn ? 1 : edgeFade(v.side - (t.x + t.w), 0.6 * v.side)) * edgeFade(v.height - (t.y + t.h), 70);
      if (rnd() >= 0.8 * (1 - 0.45 * (t.cx / v.side)) || fade < 0.05) return null;
      const tile = bandTile(rnd);
      return { ...t, fill: tile.fill, opacity: tile.opacity * fade };
    },
  });
  return { name, width: v.width, height: v.height, body: draw(tiles), tiles };
}

// The sprite with every band drawing as a <symbol>, and the eight placed svgs (five widths,
// left and right) that show it through <use>. CSS shows the one that fits the window.
export function bandSprite() {
  const symbols = Object.keys(BAND_VARIANTS).map((name) => {
    const v = bandVariant(name);
    return `<symbol id="band-${name}" viewBox="0 0 ${v.width} ${v.height}">${v.body}</symbol>`;
  });
  return `<svg class="mosaic-sprite" aria-hidden="true" focusable="false">${symbols.join('')}</svg>`;
}

export function bandUse(name, side) {
  const v = BAND_VARIANTS[name];
  const mirror = side === 'right' ? ` transform="translate(${v.width} 0) scale(-1 1)"` : '';
  return `<svg class="mosaic mosaic--band mosaic--band-${name} mosaic--band-${side}" viewBox="0 0 ${v.width} ${v.height}" width="${v.width}" height="${v.height}" aria-hidden="true" focusable="false"><use href="#band-${name}"${mirror}/></svg>`;
}

export function bandSvgs() {
  return Object.keys(BAND_VARIANTS).flatMap((name) => [bandUse(name, 'left'), bandUse(name, 'right')]).join('\n  ');
}

// 4. The thin gold lines of the Promise diagram: from four points under the input tiles down
// to the middle, where the result stands. Stretched to its box, the stroke stays 1 px.
export function diagramLines() {
  const lines = [12, 37, 63, 88].map((x) => `<line x1="${x}" y1="0" x2="50" y2="40" stroke="${COLOURS.gold}" stroke-width="1" vector-effect="non-scaling-stroke"/>`);
  return `<svg class="diagram__lines" viewBox="0 0 100 40" preserveAspectRatio="none" aria-hidden="true" focusable="false">${lines.join('')}</svg>`;
}

// Every mosaic drawing of the page as a standalone svg, for the tests and the size budget.
export function allMosaics() {
  const bands = Object.fromEntries(Object.keys(BAND_VARIANTS).map((name) => {
    const v = bandVariant(name);
    return [`band_${name}`, svg(`mosaic--band-${name}`, v.width, v.height, v.body)];
  }));
  return {
    heroField: heroField(),
    heroCornerTopRight: cornerGroup({ seed: 32, anchor: 'tr' }),
    heroCornerBottomLeft: cornerGroup({ seed: 33, anchor: 'bl' }),
    mentorField: mentorField(),
    ...bands,
  };
}
