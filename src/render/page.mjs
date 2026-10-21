// The HTML of the page, built from content/offer.yaml with plain template strings: no framework,
// no script on the page. Every text goes through esc() (HTML escaping) or rich() (escaping plus
// **bold**). No word on the page is written here: the texts come from the yaml, the photo
// descriptions from its photo_alt fields. The only additions are the TODO and draft tags,
// shown while meta.published is false, and the decorative mosaics (src/render/mosaic.mjs).

import { heroField, cornerGroup, promisePanel, closingBand } from './mosaic.mjs';

export const OG_IMAGE_FILE = 'og-image.png';
export const OG_WIDTH = 1200;
export const OG_HEIGHT = 627;

// Opacity of the aubergine tiles: one per card of "Is this you?", and the 2 x 2 mini mosaic of
// each level (lighter for the first level, deeper for the third), in the manner of Snapshot.
export const WHO_ALPHAS = [0.35, 0.55, 0.75, 1];
export const LEVEL_ALPHAS = [[0.2, 0.35, 0.3, 0.45], [0.45, 0.6, 0.55, 0.7], [0.7, 0.85, 0.8, 1]];

export const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
// **word** becomes <strong>word</strong>; this is the only markup allowed inside a text.
export const rich = (s) => esc(s).replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>');
export const isTodo = (v) => typeof v === 'string' && /\bTODO\b/.test(v);

const SEP = '<span class="sep" aria-hidden="true">·</span>';
const paragraphs = (list, render = esc, className = '') => list.map((text) => `<p${className ? ` class="${className}"` : ''}>${render(text)}</p>`).join('\n');
const tiles = (alphas, className) => `<span class="${className}" aria-hidden="true">${alphas.map((alpha) => `<span style="--alpha: ${alpha}"></span>`).join('')}</span>`;
const todoTag = (ctx) => (ctx.published ? '' : ' <span class="tag tag--todo">TODO</span>');
const draftTag = (ctx, at) => (!ctx.published && ctx.drafts.has(at) ? ' <span class="tag tag--draft">draft</span>' : '');

// The "Register your interest" button. All four buttons on the page come from here, so the
// next step (a Calendly link, or a form on this page) changes them in one place.
// While register.url is TODO the button leads to "#" and carries a TODO tag (unpublished only).
export function registerButton(ctx, { className = '' } = {}) {
  const { label, url } = ctx.content.register;
  const todo = isTodo(url);
  const classes = ['btn', className].filter(Boolean).join(' ');
  return `<a class="${classes}" href="${todo ? '#' : esc(url)}">${esc(label)}</a>${todo ? todoTag(ctx) : ''}`;
}

// A responsive photo from the manifest of src/images.mjs: webp with a jpg fallback, explicit
// width and height so nothing jumps while it loads. The first-screen photo loads at once
// (eager), the others lazily.
export function picture(ctx, file, { alt, sizes, eager = false }) {
  const m = ctx.manifest[file];
  if (!m) throw new Error(`${file}: no photo versions were built for this file`);
  const webp = m.widths.map((w) => `img/${m.slug}-${w}.webp ${w}w`).join(', ');
  const jpg = m.widths.map((w) => `img/${m.slug}-${w}.jpg ${w}w`).join(', ');
  const maxW = m.widths[m.widths.length - 1];
  const maxH = Math.round((m.height / m.width) * maxW);
  const loading = eager ? 'fetchpriority="high"' : 'loading="lazy" decoding="async"';
  return `<picture>
        <source type="image/webp" srcset="${webp}" sizes="${sizes}">
        <img src="img/${m.slug}-${maxW}.jpg" srcset="${jpg}" sizes="${sizes}" alt="${esc(alt)}" width="${maxW}" height="${maxH}" ${loading}>
      </picture>`;
}

function head(ctx) {
  const { meta, hero } = ctx.content;
  const site = String(meta.site_url || '').trim().replace(/\/$/, '');
  const lines = [
    '<meta charset="utf-8">',
    '<meta name="viewport" content="width=device-width, initial-scale=1">',
    `<title>${esc(meta.title)}</title>`,
    `<meta name="description" content="${esc(meta.description)}">`,
  ];
  if (!ctx.published) lines.push('<meta name="robots" content="noindex, nofollow">');
  lines.push(
    `<meta property="og:title" content="${esc(meta.title)}">`,
    `<meta property="og:description" content="${esc(meta.description)}">`,
    '<meta property="og:type" content="website">',
  );
  // canonical, og:url and og:image need an absolute address: only once site_url is set
  if (site) {
    lines.push(
      `<link rel="canonical" href="${esc(site)}/">`,
      `<meta property="og:url" content="${esc(site)}/">`,
      `<meta property="og:image" content="${esc(site)}/${OG_IMAGE_FILE}">`,
      `<meta property="og:image:width" content="${OG_WIDTH}">`,
      `<meta property="og:image:height" content="${OG_HEIGHT}">`,
      `<meta property="og:image:alt" content="${esc(`${hero.title}: ${hero.subtitle}`)}">`,
      '<meta name="twitter:card" content="summary_large_image">',
    );
  }
  lines.push(
    `<meta name="theme-color" content="${ctx.themeColor}">`,
    '<link rel="icon" type="image/svg+xml" href="favicon.svg">',
    '<link rel="stylesheet" href="styles.css">',
  );
  return lines.map((line) => `  ${line}`).join('\n');
}

function topbar(ctx) {
  return `<header class="topbar">
  <div class="container topbar__inner">
    <p class="brand">${esc(ctx.content.hero.title)}</p>
    <div class="topbar__cta">${registerButton(ctx, { className: 'btn--small' })}</div>
  </div>
</header>`;
}

// The first screen. The photo stands on a field of tiles from 900 px (CSS fades it toward
// the text); on the phone two small groups of tiles touch two corners of the photo instead.
function hero(ctx) {
  const h = ctx.content.hero;
  return `<section class="hero container" aria-labelledby="hero-title">
  <div class="hero__head">
    <p class="hero__name">${esc(h.name)}${draftTag(ctx, 'hero.name')}</p>
    <p class="hero__positioning caps">${esc(h.positioning)}</p>
    <h1 id="hero-title" class="hero__title">${esc(h.title)}</h1>
    <p class="hero__subtitle">${esc(h.subtitle)}</p>
  </div>
  <div class="hero__photo">
    <span class="hero__field" aria-hidden="true">${heroField()}</span>
    <span class="hero__corner hero__corner--tr" aria-hidden="true">${cornerGroup({ seed: 21 })}</span>
    <span class="hero__corner hero__corner--bl" aria-hidden="true">${cornerGroup({ seed: 22 })}</span>
    <div class="hero__picture">
      ${picture(ctx, h.photo, { alt: h.photo_alt, eager: true, sizes: '(min-width: 1200px) 420px, (min-width: 900px) 36vw, (min-width: 540px) 480px, calc(100vw - 48px)' })}
    </div>
  </div>
  <div class="hero__body">
    ${paragraphs(h.paragraphs, esc, 'lead')}
    <div class="hero__cta">${registerButton(ctx)}</div>
    <p class="hero__facts caps">${h.facts.map(esc).join(SEP)}</p>
  </div>
</section>`;
}

function who(ctx) {
  const w = ctx.content.who;
  const cards = w.items.map((text, i) => `      <li class="card"><span class="tile" style="--alpha: ${WHO_ALPHAS[i] ?? 1}" aria-hidden="true"></span><p>${esc(text)}</p></li>`).join('\n');
  return `<section class="section section--deep who" aria-labelledby="who-title">
  <div class="container">
    <h2 id="who-title">${esc(w.heading)}</h2>
    <ul class="cards cards--who">
${cards}
    </ul>
  </div>
</section>`;
}

function problem(ctx) {
  return `<section class="section problem">
  <div class="container problem__inner">
    <span class="rule" aria-hidden="true"></span>
    <p class="problem__text">${esc(ctx.content.problem.statement)}</p>
  </div>
</section>`;
}

// Promise: the text on the left and, from 900 px, a decorative panel of the same height on the
// right (on the phone a low strip under the text): tiles scattered on the left line up into
// one row toward the right and end in a gold dot. From the mosaic to the plan, without a word.
function promise(ctx) {
  const p = ctx.content.promise;
  return `<section class="section promise" aria-labelledby="promise-title">
  <div class="container promise__grid">
    <div class="promise__copy">
      <h2 id="promise-title">${esc(p.heading)}</h2>
      ${paragraphs(p.paragraphs, esc, 'lead')}
    </div>
    <div class="promise__panel" aria-hidden="true">${promisePanel()}${promisePanel({ seed: 23, width: 720, height: 120, strip: true, transition: 0.6 })}</div>
  </div>
</section>`;
}

// The path: start label, three level cards, finish label, joined by a thin line
// (vertical on the phone, horizontal from 900 px).
function process(ctx) {
  const p = ctx.content.process;
  const levels = p.levels.map((level, i) => `        <li class="path__step">
          <span class="path__marker">${i + 1}</span>
          <div class="level">
            <h3 class="level__name">${esc(level.name)}</h3>
            <p>${esc(level.text)}</p>
            ${tiles(LEVEL_ALPHAS[i] ?? LEVEL_ALPHAS[LEVEL_ALPHAS.length - 1], 'mini')}
          </div>
        </li>`).join('\n');
  return `<section class="section section--deep process" aria-labelledby="process-title">
  <div class="container">
    <h2 id="process-title">${esc(p.heading)}</h2>
    <p class="lead">${esc(p.intro)}</p>
    <p>${esc(p.levels_intro)}</p>
    <div class="path">
      <p class="path__end path__end--start caps"><span class="path__dot" aria-hidden="true"></span><span>${esc(p.start_label)}</span></p>
      <ol class="path__levels">
${levels}
      </ol>
      <p class="path__end path__end--finish caps"><span class="path__dot" aria-hidden="true"></span><span>${esc(p.finish_label)}</span></p>
    </div>
  </div>
</section>`;
}

function pack(ctx) {
  const p = ctx.content.package;
  return `<section class="section package" aria-labelledby="package-title">
  <div class="container">
    <h2 id="package-title">${esc(p.heading)}</h2>
    <ul class="package__list">
${p.items.map((text) => `      <li>${esc(text)}</li>`).join('\n')}
    </ul>
  </div>
</section>`;
}

function pricing(ctx) {
  const p = ctx.content.pricing;
  const tiers = p.tiers.map((tier) => `      <li class="tier">
        <h3 class="tier__name">${esc(tier.name)}</h3>
        <p class="tier__price"><span class="tier__amount">${esc(tier.price)}</span> <span class="tier__vat">${esc(p.vat_label)}</span></p>
        <p class="tier__spots"><span class="dot" aria-hidden="true"></span>${esc(tier.spots)}</p>
        <p class="tier__text">${esc(tier.text)}</p>
      </li>`).join('\n');
  return `<section class="section section--deep pricing" aria-labelledby="pricing-title">
  <div class="container">
    <h2 id="pricing-title">${esc(p.heading)}</h2>
    <p class="pricing__sub">${esc(p.subheading)}</p>
    <ul class="tiers">
${tiers}
    </ul>
    <p class="pricing__note">${esc(p.note)}</p>
    <div class="pricing__cta">${registerButton(ctx)}</div>
  </div>
</section>`;
}

// Meet your mentor. The text comes first in the markup (heading, four paragraphs), then the
// two photos. From 900 px the photos form a sticky column on the left: the portrait large,
// the event photo smaller, shifted down and right over its lower edge. On the phone CSS orders
// the pieces: heading, portrait, two paragraphs, event photo, the other paragraphs, quotes.
function proof(ctx) {
  const p = ctx.content.proof;
  const quotes = p.quotes.map((q) => `      <figure class="quote">
        <span class="quote__mark" aria-hidden="true">&ldquo;</span>
        <blockquote class="quote__text"><p>${esc(q.quote)}</p></blockquote>
        <figcaption class="quote__by"><strong class="quote__name">${esc(q.name)}</strong><span class="quote__role">${esc(q.role)}, ${esc(q.company)}</span>${draftTag(ctx, 'proof.quotes')}</figcaption>
      </figure>`).join('\n');
  return `<section class="section proof" aria-labelledby="proof-title">
  <div class="container">
    <div class="proof__grid">
      <div class="proof__copy">
        <h2 id="proof-title">${esc(p.heading)}${draftTag(ctx, 'proof.heading')}</h2>
        ${paragraphs(p.paragraphs, rich)}
      </div>
      <div class="proof__photos">
        <div class="proof__photo proof__photo--portrait">
          ${picture(ctx, p.photo, { alt: p.photo_alt, sizes: '(min-width: 1200px) 400px, (min-width: 900px) 34vw, (min-width: 540px) 480px, calc(100vw - 48px)' })}
        </div>
        <div class="proof__photo proof__photo--event">
          ${picture(ctx, p.photo_2, { alt: p.photo_2_alt, sizes: '(min-width: 1200px) 300px, (min-width: 900px) 26vw, (min-width: 540px) 480px, calc(100vw - 48px)' })}
        </div>
        <span class="proof__corner" aria-hidden="true">${cornerGroup({ seed: 24 })}</span>
      </div>
    </div>
    <h3 class="proof__quotes-heading">${esc(p.quotes_heading)}</h3>
    <div class="quotes">
${quotes}
    </div>
  </div>
</section>`;
}

function logistics(ctx) {
  const l = ctx.content.logistics;
  const rows = l.items.map((item) => `      <div class="details__row"><dt class="caps">${esc(item.label)}</dt><dd>${esc(item.value)}</dd></div>`).join('\n');
  return `<section class="section section--deep logistics" aria-labelledby="logistics-title">
  <div class="container">
    <h2 id="logistics-title">${esc(l.heading)}${draftTag(ctx, 'logistics.heading')}</h2>
    <dl class="details">
${rows}
    </dl>
  </div>
</section>`;
}

// The only aubergine band of the page, across the whole window, with a tone-in-tone mosaic
// that is dense at the edges and almost absent behind the text.
function closing(ctx) {
  return `<section class="closing">
  ${closingBand()}
  ${closingBand({ seed: 25, width: 390, height: 760, tall: true })}
  <div class="container closing__inner">
    <p class="closing__text">${esc(ctx.content.closing.text)}</p>
    <div class="closing__cta">${registerButton(ctx)}</div>
  </div>
</section>`;
}

function footer(ctx) {
  const f = ctx.content.footer;
  return `<footer class="footer">
  <div class="container footer__inner">
    <p>${esc(f.legal_line)}</p>
    <a href="${esc(ctx.content.links.main_site)}">${esc(f.main_site_label)}</a>
  </div>
</footer>`;
}

// manifest: from src/images.mjs; drafts: the Set of yaml paths marked "# draft" (src/check.mjs);
// themeColor: the page background for the browser chrome.
export function renderPage(content, { manifest = {}, drafts = new Set(), themeColor = '#FAF8F5' } = {}) {
  const ctx = { content, manifest, drafts, themeColor, published: content.meta.published === true };
  return `<!doctype html>
<html lang="en">
<head>
${head(ctx)}
</head>
<body>
${topbar(ctx)}
<main>
${hero(ctx)}
${who(ctx)}
${problem(ctx)}
${promise(ctx)}
${process(ctx)}
${pack(ctx)}
${pricing(ctx)}
${proof(ctx)}
${logistics(ctx)}
${closing(ctx)}
</main>
${footer(ctx)}
</body>
</html>
`;
}
