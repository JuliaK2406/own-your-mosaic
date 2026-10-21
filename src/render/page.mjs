// The HTML of the page, built from content/offer.yaml with plain template strings: no framework,
// no script on the page. Every text goes through esc() (HTML escaping) or rich() (escaping plus
// **bold**). No word on the page is written here: the texts come from the yaml, the photo
// descriptions from its photo_alt fields. The only additions are the TODO and draft tags,
// shown while meta.published is false, and the decorative mosaics (src/render/mosaic.mjs).

import { heroField, mentorField, cornerGroup, bandSprite, bandSvgs } from './mosaic.mjs';
import { TIER_UNSURE } from '../app/register-core.js';

export const OG_IMAGE_FILE = 'og-image.png';
export const REGISTER_SCRIPT = 'register.js';
// The text of the TODO tag beside the thank-you while the form is not connected (dev only).
export const NOT_CONNECTED = 'form not connected, nothing was sent';
export const OG_WIDTH = 1200;
export const OG_HEIGHT = 627;

// Opacity of the aubergine tiles: one per card of "Is this you?", and the 2 x 2 mini mosaic of
// each level (lighter for the first level, deeper for the third), in the manner of Snapshot.
export const WHO_ALPHAS = [0.35, 0.55, 0.75, 1];
export const LEVEL_ALPHAS = [[0.2, 0.35, 0.3, 0.45], [0.45, 0.6, 0.55, 0.7], [0.7, 0.85, 0.8, 1]];
// The four small tiles of the Promise diagram, from light to deep, and the 3 x 3 brand sign
// (the same shades as the favicon and the Snapshot icon) before its result line.
export const DIAGRAM_ALPHAS = [0.3, 0.5, 0.75, 1];
export const SIGN_ALPHAS = [1, 0.45, 0.8, 0.3, 0.9, 0.55, 0.7, 0.2, 1];

export const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
// **word** becomes <strong>word</strong>; this is the only markup allowed inside a text.
export const rich = (s) => esc(s).replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>');
export const isTodo = (v) => typeof v === 'string' && /\bTODO\b/.test(v);

const SEP = '<span class="sep" aria-hidden="true">·</span>';
const paragraphs = (list, render = esc, className = '') => list.map((text) => `<p${className ? ` class="${className}"` : ''}>${render(text)}</p>`).join('\n');
const tiles = (alphas, className) => `<span class="${className}" aria-hidden="true">${alphas.map((alpha) => `<span style="--alpha: ${alpha}"></span>`).join('')}</span>`;
const todoTag = (ctx) => (ctx.published ? '' : ' <span class="tag tag--todo">TODO</span>');
const draftTag = (ctx, at) => (!ctx.published && ctx.drafts.has(at) ? ' <span class="tag tag--draft">draft</span>' : '');

// The "Register your interest" button. Every button on the page comes from here. In mode form
// it leads to the form at the end of the page (#register); in mode link it opens link_url
// (a Calendly address, for example) in a new tab.
export function registerButton(ctx, { className = '' } = {}) {
  const r = ctx.content.register;
  const classes = ['btn', className].filter(Boolean).join(' ');
  if (r.mode === 'link') return `<a class="${classes}" href="${esc(r.link_url)}" target="_blank" rel="noopener">${esc(r.label)}</a>`;
  return `<a class="${classes}" href="#register">${esc(r.label)}</a>`;
}

// The registration form in the closing band (mode form). Texts from register.form; the tier
// options from pricing.tiers plus the "not sure" option. method="post" only as a guard: the
// script always handles the submit itself; should it ever be missing, the browser would not
// put the fields into the page address as a query string. The script reads its texts and the
// endpoint from the data attributes of the form. While privacy_url is TODO its link leads to
// "#" with a TODO tag; while endpoint_url is empty a TODO tag stands beside the button.
export function registerForm(ctx) {
  const r = ctx.content.register;
  const f = r.form;
  const tiers = [...ctx.content.pricing.tiers.map((tier) => ({ value: tier.name, label: tier.name })), { value: TIER_UNSURE, label: f.tier_unsure_label }];
  const pills = tiers.map((tier) => `            <label class="pill"><input type="radio" name="tier" value="${esc(tier.value)}" aria-describedby="reg-tier-error"><span>${esc(tier.label)}</span></label>`).join('\n');
  const privacy = isTodo(r.privacy_url)
    ? `<a href="#">${esc(f.privacy_label)}</a>${todoTag(ctx)}`
    : `<a href="${esc(r.privacy_url)}" target="_blank" rel="noopener">${esc(f.privacy_label)}</a>`;
  const notConnected = String(r.endpoint_url || '').trim() === '';
  const data = {
    endpoint: String(r.endpoint_url || '').trim(),
    'error-required': f.error_required,
    'error-email': f.error_email,
    'error-tier': f.error_tier,
    'error-send': f.error_send,
    sending: f.sending_label,
    'success-heading': f.success_heading,
    'not-connected': NOT_CONNECTED,
  };
  const attrs = Object.entries(data).map(([key, value]) => ` data-${key}="${esc(value)}"`).join('');
  const field = (key, label, control) => `        <div class="field">
          <label for="reg-${key}">${esc(label)}</label>
          ${control}
          <p class="field__error" id="reg-${key}-error" data-error-for="${key.replace(/-/g, '_')}" aria-live="polite"></p>
        </div>`;
  return `<div class="register" id="register">
  <div class="register__card">
    <h2 class="register__heading" id="register-heading">${esc(f.heading)}${draftTag(ctx, 'register.form')}</h2>
    <p class="register__intro">${esc(f.intro)}</p>
    <noscript><p class="register__noscript">${esc(f.noscript_note)}</p></noscript>
    <form class="register__form" id="register-form" method="post" novalidate aria-labelledby="register-heading"${attrs}>
      <div class="register__names">
${field('first-name', f.first_name_label, '<input id="reg-first-name" name="first_name" type="text" autocomplete="given-name" maxlength="60" aria-describedby="reg-first-name-error">')}
${field('last-name', f.last_name_label, '<input id="reg-last-name" name="last_name" type="text" autocomplete="family-name" maxlength="60" aria-describedby="reg-last-name-error">')}
      </div>
${field('email', f.email_label, '<input id="reg-email" name="email" type="email" autocomplete="email" inputmode="email" maxlength="254" aria-describedby="reg-email-error">')}
      <fieldset class="field field--tier">
        <legend>${esc(f.tier_label)}</legend>
        <div class="pills">
${pills}
        </div>
        <p class="field__error" id="reg-tier-error" data-error-for="tier" aria-live="polite"></p>
      </fieldset>
${field('message', f.message_label, '<textarea id="reg-message" name="message" rows="3" maxlength="1000" aria-describedby="reg-message-error"></textarea>')}
      <div class="field field--check">
        <label class="check"><input type="checkbox" name="newsletter" value="yes"><span>${esc(f.newsletter_label)}</span></label>
      </div>
      <div class="register__trap" aria-hidden="true"><input type="text" name="website" tabindex="-1" autocomplete="off"></div>
      <p class="register__send-error" role="alert" hidden></p>
      <div class="register__actions">
        <button class="btn register__submit" type="submit">${esc(f.submit_label)}</button>${notConnected ? todoTag(ctx) : ''}
      </div>
      <p class="register__note">${esc(f.data_note)} ${privacy}</p>
    </form>
    <div class="register__success" id="register-success" hidden aria-live="polite">
      <p class="register__success-heading" tabindex="-1"></p>
      <p class="register__success-text">${esc(f.success_text)}</p>
    </div>
  </div>
</div>`;
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
  if (ctx.mode === 'form') lines.push('<noscript><style>.register__form { display: none; }</style></noscript>');
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

// The first screen. The photo stands on a field of tiles from 900 px (the field dissolves
// through the opacity of its tiles); on the phone two small groups of tiles touch two
// corners of the photo instead. Each fact stays on one line, the line breaks between facts.
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
    <span class="hero__corner hero__corner--tr" aria-hidden="true">${cornerGroup({ seed: 32, anchor: 'tr' })}</span>
    <span class="hero__corner hero__corner--bl" aria-hidden="true">${cornerGroup({ seed: 33, anchor: 'bl' })}</span>
    <div class="hero__picture">
      ${picture(ctx, h.photo, { alt: h.photo_alt, eager: true, sizes: '(min-width: 1200px) 420px, (min-width: 900px) 36vw, (min-width: 540px) 480px, calc(100vw - 48px)' })}
    </div>
  </div>
  <div class="hero__body">
    ${paragraphs(h.paragraphs, esc, 'lead')}
    <div class="hero__cta">${registerButton(ctx)}</div>
    <p class="hero__facts caps">${h.facts.map((fact) => `<span class="hero__fact">${esc(fact)}</span>`).join(SEP)}</p>
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

// Promise: the text on the left and, from 900 px, a card with the diagram on the right (on
// the phone the card follows the text). Every word of the diagram is in the yaml, taken from
// the two paragraphs: what the roadmap takes into account (four words with small tiles,
// hairlines between them), one gold stem down to a dot, the result in Lora behind the brand
// sign with a short gold rule, then what you will have (three points with gold marks).
// One draft tag for the whole diagram, at its first label.
function promise(ctx) {
  const p = ctx.content.promise;
  const d = p.diagram;
  const inputs = d.inputs.map((text, i) => `        <li class="diagram__input"><span class="diagram__tile" style="--alpha: ${DIAGRAM_ALPHAS[i] ?? 1}" aria-hidden="true"></span><span class="diagram__word">${esc(text)}</span></li>`).join('\n');
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
      <p class="diagram__label caps">${esc(d.outcomes_label)}</p>
      <ul class="diagram__outcomes">
${d.outcomes.map((text) => `        <li>${esc(text)}</li>`).join('\n')}
      </ul>
    </div>
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

// Meet your mentor: the heading, then (from 900 px) a sticky portrait on the left standing on
// a field of tiles, the four paragraphs on the right; on the phone one column in the same
// order: heading, portrait, paragraphs. Then the quotes.
function proof(ctx) {
  const p = ctx.content.proof;
  const quotes = p.quotes.map((q) => `      <figure class="quote">
        <span class="quote__mark" aria-hidden="true">&ldquo;</span>
        <blockquote class="quote__text"><p>${esc(q.quote)}</p></blockquote>
        <figcaption class="quote__by"><strong class="quote__name">${esc(q.name)}</strong><span class="quote__role">${esc(q.role)}, ${esc(q.company)}</span>${draftTag(ctx, 'proof.quotes')}</figcaption>
      </figure>`).join('\n');
  return `<section class="section proof" aria-labelledby="proof-title">
  <div class="container">
    <h2 id="proof-title">${esc(p.heading)}${draftTag(ctx, 'proof.heading')}</h2>
    <div class="proof__grid">
      <div class="proof__photos">
        <span class="proof__field" aria-hidden="true">${mentorField()}</span>
        <div class="proof__picture">
          ${picture(ctx, p.photo, { alt: p.photo_alt, sizes: '(min-width: 1200px) 400px, (min-width: 900px) 34vw, (min-width: 540px) 480px, calc(100vw - 48px)' })}
        </div>
      </div>
      <div class="proof__copy">
        ${paragraphs(p.paragraphs, rich)}
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

// The only aubergine band of the page, across the whole window. Tiles only at the sides,
// outside the text column, fading toward the middle; over the upper border aubergine tiles
// fly up onto Practical details (in the page margins only). The middle, under the text, is
// clean. The drawings sit in a hidden sprite; one of five widths is shown by CSS.
function closing(ctx) {
  const action = ctx.mode === 'form' ? registerForm(ctx) : `<div class="closing__cta">${registerButton(ctx)}</div>`;
  return `<section class="closing">
  ${bandSprite()}
  ${bandSvgs()}
  <div class="container closing__inner">
    <p class="closing__text">${esc(ctx.content.closing.text)}</p>
    ${action}
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
  const ctx = { content, manifest, drafts, themeColor, published: content.meta.published === true, mode: content.register.mode };
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
${ctx.mode === 'form' ? `<script type="module" src="${REGISTER_SCRIPT}"></script>\n` : ''}</body>
</html>
`;
}
