// The HTML of the page, built from content/offer.yaml with plain template strings: no framework,
// no script on the page. Every text goes through esc() (HTML escaping) or rich() (escaping plus
// **bold**). No word on the page is written here: the texts come from the yaml, the photo
// descriptions from its photo_alt fields. The only additions are the draft tags, shown while
// meta.published is false, the decorative mosaics (src/render/mosaic.mjs) and the line icons
// (src/render/icons.mjs, Lucide).

import { heroGroup, bandSprite, bandSvgs } from './mosaic.mjs';
import { icon } from './icons.mjs';

export const OG_IMAGE_FILE = 'og-image.png';
// Tracking tags added to the Calendly address, so Julia sees where a booking came from
// (Calendly: Calendar, Filter, Tracking IDs). utm_content names the place on the page.
export const UTM = { utm_source: 'own-your-mosaic', utm_medium: 'page', utm_campaign: 'pilot-2027' };
export const BUTTON_PLACES = ['topbar', 'hero', 'pricing', 'closing'];
// Tiles on the first screen: 'detached' = a small group in the top-right corner of the block,
// away from the photo; 'none' = no tiles there. Julia asked for them away from the photo.
export const HERO_TILES = 'detached';

// The four small tiles of the Promise diagram, from light to deep, and the 3 x 3 brand sign
// (the same shades as the favicon and the Snapshot icon) before its result line.
export const DIAGRAM_ALPHAS = [0.3, 0.5, 0.75, 1];
export const SIGN_ALPHAS = [1, 0.45, 0.8, 0.3, 0.9, 0.55, 0.7, 0.2, 1];

export const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
// **word** becomes <strong>word</strong>; this is the only markup allowed inside a text.
export const rich = (s) => esc(s).replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>');

const paragraphs = (list, render = esc, className = '') => list.map((text) => `<p${className ? ` class="${className}"` : ''}>${render(text)}</p>`).join('\n');
const tiles = (alphas, className) => `<span class="${className}" aria-hidden="true">${alphas.map((alpha) => `<span style="--alpha: ${alpha}"></span>`).join('')}</span>`;
const draftTag = (ctx, at) => (!ctx.published && ctx.drafts.has(at) ? ' <span class="tag tag--draft">draft</span>' : '');
// A draft tag on its own line, above a group that has no heading of its own (unpublished only).
const draftLine = (ctx, at) => (draftTag(ctx, at) ? `<p class="draft-line">${draftTag(ctx, at).trim()}</p>` : '');
const circle = (place, className) => `<span class="circle ${className}" aria-hidden="true">${icon(place)}</span>`;
// A thin gold arrow (the sign of the shift): points right, CSS turns it down on the phone.
const ARROW = '<svg class="arrow" viewBox="0 0 24 24" width="24" height="24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" focusable="false"><path d="M4 12h15"/><path d="m13 6 6 6-6 6"/></svg>';

// The address of the Calendly booking with the tracking tags, built through URL and
// searchParams, so an address that carries parameters of its own works as well.
export function registerUrl(base, place) {
  const url = new URL(base);
  for (const [key, value] of Object.entries(UTM)) url.searchParams.set(key, value);
  url.searchParams.set('utm_content', place);
  return url.toString();
}

// The "Book a program fit call" button. Every button on the page comes from here: a link to
// Julia's Calendly in a new tab, tagged with the place it stands in (topbar, hero, pricing,
// closing). The label comes from register.label.
export function registerButton(ctx, place, { className = '' } = {}) {
  const r = ctx.content.register;
  const classes = ['btn', className].filter(Boolean).join(' ');
  return `<a class="${classes}" href="${esc(registerUrl(r.url, place))}" target="_blank" rel="noopener">${esc(r.label)}</a>`;
}

// The proportion of a served photo (width / height from the manifest), for a CSS aspect-ratio:
// the frame of the first screen follows the file, so a new photo brings its own proportion.
export function photoRatio(ctx, file) {
  const m = ctx.manifest[file];
  if (!m) throw new Error(`${file}: no photo versions were built for this file`);
  return `${m.width} / ${m.height}`;
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
      '<meta property="og:image:width" content="1200">',
      '<meta property="og:image:height" content="627">',
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
    <div class="topbar__cta">${registerButton(ctx, 'topbar', { className: 'btn--small' })}</div>
  </div>
</header>`;
}

// The first screen: name and positioning in a row of their own; then the title, subtitle and
// tagline with the photo beside them from 900 px (its top on the line of the title, its
// proportion from its file, its right edge past the content toward the window edge); the
// paragraphs, the button and the facts strip (navy, three cells in one row where the column
// is wide enough; the wrapper is the size container the strip queries). The tiles, if
// any, stand alone in the top-right corner of the block at the window edge.
function hero(ctx) {
  const h = ctx.content.hero;
  const group = ctx.heroTiles === 'none' ? '' : `  <span class="hero__tiles hero__tiles--wide" aria-hidden="true">${heroGroup()}</span>
  <span class="hero__tiles hero__tiles--phone" aria-hidden="true">${heroGroup({ phone: true })}</span>
`;
  return `<section class="hero" aria-labelledby="hero-title">
${group}  <div class="container hero__grid">
    <div class="hero__intro">
      <p class="hero__name">${esc(h.name)}</p>
      <p class="hero__positioning caps">${esc(h.positioning)}</p>
    </div>
    <div class="hero__head">
      <h1 id="hero-title" class="hero__title">${esc(h.title)}</h1>
      <p class="hero__subtitle">${esc(h.subtitle)}</p>
      <p class="hero__tagline lead">${esc(h.tagline)}</p>
    </div>
    <div class="hero__photo" style="--photo-ratio: ${photoRatio(ctx, h.photo)}">
      ${picture(ctx, h.photo, { alt: h.photo_alt, eager: true, sizes: '(min-width: 1440px) 512px, (min-width: 1280px) calc(50vw - 206px), (min-width: 1200px) calc(50vw - 150px), (min-width: 900px) calc(38.1vw - 16px), (min-width: 540px) 480px, calc(100vw - 48px)' })}
    </div>
    <div class="hero__body">
      ${paragraphs(h.paragraphs, esc, 'lead')}
      <div class="hero__cta">${registerButton(ctx, 'hero')}</div>
      <div class="facts-box">
        <ul class="facts">
${h.facts.map((fact) => `          <li>${esc(fact)}</li>`).join('\n')}
        </ul>
      </div>
    </div>
  </div>
</section>`;
}

// Is this you?: four cards with an icon in a champagne circle, a title in Lora italic and the text.
function who(ctx) {
  const w = ctx.content.who;
  const cards = w.items.map((item, i) => `      <li class="card who__card">
        ${circle(`who-${i}`, 'circle--champagne')}
        <div>
          <h3 class="who__title">${esc(item.title)}</h3>
          <p>${esc(item.text)}</p>
        </div>
      </li>`).join('\n');
  return `<section class="section section--deep who" aria-labelledby="who-title">
  <div class="container">
    <h2 id="who-title">${esc(w.heading)}${draftTag(ctx, 'who.items')}</h2>
    <ul class="cards cards--who">
${cards}
    </ul>
  </div>
</section>`;
}

// The shift: four rows "From ... to ...", a gold arrow between, a full stop at the end.
function shift(ctx) {
  const s = ctx.content.shift;
  const rows = s.items.map((item) => `      <li class="shift__row">
        <p class="shift__from"><span class="shift__label caps">${esc(s.from_label)}</span> <span class="shift__text">${esc(item.from)}</span></p>
        <span class="shift__arrow">${ARROW}</span>
        <p class="shift__to"><span class="shift__label caps">${esc(s.to_label)}</span> <span class="shift__text">${esc(item.to)}.</span></p>
      </li>`).join('\n');
  return `<section class="section shift" aria-labelledby="shift-title">
  <div class="container">
    <h2 id="shift-title">${esc(s.heading)}${draftTag(ctx, 'shift.heading')}</h2>
    <ol class="shift__list">
${rows}
    </ol>
  </div>
</section>`;
}

// Problem: a navy band across the window, a gold rule, the statement in Lora, the rest in
// Lora italic in champagne.
function problem(ctx) {
  const p = ctx.content.problem;
  return `<section class="problem band band--navy">
  <div class="container problem__inner">
    <span class="rule" aria-hidden="true"></span>
    <p class="problem__text">${esc(p.statement)}</p>
    <p class="problem__more">${esc(p.statement_more)}</p>
  </div>
</section>`;
}

// Promise: the heading and the paragraph as a lead; on the right the diagram card: four
// inputs with tiles, a gold stem to the result behind the brand sign, then the four outcomes
// with numbers in aubergine circles.
function promise(ctx) {
  const p = ctx.content.promise;
  const d = p.diagram;
  const inputs = d.inputs.map((text, i) => `        <li class="diagram__input"><span class="diagram__tile" style="--alpha: ${DIAGRAM_ALPHAS[i] ?? 1}" aria-hidden="true"></span><span class="diagram__word">${esc(text)}</span></li>`).join('\n');
  const outcomes = p.outcomes.map((text, i) => `        <li><span class="diagram__number" aria-hidden="true">${i + 1}</span><span>${esc(text)}</span></li>`).join('\n');
  return `<section class="section promise" aria-labelledby="promise-title">
  <div class="container promise__grid">
    <div class="promise__copy">
      <h2 id="promise-title">${esc(p.heading)}</h2>
      ${paragraphs(p.paragraphs, esc, 'lead')}
    </div>
    <div class="diagram">
      <p class="diagram__label caps">${esc(d.inputs_label)}${draftTag(ctx, 'promise.diagram')}</p>
      <ul class="diagram__inputs">
${inputs}
      </ul>
      <div class="diagram__join" aria-hidden="true"><span class="diagram__stem"></span><span class="diagram__dot"></span></div>
      <p class="diagram__result">${tiles(SIGN_ALPHAS, 'diagram__sign')}<span class="diagram__title">${esc(d.result)}</span></p>
      <span class="diagram__rule" aria-hidden="true"></span>
      <p class="diagram__label diagram__label--outcomes">${esc(p.outcomes_intro)}</p>
      <ol class="diagram__outcomes">
${outcomes}
      </ol>
    </div>
  </div>
</section>`;
}

// The path: start label, three level cards, finish label, joined by a thin line (vertical on
// the phone, horizontal from 900 px), with the weeks above every point. The cards carry the
// colours of Julia's pyramid: champagne, navy, aubergine.
function process(ctx) {
  const p = ctx.content.process;
  const levels = p.levels.map((level, i) => `        <li class="path__step">
          <span class="path__marker">${i + 1}</span>
          <span class="path__weeks caps">${esc(level.weeks)}</span>
          <div class="level level--${i + 1}">
            <h3 class="level__name">${esc(level.name)}</h3>
            <p>${esc(level.text)}</p>
          </div>
        </li>`).join('\n');
  return `<section class="section section--deep process" aria-labelledby="process-title">
  <div class="container">
    <h2 id="process-title">${esc(p.heading)}</h2>
    <p class="lead">${esc(p.intro)}</p>
    <p>${esc(p.levels_intro)}</p>
    <div class="path">
      <div class="path__end path__end--start"><span class="path__dot" aria-hidden="true"></span><span class="path__weeks caps">${esc(p.start_weeks)}</span><span class="path__end-label caps">${esc(p.start_label)}</span></div>
      <ol class="path__levels">
${levels}
      </ol>
      <div class="path__end path__end--finish"><span class="path__dot" aria-hidden="true"></span><span class="path__weeks caps">${esc(p.finish_weeks)}</span><span class="path__end-label caps">${esc(p.finish_label)}</span></div>
    </div>
  </div>
</section>`;
}

// What's included: the stats band (navy, four cells) and the eight points with icons in
// aubergine circles.
function pack(ctx) {
  const p = ctx.content.package;
  const stats = p.stats.map((stat) => `      <li><span class="stats__value">${esc(stat.value)}</span><span class="stats__label">${esc(stat.label)}</span></li>`).join('\n');
  const items = p.items.map((text, i) => `      <li>${circle(`package-${i}`, 'circle--aubergine')}<span>${esc(text)}</span></li>`).join('\n');
  return `<section class="section package" aria-labelledby="package-title">
  <div class="container">
    <h2 id="package-title">${esc(p.heading)}</h2>
    ${draftLine(ctx, 'package.stats')}
    <ul class="stats">
${stats}
    </ul>
    <ul class="package__list">
${items}
    </ul>
  </div>
</section>`;
}

// Pricing: three filled cards (champagne, navy, aubergine) with a gold line on top, the spots
// under the price where a tier has them, the total above the cards.
function pricing(ctx) {
  const p = ctx.content.pricing;
  const kinds = ['core', 'plus', 'premium'];
  const tiers = p.tiers.map((tier, i) => `      <li class="tier tier--${kinds[i] || 'core'}">
        <h3 class="tier__name">${esc(tier.name)}</h3>
        <p class="tier__price"><span class="tier__amount">${esc(tier.price)}</span> <span class="tier__vat">${esc(p.vat_label)}</span></p>
${String(tier.spots || '').trim() ? `        <p class="tier__spots">${esc(tier.spots)}</p>\n` : ''}        <p class="tier__text">${esc(tier.text)}</p>
      </li>`).join('\n');
  return `<section class="section section--deep pricing" aria-labelledby="pricing-title">
  <div class="container">
    <h2 id="pricing-title">${esc(p.heading)}</h2>
    <p class="pricing__sub">${esc(p.subheading)}</p>
    <p class="pricing__total caps">${esc(p.total_spots)}${draftTag(ctx, 'pricing.total_spots')}</p>
    <ul class="tiers">
${tiers}
    </ul>
    <p class="pricing__note">${esc(p.note)}</p>
    <div class="pricing__cta">${registerButton(ctx, 'pricing')}</div>
  </div>
</section>`;
}

// Meet your mentor: a navy band; the heading, then the sticky portrait on the left and, on the
// right, two large figures in champagne and the two paragraphs. No tiles here: Julia asked for
// the tiles away from the photos, and on navy they would only repeat that.
function proof(ctx) {
  const p = ctx.content.proof;
  const stats = p.stats.map((stat) => `          <li><span class="proof__value">${esc(stat.value)}</span><span class="proof__label">${esc(stat.label)}</span></li>`).join('\n');
  return `<section class="section proof band band--navy" aria-labelledby="proof-title">
  <div class="container">
    <h2 id="proof-title">${esc(p.heading)}</h2>
    <div class="proof__grid">
      <div class="proof__photos">
        <div class="proof__picture">
          ${picture(ctx, p.photo, { alt: p.photo_alt, sizes: '(min-width: 1200px) 400px, (min-width: 900px) 34vw, (min-width: 540px) 480px, calc(100vw - 48px)' })}
        </div>
      </div>
      <div class="proof__copy">
        ${draftLine(ctx, 'proof.stats')}
        <ul class="proof__stats">
${stats}
        </ul>
        ${paragraphs(p.paragraphs, rich)}
      </div>
    </div>
  </div>
</section>`;
}

// What I bring: an aubergine panel with the five strengths and icons on the left; on the right
// the mentoring paragraph and, under it, its picture: three struck-through pills, a gold arrow
// and a navy plaque with the result. The picture repeats the words of the paragraph, so it is
// hidden from screen readers. Under both columns, the photo of Julia leading a session.
function bring(ctx) {
  const p = ctx.content.proof;
  const strengths = p.strengths.map((text, i) => `        <li>${circle(`strength-${i}`, 'circle--outline')}<span>${esc(text)}</span></li>`).join('\n');
  const pills = p.shift_visual.from.map((text) => `<span class="struck"><s>${esc(text)}</s></span>`).join('\n          ');
  return `<section class="section bring" aria-label="${esc(p.strengths_intro)}">
  <div class="container bring__grid">
    <div class="bring__panel">
      <p class="bring__intro">${esc(p.strengths_intro)}</p>
      <ul class="bring__list">
${strengths}
      </ul>
    </div>
    <div class="bring__copy">
      <p>${esc(p.mentoring)}</p>
      ${draftLine(ctx, 'proof.shift_visual')}
      <div class="shift-visual" aria-hidden="true">
        <div class="shift-visual__from">
          ${pills}
        </div>
        <span class="shift-visual__arrow">${ARROW}</span>
        <p class="shift-visual__to">${esc(p.shift_visual.to)}</p>
      </div>
    </div>
  </div>
  <div class="container bring__photo">
    ${picture(ctx, p.mentoring_photo, { alt: p.mentoring_photo_alt, sizes: '(min-width: 1200px) 1040px, (min-width: 900px) calc(100vw - 80px), calc(100vw - 48px)' })}
  </div>
</section>`;
}

// The group photo: a band across the whole window between the quotes and Practical details,
// no heading, no caption, no rounded corners.
function group(ctx) {
  const p = ctx.content.proof;
  return `<div class="group-photo">
  ${picture(ctx, p.group_photo, { alt: p.group_photo_alt, sizes: '100vw' })}
</div>`;
}

// In their own words: two quotes on cards (placeholders until Julia sends her own).
function quotes(ctx) {
  const p = ctx.content.proof;
  const items = p.quotes.map((q) => `      <figure class="quote">
        <span class="quote__mark" aria-hidden="true">&ldquo;</span>
        <blockquote class="quote__text"><p>${esc(q.quote)}</p></blockquote>
        <figcaption class="quote__by"><strong class="quote__name">${esc(q.name)}</strong><span class="quote__role">${esc(q.role)}, ${esc(q.company)}</span></figcaption>
      </figure>`).join('\n');
  return `<section class="section quotes" aria-labelledby="quotes-title">
  <div class="container">
    <h2 id="quotes-title">${esc(p.quotes_heading)}${draftTag(ctx, 'proof.quotes')}</h2>
    <div class="quotes__grid">
${items}
    </div>
  </div>
</section>`;
}

// Practical details: three filled cards with an icon, a value in Lora and a label, then the
// timeline of four steps on a thin gold line (vertical on the phone).
function logistics(ctx) {
  const l = ctx.content.logistics;
  const kinds = ['champagne', 'navy', 'aubergine'];
  const cards = l.cards.map((card, i) => `      <li class="detail detail--${kinds[i] || 'champagne'}">
        ${circle(`card-${i}`, i === 0 ? 'circle--aubergine' : 'circle--outline')}
        <span class="detail__value">${esc(card.value)}</span>
        <span class="detail__label">${esc(card.label)}</span>
      </li>`).join('\n');
  const steps = l.timeline.map((step) => `      <li class="step">
        <span class="step__when caps">${esc(step.when)}</span>
        <span class="step__dot" aria-hidden="true"></span>
        <h3 class="step__title">${esc(step.title)}</h3>
        <p class="step__text">${esc(step.text)}</p>
      </li>`).join('\n');
  return `<section class="section section--deep logistics" aria-labelledby="logistics-title">
  <div class="container">
    <h2 id="logistics-title">${esc(l.heading)}${draftTag(ctx, 'logistics.cards')}</h2>
    <ul class="details">
${cards}
    </ul>
    ${draftLine(ctx, 'logistics.timeline')}
    <ol class="timeline">
${steps}
    </ol>
  </div>
</section>`;
}

// The closing band: aubergine, modest since PROMPT 04 (a friendly reminder, not a statement):
// the text at lead size up to 640 px wide and the button. Tiles only at the sides, outside the
// text, and over the upper border onto Practical details; the drawings sit in a hidden sprite.
function closing(ctx) {
  return `<section class="closing">
  ${bandSprite()}
  ${bandSvgs()}
  <div class="container closing__inner">
    <p class="closing__text">${esc(ctx.content.closing.text)}</p>
    <div class="closing__cta">${registerButton(ctx, 'closing')}</div>
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
// themeColor: the page background for the browser chrome; heroTiles: HERO_TILES or an override.
export function renderPage(content, { manifest = {}, drafts = new Set(), themeColor = '#FAF8F5', heroTiles = HERO_TILES } = {}) {
  const ctx = { content, manifest, drafts, themeColor, heroTiles, published: content.meta.published === true };
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
${shift(ctx)}
${problem(ctx)}
${promise(ctx)}
${process(ctx)}
${pack(ctx)}
${pricing(ctx)}
${proof(ctx)}
${bring(ctx)}
${quotes(ctx)}
${group(ctx)}
${logistics(ctx)}
${closing(ctx)}
</main>
${footer(ctx)}
</body>
</html>
`;
}
