// Line icons for the page, read from assets/icons (Lucide, ISC) at module load and inlined as
// SVG: one stroke width, no text inside, aria-hidden. ICONS maps a place on the page to a
// file; the renderer calls icon(name). The mapping is the list for the report.

import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

export const ICONS_DIR = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..', 'assets', 'icons');

// place -> Lucide file name
export const ICONS = {
  // Is this you?
  'who-0': 'trending-up',      // Ready for bigger
  'who-1': 'expand',           // Stretched too thin: pulled in every direction
  'who-2': 'eye-off',          // The best-kept secret: not seen
  'who-3': 'clipboard-check',  // A plan for everyone but you
  // Roadmap (slide 8)
  'together': 'star',          // And you won't do it alone
  // What's included (slide 7)
  'package-0': 'users',           // 8 live sessions
  'package-1': 'search',          // your personal diagnostic
  'package-2': 'lightbulb',       // masterminds
  'package-3': 'book-open',       // online tools library
  'package-4': 'message-circle',  // active group chat
  'package-5': 'circle-play',     // session recordings
  'package-after': 'star',        // after week 8
  // What makes my approach different
  'approach-0': 'clapperboard',    // a producer's perspective
  'approach-1': 'layers',          // one integrated method
  'approach-2': 'heart-handshake', // practical mentoring with genuine care
  // Prices
  'invoice': 'check',          // invoices available for employer or L&D budgets
  // Practical details
  'card-0': 'calendar-days',  // 8 weeks
  'card-1': 'clock',          // Weekday evenings
  'card-2': 'users',          // Max 8 women
};

const cache = new Map();

// The inner markup of a Lucide file: everything between the svg tags.
function body(file) {
  if (!cache.has(file)) {
    const svg = readFileSync(path.join(ICONS_DIR, `${file}.svg`), 'utf8');
    const inner = svg.replace(/<!--[^]*?-->/g, '').match(/<svg[^>]*>([^]*)<\/svg>/);
    if (!inner) throw new Error(`${file}.svg: not a Lucide icon`);
    cache.set(file, inner[1].replace(/\s+/g, ' ').trim());
  }
  return cache.get(file);
}

export function icon(place, { size = 20 } = {}) {
  const file = ICONS[place];
  if (!file) throw new Error(`no icon for "${place}"`);
  return `<svg class="icon" viewBox="0 0 24 24" width="${size}" height="${size}" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" focusable="false">${body(file)}</svg>`;
}
