// The HTML of the page, built from content/offer.yaml with plain template strings: no framework,
// no script on the page. Every text goes through esc() (HTML escaping) or rich() (escaping plus
// **bold** and *italic*). No word on the page is written here: the texts come from the yaml, the
// photo descriptions from its photo_alt fields. The only additions are the draft tags, shown
// while meta.published is false, the decorative mosaics and the tiles picture of the Problem
// band (src/render/mosaic.mjs) and the line icons (src/render/icons.mjs, Lucide).

import { heroGroup, bandSprite, bandSvgs, pathNow, pathAfter } from './mosaic.mjs';
import { icon } from './icons.mjs';

export const OG_IMAGE_FILE = 'og-image.png';
export const OG_WIDTH = 1200;
export const OG_HEIGHT = 627;
// Tracking tags added to the Calendly address, so Julia sees where a booking came from
// (Calendly: Calendar, Filter, Tracking IDs). utm_content names the place on the page.
// utm_campaign keeps its first value: it is a filter key in Calendly, not a text of the page.
export const UTM = { utm_source: 'own-your-mosaic', utm_medium: 'page', utm_campaign: 'pilot-2027' };
export const BUTTON_PLACES = ['topbar', 'hero', 'pricing', 'closing'];
// The places of the two deposit buttons (never the first screen or the top bar).
export const DEPOSIT_PLACES = ['pricing', 'closing'];
// The blocks that can take a client's quote (quotes[].at in the yaml). The Roadmap takes none
// since 16 Nov: its layout follows Julia's slide 8. "bridge" is the band between The shift and
// the Roadmap, which since 17 Nov holds nothing but a quote (Anna's).
export const QUOTE_BLOCKS = ['shift', 'bridge', 'process', 'package', 'pricing', 'logistics'];
// Tiles on the first screen: 'detached' = a small group in the top-right corner of the block,
// away from the photo; 'none' = no tiles there. Julia asked for them away from the photo.
export const HERO_TILES = 'detached';

export const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
// **word** becomes <strong>word</strong>, *word* becomes <em>word</em> (a book title); this is
// the only markup allowed inside a text.
export const rich = (s) => esc(s).replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>').replace(/\*(.+?)\*/g, '<em>$1</em>');

const paragraphs = (list, render = esc, className = '') => list.map((text) => `<p${className ? ` class="${className}"` : ''}>${render(text)}</p>`).join('\n');
const draftTag = (ctx, at) => (!ctx.published && ctx.drafts.has(at) ? ' <span class="tag tag--draft">draft</span>' : '');
// A draft tag on its own line, above a group that has no heading of its own (unpublished only).
const draftLine = (ctx, at) => (draftTag(ctx, at) ? `<p class="draft-line">${draftTag(ctx, at).trim()}</p>` : '');
const circle = (place, className) => `<span class="circle ${className}" aria-hidden="true">${icon(place)}</span>`;
// A thin gold arrow (the sign of the shift): points right, CSS turns it down on the phone where
// the shift rows stack and between the two squares of the tiles picture from 900 px.
const ARROW = '<svg class="arrow" viewBox="0 0 24 24" width="24" height="24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" focusable="false"><path d="M4 12h15"/><path d="m13 6 6 6-6 6"/></svg>';

// The address of a tagged link (the Calendly booking, the Stripe deposit) with the tracking
// tags, built through URL and searchParams, so an address that carries parameters of its own
// works as well.
export function registerUrl(base, place) {
  const url = new URL(base);
  for (const [key, value] of Object.entries(UTM)) url.searchParams.set(key, value);
  url.searchParams.set('utm_content', place);
  return url.toString();
}

// The call button. Every call button on the page comes from here: a link to Julia's Calendly
// in a new tab, tagged with the place it stands in (topbar, hero, pricing, closing). The label
// comes from register.label (20 minutes on the button; the link stays the 30-minute meeting).
export function registerButton(ctx, place, { className = '' } = {}) {
  const r = ctx.content.register;
  const classes = ['btn', className].filter(Boolean).join(' ');
  return `<a class="${classes}" href="${esc(registerUrl(r.url, place))}" target="_blank" rel="noopener">${esc(r.label)}</a>`;
}

// The deposit button: a link to the Stripe payment of the deposit in a new tab, outline style
// (the call stays the main button), tagged like the call button with the place it stands in
// (pricing, closing). The label comes from deposit.label; its note is printed by the block.
export function depositButton(ctx, place) {
  const d = ctx.content.deposit;
  return `<a class="btn btn--outline" href="${esc(registerUrl(d.url, place))}" target="_blank" rel="noopener">${esc(d.label)}</a>`;
}

// A client's quote (quotes[] in the yaml), printed by the block that quotes[].at names: the
// mark, the paragraphs in Lora italic with the key phrase in bold (**...** in the yaml, Julia's
// choice of 17 Nov), the name and, under it, the role and the company. A block with no quote
// prints nothing. The figure takes the full width of the block's content; compact:
// true gives the smaller variant for a column, wrap names a div to hold the figures (two
// quotes side by side under What's included).
function quotesIn(ctx, at, { wrap = '', compact = false } = {}) {
  const figures = ctx.content.quotes.filter((q) => q.at === at).map((q) => `    <figure class="quote${compact ? ' quote--compact' : ''}">
      <span class="quote__mark" aria-hidden="true">&ldquo;</span>
      <blockquote class="quote__text">
${q.text.map((p) => `        <p>${rich(p)}</p>`).join('\n')}
      </blockquote>
      <figcaption class="quote__by"><strong class="quote__name">${esc(q.name)}</strong><span class="quote__role">${esc(q.role)}, ${esc(q.company)}</span></figcaption>
    </figure>`);
  if (!figures.length) return '';
  const body = figures.join('\n');
  return wrap ? `\n    <div class="${wrap}">\n${body}\n    </div>` : `\n${body}`;
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
      `<meta property="og:image:width" content="${OG_WIDTH}">`,
      `<meta property="og:image:height" content="${OG_HEIGHT}">`,
      `<meta property="og:image:alt" content="${esc(`${hero.title}: ${hero.lines.join(' ')}`)}">`,
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

// The first screen: name and positioning in a row of their own; then the title and, under it,
// the three lines of Julia's note of 17 Nov (each on a line of its own, Lora), with the photo
// beside them from 900 px (its top on the line of the title, its proportion from its file, its
// right edge past the content toward the window edge); the supporting copy, the button and the
// facts strip (navy, three cells in one row where the column is wide enough; the wrapper is
// the size container the strip queries). The tiles, if any, stand alone in the top-right
// corner of the block at the window edge.
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
      <p class="hero__lines">${h.lines.map((line) => esc(line)).join('<br>\n        ')}</p>
    </div>
    <div class="hero__photo" style="--photo-ratio: ${photoRatio(ctx, h.photo)}">
      ${picture(ctx, h.photo, { alt: h.photo_alt, eager: true, sizes: '(min-width: 1440px) 512px, (min-width: 1280px) calc(50vw - 206px), (min-width: 1200px) calc(50vw - 150px), (min-width: 900px) calc(38.1vw - 16px), (min-width: 540px) 480px, calc(100vw - 48px)' })}
    </div>
    <div class="hero__body">
      <p class="hero__supporting">${esc(h.supporting)}</p>
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

// Who it is for: the small line above the heading (Julia, 18 Nov), the heading and four cards
// with an icon in a champagne circle, a title in Lora italic and the text.
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
    <p class="who__label caps">${esc(w.label)}</p>
    <h2 id="who-title">${esc(w.heading)}${draftTag(ctx, 'who.items')}</h2>
    <ul class="cards cards--who">
${cards}
    </ul>
  </div>
</section>`;
}

// The shift: the heading, four compact rows "From ... to ..." with a gold arrow between and a
// full stop at the end, and the tiles picture (Julia's note of 17 Nov): two squares of one
// size, "now" with the sixteen tiles pushed off their points and turned, "after 8 weeks" with
// the same tiles as one even mosaic, a label over each square at its left edge, a gold arrow
// from the first square to the second (src/render/mosaic.mjs draws the squares, no picture
// file). From 900 px the squares stand one under the other beside the rows, as tall together
// as the rows; on the phone side by side under the rows.
function shift(ctx) {
  const s = ctx.content.shift;
  const rows = s.items.map((item) => `      <li class="shift__row">
        <p class="shift__from"><span class="shift__label caps">${esc(s.from_label)}</span> <span class="shift__text">${esc(item.from)}</span></p>
        <span class="shift__arrow">${ARROW}</span>
        <p class="shift__to"><span class="shift__label caps">${esc(s.to_label)}</span> <span class="shift__text">${esc(item.to)}.</span></p>
      </li>`).join('\n');
  return `<section class="section shift" aria-labelledby="shift-title">
  <div class="container shift__grid">
    <h2 id="shift-title" class="shift__heading">${esc(s.heading)}${draftTag(ctx, 'shift.heading')}</h2>
    <ol class="shift__list">
${rows}
    </ol>
    <div class="tiles-pair">
      <div class="tiles-pair__cell tiles-pair__cell--now">
        <p class="tiles-pair__label caps">${esc(s.now_label)}</p>
        <div class="tiles-pair__square">${pathNow()}<span class="tiles-pair__arrow" aria-hidden="true">${ARROW}</span></div>
      </div>
      <div class="tiles-pair__cell tiles-pair__cell--after">
        <p class="tiles-pair__label caps">${esc(s.after_label)}</p>
        <div class="tiles-pair__square">${pathAfter()}</div>
      </div>
    </div>${quotesIn(ctx, 'shift')}
  </div>
</section>`;
}

// The bridge: the light band between The shift and the Roadmap, which since 17 Nov holds only
// a client's quote (quotes[].at = bridge), the full width of the content. Without a quote the
// band is not printed at all.
function bridge(ctx) {
  const quotes = quotesIn(ctx, 'bridge');
  if (!quotes) return '';
  return `<section class="section section--deep bridge" aria-label="${esc(ctx.content.quotes.find((q) => q.at === 'bridge').name)}">
  <div class="container">${quotes}
  </div>
</section>`;
}

// Roadmap: an aubergine band after Julia's slide 8. On the left the label, the heading "What
// you walk away with", the second label and the four inputs as filled tiles (champagne, navy,
// a lighter aubergine, gold). On the right the title of the list in champagne, the four numbered
// points, each with its lead in champagne, on a thin line, and under a rule the line about the
// circle with a star. One column on the phone: the left part, then the right.
function promise(ctx) {
  const p = ctx.content.promise;
  const inputs = p.inputs.map((text, i) => `        <li class="inputs__tile inputs__tile--${i + 1}">${esc(text)}</li>`).join('\n');
  const outcomes = p.outcomes.map((item, i) => `        <li class="roadmap__item"><span class="roadmap__number" aria-hidden="true">${i + 1}</span><p><strong>${esc(item.lead)}</strong> ${esc(item.text)}</p></li>`).join('\n');
  return `<section class="section promise band band--aubergine" aria-labelledby="promise-title">
  <div class="container promise__grid">
    <div class="promise__copy">
      <p class="promise__label caps">${esc(p.label)}</p>
      <h2 id="promise-title">${esc(p.heading)}${draftTag(ctx, 'promise.heading')}</h2>
      <p class="promise__label promise__label--inputs caps">${esc(p.inputs_label)}</p>
      <ul class="inputs">
${inputs}
      </ul>
    </div>
    <div class="roadmap">
      <h3 class="roadmap__title">${esc(p.list_heading)}</h3>
      <ol class="roadmap__list">
${outcomes}
      </ol>
      <p class="roadmap__together">${circle('together', 'circle--outline')}<span><strong>${esc(p.together.lead)}</strong> ${esc(p.together.text)}</span></p>
    </div>
  </div>
</section>`;
}

// The path: start label, three level cards, finish label, joined by a thin line (vertical on
// the phone, horizontal from 900 px), with the weeks above every point. The cards carry the
// colours of Julia's pyramid: champagne, navy, aubergine. Texts after her slide 4.
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
    ${draftLine(ctx, 'process.levels')}
    <div class="path">
      <div class="path__end path__end--start"><span class="path__dot" aria-hidden="true"></span><span class="path__weeks caps">${esc(p.start_weeks)}</span><span class="path__end-label caps">${esc(p.start_label)}</span></div>
      <ol class="path__levels">
${levels}
      </ol>
      <div class="path__end path__end--finish"><span class="path__dot" aria-hidden="true"></span><span class="path__weeks caps">${esc(p.finish_weeks)}</span><span class="path__end-label caps">${esc(p.finish_label)}</span></div>
    </div>${quotesIn(ctx, 'process')}
  </div>
</section>`;
}

// What's included, after Julia's slide 7: six tiles, each with an icon in an aubergine circle,
// a title in Lora and a line under it; then the champagne strip "after week 8" with a star and
// two phrases in bold (**...** in the yaml, Julia's choice of 17 Nov);
// then, side by side from 900 px, the two quotes that stand between this block and the prices.
function pack(ctx) {
  const p = ctx.content.package;
  const items = p.items.map((item, i) => `      <li class="included__item">
        ${circle(`package-${i}`, 'circle--aubergine')}
        <div>
          <h3 class="included__title">${esc(item.title)}</h3>
          <p class="included__text">${esc(item.text)}</p>
        </div>
      </li>`).join('\n');
  return `<section class="section package" aria-labelledby="package-title">
  <div class="container">
    <h2 id="package-title">${esc(p.heading)}</h2>
    ${draftLine(ctx, 'package.items')}
    <ul class="included">
${items}
    </ul>
    <div class="after-week">
      ${circle('package-after', 'circle--aubergine')}
      <div>
        <p class="after-week__label caps">${esc(p.after_label)}</p>
        <p class="after-week__text">${rich(p.after_text)}</p>
      </div>
    </div>${quotesIn(ctx, 'package', { wrap: 'package__quotes' })}
  </div>
</section>`;
}

// Pricing, after Julia's price slide of 18 Nov: the cohort line in capitals (the spots after
// the dot held together by no-break spaces, so the phone breaks the line before the dot), the
// heading, then the line about the invoices with a check mark in an aubergine circle (above
// the cards, where the phone shows it before the column of cards), three filled cards
// (champagne, navy, aubergine) with a gold line on top, in each the price with "(excl. VAT)"
// beside it, the spots where a tier has them (none since 18 Nov), the intro line and the list
// of what is in (Core: five points; Plus and Premium: one line), and at the foot of a card its
// badge where it has one ("Most recommended" on Plus). Under the cards the call button; beside
// it, for those who have decided, the deposit: a lead line, the outline button and its note.
function pricing(ctx) {
  const p = ctx.content.pricing;
  const d = ctx.content.deposit;
  const kinds = ['core', 'plus', 'premium'];
  const tiers = p.tiers.map((tier, i) => `      <li class="tier tier--${kinds[i] || 'core'}">
        <h3 class="tier__name">${esc(tier.name)}</h3>
        <p class="tier__price"><span class="tier__amount">${esc(tier.price)}</span> <span class="tier__vat">${esc(p.vat_label)}</span></p>
${String(tier.spots || '').trim() ? `        <p class="tier__terms">${esc(tier.spots)}</p>\n` : ''}        <p class="tier__intro">${esc(tier.intro)}</p>
${tier.items.length > 1 ? `        <ul class="tier__list">\n${tier.items.map((item) => `          <li>${esc(item)}</li>`).join('\n')}\n        </ul>` : `        <p class="tier__line">${esc(tier.items[0])}</p>`}
${String(tier.badge || '').trim() ? `        <p class="tier__badge">${esc(tier.badge)}</p>\n` : ''}      </li>`).join('\n');
  return `<section class="section section--deep pricing" aria-labelledby="pricing-title">
  <div class="container">
    <p class="pricing__label caps">${esc(p.subheading)} · ${esc(p.total_spots).replace(/ /g, '&nbsp;')}${draftTag(ctx, 'pricing.subheading')}</p>
    <h2 id="pricing-title">${esc(p.heading)}</h2>
    <p class="pricing__invoice">${circle('invoice', 'circle--aubergine')}<span>${esc(p.invoice_note)}</span></p>
    ${draftLine(ctx, 'pricing.tiers')}
    <ul class="tiers">
${tiers}
    </ul>
    <div class="pricing__actions">
      <div class="pricing__call">
        <div class="pricing__cta">${registerButton(ctx, 'pricing')}</div>
      </div>
      <div class="deposit">
        <p class="deposit__lead">${esc(d.lead)}</p>
        ${depositButton(ctx, 'pricing')}
        <p class="deposit__note">${esc(d.note)}</p>
      </div>
    </div>${quotesIn(ctx, 'pricing')}
  </div>
</section>`;
}

// Meet your mentor: a navy band; the heading, then the sticky portrait on the left and, on the
// right, the paragraphs of Julia's document of 16 Nov (the book title in italic). No tiles
// here: Julia asked for the tiles away from the photos, and on navy they would only repeat that.
function proof(ctx) {
  const p = ctx.content.proof;
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
        ${draftLine(ctx, 'proof.paragraphs')}
        ${paragraphs(p.paragraphs, rich)}
      </div>
    </div>
  </div>
</section>`;
}

// What makes my approach different (Julia's document of 16 Nov, in place of "What producing
// gave me"): three cards in a row from 900 px, each with an icon in a champagne circle, a
// title in Lora and the text. Under them, the photo of Julia leading a session.
function approach(ctx) {
  const a = ctx.content.approach;
  const p = ctx.content.proof;
  const cards = a.items.map((item, i) => `      <li class="card approach__card">
        ${circle(`approach-${i}`, 'circle--champagne')}
        <h3 class="approach__title">${esc(item.title)}</h3>
        <p>${esc(item.text)}</p>
      </li>`).join('\n');
  return `<section class="section approach" aria-labelledby="approach-title">
  <div class="container">
    <h2 id="approach-title">${esc(a.heading)}${draftTag(ctx, 'approach.items')}</h2>
    <ul class="cards cards--approach">
${cards}
    </ul>
  </div>
  <div class="container approach__photo">
    ${picture(ctx, p.mentoring_photo, { alt: p.mentoring_photo_alt, sizes: '(min-width: 1200px) 1040px, (min-width: 900px) calc(100vw - 80px), calc(100vw - 48px)' })}
  </div>
</section>`;
}

// The group photo: a band across the whole window between the approach cards and Practical
// details, no heading, no caption, no rounded corners.
function group(ctx) {
  const p = ctx.content.proof;
  return `<div class="group-photo">
  ${picture(ctx, p.group_photo, { alt: p.group_photo_alt, sizes: '100vw' })}
</div>`;
}

// Practical details: three filled cards with an icon, a value in Lora and a label, then the
// timeline of four steps on a thin gold line (vertical on the phone). A step whose date is
// empty in the yaml (the payment, since 16 Nov) shows no date line.
function logistics(ctx) {
  const l = ctx.content.logistics;
  const kinds = ['champagne', 'navy', 'aubergine'];
  const cards = l.cards.map((card, i) => `      <li class="detail detail--${kinds[i] || 'champagne'}">
        ${circle(`card-${i}`, i === 0 ? 'circle--aubergine' : 'circle--outline')}
        <span class="detail__value">${esc(card.value)}</span>
        <span class="detail__label">${esc(card.label)}</span>
      </li>`).join('\n');
  const steps = l.timeline.map((step) => `      <li class="step">
${String(step.when || '').trim() ? `        <span class="step__when caps">${esc(step.when)}</span>\n` : ''}        <span class="step__dot" aria-hidden="true"></span>
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
    </ol>${quotesIn(ctx, 'logistics')}
  </div>
</section>`;
}

// Good to know, after Julia's slide 10: the label, the heading and six questions with their
// answers, each on a thin gold line at the left; two columns from 900 px, filled column by
// column as on the slide.
function faq(ctx) {
  const f = ctx.content.faq;
  const items = f.items.map((item) => `      <div class="faq__item">
        <h3 class="faq__q">${esc(item.q)}</h3>
        <p class="faq__a">${esc(item.a)}</p>
      </div>`).join('\n');
  return `<section class="section faq" aria-labelledby="faq-title">
  <div class="container">
    <p class="faq__label caps">${esc(f.label)}</p>
    <h2 id="faq-title">${esc(f.heading)}${draftTag(ctx, 'faq.items')}</h2>
    <div class="faq__grid">
${items}
    </div>
  </div>
</section>`;
}

// The closing band: aubergine, as on Julia's screenshot of 17 Nov: the two large lines of the
// heading (each on a line of its own), the smaller line under them, the gold italic line, then
// the call button and, next to it, the outline deposit button with its note. Tiles only at the
// sides, outside the text, and over the upper border onto the block above; the drawings sit in
// a hidden sprite.
function closing(ctx) {
  const c = ctx.content.closing;
  const d = ctx.content.deposit;
  return `<section class="closing" aria-labelledby="closing-title">
  ${bandSprite()}
  ${bandSvgs()}
  <div class="container closing__inner">
    <h2 id="closing-title" class="closing__title">${esc(c.heading)}<br>${esc(c.heading_more)}${draftTag(ctx, 'closing.heading')}</h2>
    <p class="closing__text">${esc(c.text)}</p>
    <p class="closing__line">${esc(c.line)}</p>
    <div class="closing__actions">
      <div class="closing__cta">${registerButton(ctx, 'closing')}</div>
      <div class="closing__deposit">
        ${depositButton(ctx, 'closing')}
        <p class="deposit__note">${esc(d.note)}</p>
      </div>
    </div>
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
  for (const q of content.quotes || []) {
    if (!QUOTE_BLOCKS.includes(q.at)) throw new Error(`quotes: "${q.at}" (${q.name}) is not a block that takes a quote: ${QUOTE_BLOCKS.join(', ')}`);
  }
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
${bridge(ctx)}
${promise(ctx)}
${process(ctx)}
${pack(ctx)}
${pricing(ctx)}
${proof(ctx)}
${approach(ctx)}
${group(ctx)}
${logistics(ctx)}
${faq(ctx)}
${closing(ctx)}
</main>
${footer(ctx)}
</body>
</html>
`;
}
