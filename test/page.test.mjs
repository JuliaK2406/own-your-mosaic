import test from 'node:test';
import assert from 'node:assert/strict';
import { loadContent, loadRaw, findDrafts, walkStrings } from '../src/check.mjs';
import { renderPage, registerUrl, rich, esc, DIAGRAM_ALPHAS, SIGN_ALPHAS, UTM, BUTTON_PLACES, HERO_TILES } from '../src/render/page.mjs';
import { COLOURS, BAND_VARIANTS } from '../src/render/mosaic.mjs';
import { ICONS } from '../src/render/icons.mjs';

const content = await loadContent();
const raw = await loadRaw();
const drafts = new Set(findDrafts(raw, content).drafts.map((draft) => draft.path));
// A manifest like the one src/images.mjs returns (with its crop), without running sharp.
const manifest = {
  [content.hero.photo]: { slug: 'hero', widths: [640, 1024, 1600], width: 3293, height: 4116 },
  [content.proof.photo]: { slug: 'portrait', widths: [640, 1024, 1600], width: 3859, height: 4824 },
  [content.proof.mentoring_photo]: { slug: 'mentoring', widths: [640, 1024, 1600], width: 4818, height: 2330 },
  [content.proof.group_photo]: { slug: 'group', widths: [640, 1024, 1600, 2400], width: 5720, height: 2383 },
};
const render = (c = content, options = {}) => renderPage(c, { manifest, drafts, ...options });
const html = render();
const withMeta = (patch) => ({ ...content, meta: { ...content.meta, ...patch } });
const count = (text, pattern) => (text.match(pattern) || []).length;
const section = (name) => html.match(new RegExp(`<section class="[^"]*\\b${name}\\b[^"]*"[^]*?</section>`))[0];

// Every text of the yaml except meta, links, the button address and the photo file names.
const SKIP = /^(meta\.|links\.|register\.url$|hero\.photo$|proof\.(photo|mentoring_photo|group_photo)$)/;

test('every text from the yaml is on the page word for word (the new blocks included)', () => {
  const missing = [];
  let checked = 0;
  walkStrings(content, '', (at, text) => {
    if (SKIP.test(at) || text.trim() === '') return;
    checked += 1;
    const expected = text.includes('**') ? rich(text) : esc(text);
    if (!html.includes(expected)) missing.push(at);
  });
  assert.deepEqual(missing, []);
  assert.ok(checked > 110, `${checked} texts checked`);
  assert.ok(!html.includes('**'));
  assert.ok(!/programme/.test(html), 'American spelling everywhere, as Julia asked');
});

test('headings: one h1 first, a h2 per block (nine), h3 inside the cards, no level skipped', () => {
  const levels = [...html.matchAll(/<h([123])\b/g)].map((match) => Number(match[1]));
  assert.equal(levels[0], 1);
  assert.equal(levels.filter((level) => level === 1).length, 1);
  assert.equal(levels.filter((level) => level === 2).length, 9, 'who, shift, promise, process, package, pricing, proof, quotes, logistics');
  assert.equal(levels.filter((level) => level === 3).length, 4 + 3 + 3 + 4, 'who titles, levels, tiers, timeline steps');
  levels.reduce((previous, level) => {
    assert.ok(level <= previous + 1, `h${level} right after h${previous}`);
    return level;
  }, 0);
  assert.ok(html.includes(`<h1 id="hero-title" class="hero__title">${esc(content.hero.title)}</h1>`));
  const order = ['hero', 'who', 'shift', 'problem', 'promise', 'process', 'package', 'pricing', 'proof', 'bring', 'quotes', 'logistics', 'closing'].map((name) => html.indexOf(`<section class="${name === 'hero' ? 'hero' : name === 'problem' ? 'problem' : name === 'closing' ? 'closing' : `section`}`));
  assert.ok(html.indexOf('class="hero"') < html.indexOf('class="section section--deep who"') && html.indexOf('who"') < html.indexOf('class="section shift"') && html.indexOf('shift"') < html.indexOf('class="problem band band--navy"') && html.indexOf('band--navy"') < html.indexOf('class="section promise"'), 'the shift follows Is this you?, the problem band follows the shift');
  assert.ok(html.indexOf('class="section proof band band--navy"') < html.indexOf('class="section bring"') && html.indexOf('class="section bring"') < html.indexOf('class="section quotes"') && html.indexOf('class="section quotes"') < html.indexOf('class="section section--deep logistics"'));
  assert.ok(order.length === 13);
});

test('four buttons: the label from the yaml, the Calendly address with the four tags and its own utm_content, a new tab; no TODO tag anywhere', () => {
  const r = content.register;
  const buttons = html.match(/<a class="btn[^"]*" href="[^"]+" target="_blank" rel="noopener">[^<]+<\/a>/g) || [];
  assert.equal(buttons.length, 4);
  assert.equal(count(html, /<a class="btn/g), 4);
  buttons.forEach((button, i) => {
    const place = BUTTON_PLACES[i];
    const expected = registerUrl(r.url, place);
    assert.ok(button.includes(`href="${esc(expected)}"`), `${place}: ${button}`);
    assert.ok(button.endsWith(`>${esc(r.label)}</a>`), `${place} carries the label`);
    const params = new URL(expected).searchParams;
    assert.equal(params.get('utm_source'), 'own-your-mosaic');
    assert.equal(params.get('utm_medium'), 'page');
    assert.equal(params.get('utm_campaign'), 'pilot-2027');
    assert.equal(params.get('utm_content'), place);
  });
  assert.deepEqual(BUTTON_PLACES, ['topbar', 'hero', 'pricing', 'closing']);
  assert.deepEqual(Object.keys(UTM), ['utm_source', 'utm_medium', 'utm_campaign']);
  assert.ok(html.indexOf('class="closing__text"') < html.indexOf('class="closing__cta"'), 'the closing button stands under the closing text');
  assert.equal(count(html, /tag--todo/g), 0, 'nothing on the page is a TODO');
  const published = render(withMeta({ published: true }));
  assert.ok(!published.includes('tag--todo') && !published.includes('tag--draft'));
});

test('registerUrl keeps the parameters an address already carries and adds the tags through searchParams', () => {
  const url = new URL(registerUrl('https://calendly.com/juliakrylova/30min?month=2027-01&hide_gdpr_banner=1', 'hero'));
  assert.equal(url.origin + url.pathname, 'https://calendly.com/juliakrylova/30min');
  assert.equal(url.searchParams.get('month'), '2027-01');
  assert.equal(url.searchParams.get('utm_content'), 'hero');
  assert.equal([...url.searchParams.keys()].length, 6);
});

test('draft tags: one per group, nine in all; none at the name, Meet your mentor, Practical details or the spots (approved)', () => {
  assert.equal(count(html, /tag--draft/g), 9);
  assert.ok(html.includes(`${esc(content.who.heading)} <span class="tag tag--draft">draft</span></h2>`), 'who: at the block heading');
  assert.ok(html.includes(`${esc(content.shift.heading)} <span class="tag tag--draft">draft</span></h2>`));
  assert.ok(html.includes(`${esc(content.promise.diagram.inputs_label)} <span class="tag tag--draft">draft</span></p>`));
  assert.ok(html.includes(`<p class="pricing__total caps">${esc(content.pricing.total_spots)}</p>`), 'the total spots line without a tag');
  assert.ok(html.includes(`${esc(content.proof.quotes_heading)} <span class="tag tag--draft">draft</span></h2>`));
  assert.ok(html.includes(`${esc(content.logistics.heading)} <span class="tag tag--draft">draft</span></h2>`), 'logistics: the cards tag at the heading');
  assert.equal(count(html, /<p class="draft-line"><span class="tag tag--draft">draft<\/span><\/p>/g), 4, 'package stats, proof stats, the shift picture, the timeline');
  assert.ok(!html.includes(`${esc(content.hero.name)} <span class="tag`), 'the name is approved');
  assert.ok(html.includes(`<h2 id="proof-title">${esc(content.proof.heading)}</h2>`), 'Meet your mentor is approved');
  const none = renderPage(content, { manifest, drafts: new Set() });
  assert.ok(!none.includes('tag--draft') && !none.includes('draft-line'));
});

test('head: lang, title, description, og tags; noindex while unpublished; canonical, og:url and og:image only with site_url', () => {
  assert.ok(html.startsWith('<!doctype html>\n<html lang="en">'));
  assert.ok(html.includes(`<title>${esc(content.meta.title)}</title>`));
  assert.ok(html.includes(`<meta name="description" content="${esc(content.meta.description)}">`));
  assert.ok(html.includes('<meta name="robots" content="noindex, nofollow">'));
  for (const tag of ['rel="canonical"', 'og:url', 'og:image', 'twitter:card']) assert.ok(!html.includes(tag), `${tag} needs an absolute address`);
  const site = 'https://program.juliakrylova.com';
  const live = render(withMeta({ published: true, site_url: `${site}/` }));
  assert.ok(!live.includes('name="robots"'));
  assert.ok(live.includes(`<link rel="canonical" href="${site}/">`));
  assert.ok(live.includes(`<meta property="og:image" content="${site}/og-image.png">`));
  assert.ok(live.includes(`<meta property="og:image:alt" content="${esc(content.hero.title)}: ${esc(content.hero.subtitle)}">`));
  assert.ok(live.includes('<meta name="twitter:card" content="summary_large_image">'));
});

test('no Google fonts, no script at all, no absolute paths: everything comes from the site itself', () => {
  assert.ok(!/fonts\.googleapis\.com|fonts\.gstatic\.com/.test(html));
  assert.ok(!/<script/.test(html), 'not one script on the page');
  assert.ok(!/(href|src|srcset)="\/[^/]/.test(html), 'no root-absolute paths');
  assert.ok(!/(href|src)="https?:\/\/(?!www\.juliakrylova\.com|calendly\.com\/juliakrylova\/30min)/.test(html), 'the only outside links are the main site and the Calendly booking');
  assert.ok(html.includes('href="styles.css"') && html.includes('href="favicon.svg"'));
});

test('four photos: every <img> has alt, width and height; the first-screen photo loads first, the three others lazily, with their alts word for word', () => {
  const imgs = html.match(/<img\b[^>]*>/g) || [];
  assert.equal(imgs.length, 4);
  for (const img of imgs) {
    for (const attr of ['alt', 'width', 'height']) assert.ok(new RegExp(` ${attr}="[^"]*"`).test(img), `${attr} in ${img}`);
  }
  assert.ok(imgs[0].includes('fetchpriority="high"') && !imgs[0].includes('loading="lazy"'));
  for (const img of imgs.slice(1)) assert.ok(img.includes('loading="lazy"') && img.includes('decoding="async"'));
  assert.ok(imgs[0].includes(`alt="${esc(content.hero.photo_alt)}"`) && imgs[1].includes(`alt="${esc(content.proof.photo_alt)}"`));
  assert.ok(imgs[2].includes(`alt="${esc(content.proof.mentoring_photo_alt)}"`) && imgs[2].includes('width="1600" height="774"'), 'the on-stage photo, 4818 x 2330 crop');
  assert.ok(imgs[3].includes(`alt="${esc(content.proof.group_photo_alt)}"`) && imgs[3].includes('width="2400" height="1000"'), 'the group band, 5720 x 2383 crop at 2400');
  assert.ok(imgs[3].includes('sizes="100vw"') && html.includes('img/group-2400.webp 2400w'));
});

test('the session photo closes What I bring under both columns; the group band stands between the quotes and Practical details without a heading or caption', () => {
  const bring = section('bring');
  assert.ok(bring.indexOf('class="shift-visual"') < bring.indexOf('<div class="container bring__photo">'), 'the photo comes after the picture of the paragraph');
  assert.ok(bring.includes(`alt="${esc(content.proof.mentoring_photo_alt)}"`));
  const band = html.match(/<div class="group-photo">[^]*?<\/div>/)[0];
  assert.ok(html.indexOf('class="section quotes"') < html.indexOf('<div class="group-photo">') && html.indexOf('<div class="group-photo">') < html.indexOf('class="section section--deep logistics"'));
  assert.ok(!/<h[1-6]|<figcaption|<p\b/.test(band), 'no words beside the photo');
  assert.equal(band.replace(/<[^>]+>/g, '').trim(), '', 'the band carries no text');
});

test('first screen: tagline under the subtitle, the facts card with three cells, the tile group in the corner in detached mode and none in none mode', () => {
  const hero = section('hero');
  assert.ok(hero.indexOf('hero__subtitle') < hero.indexOf('hero__tagline') && hero.indexOf('hero__tagline') < hero.indexOf('hero__photo'));
  assert.ok(hero.includes(`<p class="hero__tagline lead">${esc(content.hero.tagline)}</p>`));
  const facts = hero.match(/<ul class="facts">[^]*?<\/ul>/)[0];
  assert.equal(count(facts, /<li>/g), 3);
  for (const fact of content.hero.facts) assert.ok(facts.includes(`<li>${esc(fact)}</li>`));
  assert.equal(HERO_TILES, 'detached');
  assert.equal(count(hero, /<span class="hero__tiles/g), 2, 'a wide and a phone group');
  assert.ok(hero.includes('hero__tiles--wide') && hero.includes('hero__tiles--phone'));
  assert.ok(hero.indexOf('hero__tiles') < hero.indexOf('hero__grid'), 'the group stands outside the grid, at the block corner');
  const none = render(content, { heroTiles: 'none' });
  assert.ok(!none.includes('hero__tiles') && !section.call(null, 'hero').includes('mosaic--field'));
  assert.equal(count(none, /<svg class="mosaic /g), 10, 'only the band drawings remain');
});

test('Is this you?: four cards with an icon in a champagne circle, the title in italic Lora and the text; no tiles in the cards', () => {
  const who = section('who');
  const cards = who.match(/<li class="card who__card">[^]*?<\/li>/g) || [];
  assert.equal(cards.length, 4);
  cards.forEach((card, i) => {
    assert.ok(card.includes('<span class="circle circle--champagne" aria-hidden="true"><svg class="icon"'), `card ${i} icon`);
    assert.ok(card.includes(`<h3 class="who__title">${esc(content.who.items[i].title)}</h3>`));
    assert.ok(card.includes(`<p>${esc(content.who.items[i].text)}</p>`));
  });
  assert.ok(!who.includes('class="tile"'));
});

test('the shift: four rows with the From and to labels, a gold arrow between and a full stop at the end', () => {
  const shift = section('shift');
  const rows = shift.match(/<li class="shift__row">[^]*?<\/li>/g) || [];
  assert.equal(rows.length, 4);
  rows.forEach((row, i) => {
    const item = content.shift.items[i];
    assert.ok(row.includes(`<span class="shift__label caps">${esc(content.shift.from_label)}</span> <span class="shift__text">${esc(item.from)}</span>`));
    assert.ok(row.includes(`<span class="shift__label caps">${esc(content.shift.to_label)}</span> <span class="shift__text">${esc(item.to)}.</span>`));
    assert.ok(row.includes('<span class="shift__arrow"><svg class="arrow"'));
  });
});

test('Problem: a navy band with the rule, the statement and the second sentence', () => {
  const problem = html.match(/<section class="problem band band--navy">[^]*?<\/section>/)[0];
  assert.ok(problem.includes('<span class="rule" aria-hidden="true"></span>'));
  assert.ok(problem.includes(`<p class="problem__text">${esc(content.problem.statement)}</p>`));
  assert.ok(problem.includes(`<p class="problem__more">${esc(content.problem.statement_more)}</p>`));
});

test('Promise: the heading straight to the paragraph as a lead, the diagram with four inputs, the result behind the sign and four numbered outcomes', () => {
  const promise = section('promise');
  const d = content.promise.diagram;
  assert.ok(!promise.includes('promise__intro'), 'no intro line since 26 October');
  assert.ok(promise.includes(`<h2 id="promise-title">${esc(content.promise.heading)}</h2>\n      <p class="lead">${esc(content.promise.paragraphs[0])}</p>`));
  const items = promise.match(/<li class="diagram__input">[^]*?<\/li>/g) || [];
  assert.equal(items.length, 4);
  items.forEach((item, i) => {
    assert.ok(item.includes(`style="--alpha: ${DIAGRAM_ALPHAS[i]}"`) && item.includes(`<span class="diagram__word">${esc(d.inputs[i])}</span>`));
  });
  assert.ok(promise.includes('<div class="diagram__join" aria-hidden="true"><span class="diagram__stem"></span><span class="diagram__dot"></span></div>'));
  assert.ok(promise.includes(`<span class="diagram__title">${esc(d.result)}</span></p>`));
  assert.equal(count(promise.match(/<p class="diagram__result">[^]*?<\/p>/)[0], /<span style="--alpha: /g), SIGN_ALPHAS.length);
  assert.ok(promise.includes(`<p class="diagram__label diagram__label--outcomes">${esc(content.promise.outcomes_intro)}</p>`));
  const outcomes = promise.match(/<ol class="diagram__outcomes">[^]*?<\/ol>/)[0];
  content.promise.outcomes.forEach((text, i) => assert.ok(outcomes.includes(`<li><span class="diagram__number" aria-hidden="true">${i + 1}</span><span>${esc(text)}</span></li>`)));
});

test('the Method: weeks above the start, every level and the finish; coloured level cards; no mini mosaics', () => {
  const process = section('process');
  const p = content.process;
  assert.ok(process.includes(`<span class="path__weeks caps">${esc(p.start_weeks)}</span><span class="path__end-label caps">${esc(p.start_label)}</span>`));
  assert.ok(process.includes(`<span class="path__weeks caps">${esc(p.finish_weeks)}</span><span class="path__end-label caps">${esc(p.finish_label)}</span>`));
  p.levels.forEach((level, i) => {
    assert.ok(process.includes(`<span class="path__marker">${i + 1}</span>\n          <span class="path__weeks caps">${esc(level.weeks)}</span>\n          <div class="level level--${i + 1}">`), `level ${i + 1}`);
    assert.ok(process.includes(`<h3 class="level__name">${esc(level.name)}</h3>`));
  });
  assert.ok(!process.includes('class="mini"'));
});

test('What\'s included: the stats band with four cells and eight points with icons in aubergine circles', () => {
  const pack = section('package');
  const stats = pack.match(/<ul class="stats">[^]*?<\/ul>/)[0];
  assert.equal(count(stats, /<li>/g), 4);
  content.package.stats.forEach((stat) => assert.ok(stats.includes(`<li><span class="stats__value">${esc(stat.value)}</span><span class="stats__label">${esc(stat.label)}</span></li>`)));
  const list = pack.match(/<ul class="package__list">[^]*?<\/ul>/)[0];
  assert.equal(count(list, /<span class="circle circle--aubergine" aria-hidden="true"><svg class="icon"/g), 8);
  content.package.items.forEach((text) => assert.ok(list.includes(`<span>${esc(text)}</span></li>`)));
});

test('Pricing: the total above the cards, three coloured cards with the spots only where a tier has them', () => {
  const pricing = section('pricing');
  assert.ok(pricing.includes(`<p class="pricing__total caps">${esc(content.pricing.total_spots)}`));
  assert.ok(pricing.indexOf('pricing__total') < pricing.indexOf('<ul class="tiers">'));
  const tiers = pricing.match(/<li class="tier tier--\w+">[^]*?<\/li>/g) || [];
  assert.equal(tiers.length, 3);
  assert.ok(tiers[0].includes('tier--core') && tiers[1].includes('tier--plus') && tiers[2].includes('tier--premium'));
  assert.ok(!tiers[0].includes('tier__spots'), 'Core has no spots line');
  assert.ok(tiers[1].includes(`<p class="tier__spots">${esc(content.pricing.tiers[1].spots)}</p>`));
  assert.ok(tiers[2].includes(`<p class="tier__spots">${esc(content.pricing.tiers[2].spots)}</p>`));
  tiers.forEach((tier, i) => assert.ok(tier.indexOf('tier__price') < tier.indexOf('tier__text') && tier.includes(`<span class="tier__amount">${esc(content.pricing.tiers[i].price)}</span>`)));
});

test('Meet your mentor: a navy band, the two figures above the paragraphs, the sticky portrait without tiles', () => {
  const proof = html.match(/<section class="section proof band band--navy"[^]*?<\/section>/)[0];
  const stats = proof.match(/<ul class="proof__stats">[^]*?<\/ul>/)[0];
  content.proof.stats.forEach((stat) => assert.ok(stats.includes(`<li><span class="proof__value">${esc(stat.value)}</span><span class="proof__label">${esc(stat.label)}</span></li>`)));
  assert.ok(proof.indexOf('proof__stats') < proof.indexOf(`<p>${esc(content.proof.paragraphs[0])}</p>`));
  assert.ok(proof.includes('<div class="proof__photos">') && !proof.includes('mosaic'));
  assert.ok(proof.indexOf('id="proof-title"') < proof.indexOf('proof__grid'));
});

test('What I bring: the aubergine panel with five strengths and icons, the mentoring paragraph, the hidden picture with three struck pills, an arrow and the navy plaque', () => {
  const bring = section('bring');
  const p = content.proof;
  assert.ok(bring.includes(`<p class="bring__intro">${esc(p.strengths_intro)}</p>`));
  const list = bring.match(/<ul class="bring__list">[^]*?<\/ul>/)[0];
  assert.equal(count(list, /<span class="circle circle--outline" aria-hidden="true"><svg class="icon"/g), 5);
  p.strengths.forEach((text) => assert.ok(list.includes(`<span>${esc(text)}</span></li>`)));
  assert.ok(bring.includes(`<p>${esc(p.mentoring)}</p>`));
  const visual = bring.match(/<div class="shift-visual" aria-hidden="true">[^]*?<p class="shift-visual__to">[^<]*<\/p>\s*<\/div>/)[0];
  p.shift_visual.from.forEach((text) => assert.ok(visual.includes(`<span class="struck"><s>${esc(text)}</s></span>`)));
  assert.ok(visual.includes('<span class="shift-visual__arrow"><svg class="arrow"'));
  assert.ok(visual.includes(`<p class="shift-visual__to">${esc(p.shift_visual.to)}</p>`));
  assert.ok(bring.indexOf('<p class="draft-line">') < bring.indexOf('<div class="shift-visual"'), 'the draft tag stands outside the hidden picture');
});

test('In their own words: its own block with the two placeholder quotes', () => {
  const quotes = section('quotes');
  for (const q of content.proof.quotes) {
    assert.ok(quotes.includes(`<blockquote class="quote__text"><p>${esc(q.quote)}</p></blockquote>`));
    assert.ok(quotes.includes(`<strong class="quote__name">${esc(q.name)}</strong><span class="quote__role">${esc(q.role)}, ${esc(q.company)}</span>`));
  }
  assert.equal(count(quotes, /<span class="quote__mark" aria-hidden="true">&ldquo;<\/span>/g), content.proof.quotes.length);
});

test('Practical details: three coloured cards with icons and the timeline of four steps', () => {
  const logistics = section('logistics');
  const cards = logistics.match(/<li class="detail detail--\w+">[^]*?<\/li>/g) || [];
  assert.equal(cards.length, 3);
  assert.ok(cards[0].includes('detail--champagne') && cards[1].includes('detail--navy') && cards[2].includes('detail--aubergine'));
  cards.forEach((card, i) => {
    assert.ok(card.includes('<svg class="icon"'));
    assert.ok(card.includes(`<span class="detail__value">${esc(content.logistics.cards[i].value)}</span>`) && card.includes(`<span class="detail__label">${esc(content.logistics.cards[i].label)}</span>`));
  });
  const steps = logistics.match(/<li class="step">[^]*?<\/li>/g) || [];
  assert.equal(steps.length, 4);
  steps.forEach((step, i) => {
    const s = content.logistics.timeline[i];
    assert.ok(step.includes(`<span class="step__when caps">${esc(s.when)}</span>`) && step.includes('<span class="step__dot" aria-hidden="true"></span>'));
    assert.ok(step.includes(`<h3 class="step__title">${esc(s.title)}</h3>`) && step.includes(`<p class="step__text">${esc(s.text)}</p>`));
  });
});

test('the closing band: the text and the button, nothing else', () => {
  const closing = html.match(/<section class="closing">[^]*?<\/section>/)[0];
  assert.ok(closing.includes(`<p class="closing__text">${esc(content.closing.text)}</p>`));
  assert.equal(count(closing, /<a class="btn/g), 1);
});

test('icons: twenty places, every icon an inline svg with one stroke, aria-hidden, without text; the footer and the legal line', () => {
  assert.equal(Object.keys(ICONS).length, 20);
  const icons = html.match(/<svg class="icon"[^]*?<\/svg>/g) || [];
  assert.equal(icons.length, 20);
  for (const svg of icons) {
    assert.ok(svg.includes('stroke="currentColor" stroke-width="1.5"') && svg.includes('aria-hidden="true"') && svg.includes('focusable="false"'));
    assert.ok(!/<(text|image|script)\b/.test(svg));
  }
  assert.equal(count(html, /<svg class="arrow"/g), 5, 'four shift rows and the picture in What I bring');
  assert.ok(html.includes(`<p>${esc(content.footer.legal_line)}</p>`));
  assert.ok(html.includes(`<a href="${content.links.main_site}">${esc(content.footer.main_site_label)}</a>`));
});

// Parses every drawing of the page: the symbols of the sprite and the standalone svgs that
// carry tiles (the placed band svgs only show a symbol through <use> and carry none).
function drawings(page) {
  const found = [];
  const add = (id, width, height, body) => {
    const rects = [...body.matchAll(/<rect x="(-?\d+)" y="(-?\d+)" width="(\d+)" height="(\d+)"/g)].map((r) => r.slice(1, 5).map(Number));
    if (rects.length) found.push({ id, width, height, rects });
  };
  for (const m of page.matchAll(/<symbol id="([^"]+)" viewBox="0 0 (\d+) (\d+)">([^]*?)<\/symbol>/g)) add(m[1], Number(m[2]), Number(m[3]), m[4]);
  for (const m of page.matchAll(/<svg class="(mosaic [^"]+)" viewBox="0 0 (\d+) (\d+)"[^>]*>([^]*?)<\/svg>/g)) add(m[1], Number(m[2]), Number(m[3]), m[4]);
  return found;
}

test('mosaics: the two hero groups and the five band drawings; every tile whole inside its viewBox; brand colours only; within 30 KB; the same every build', () => {
  const svgs = html.match(/<svg class="mosaic[^]*?<\/svg>/g) || [];
  const bands = Object.keys(BAND_VARIANTS);
  assert.equal(svgs.length, 1 + 2 + bands.length * 2, 'the sprite, two hero groups, and a left and right svg per band width');
  const bytes = svgs.reduce((n, svg) => n + Buffer.byteLength(svg), 0);
  assert.ok(bytes <= 30 * 1024, `${bytes} bytes of mosaics`);
  const allowed = new Set(Object.values(COLOURS));
  for (const svg of svgs) {
    assert.ok(svg.includes('aria-hidden="true"'));
    for (const [, fill] of svg.matchAll(/fill="(#[0-9A-Fa-f]{6})"/g)) assert.ok(allowed.has(fill), `${fill} is not a brand colour`);
    assert.ok(!/<(image|script|text|foreignObject)\b/.test(svg));
    assert.ok(!svg.includes('slice'), 'nothing is cropped by scaling');
  }
  const parts = drawings(html);
  assert.equal(parts.length, 2 + bands.length);
  for (const part of parts) {
    for (const [x, y, w, h] of part.rects) {
      assert.ok(x >= 0 && y >= 0 && x + w <= part.width && y + h <= part.height, `${part.id}: tile ${x},${y} ${w}x${h} is outside ${part.width}x${part.height}`);
    }
  }
  assert.equal(count(html, new RegExp(`fill="${COLOURS.gold}"`, 'g')), 0, 'gold is never a tile');
  assert.equal(render(), html, 'the same markup every time');
  for (const block of ['who', 'shift', 'problem', 'promise', 'package', 'process', 'pricing', 'proof', 'bring', 'quotes', 'logistics']) {
    assert.ok(!section(block).includes('<svg class="mosaic'), `${block} has no mosaic`);
  }
});

test('the deeper background on every second light block, the navy bands, lead paragraphs where the task puts them', () => {
  const deep = [...html.matchAll(/<section class="section section--deep (\w+)"/g)].map((m) => m[1]);
  assert.deepEqual(deep, ['who', 'process', 'pricing', 'logistics']);
  assert.equal(count(html, /band--navy/g), 2, 'Problem and Meet your mentor');
  assert.equal(count(html, /class="lead"/g), content.hero.paragraphs.length + content.promise.paragraphs.length + 1, 'first-screen paragraphs, the Promise paragraph, process.intro');
});

test('rich: only **bold** is markup, everything else is escaped; the renderer refuses a photo without built versions', () => {
  assert.equal(rich('a **b** & <c>'), 'a <strong>b</strong> &amp; &lt;c&gt;');
  assert.equal(esc('a<b>&"c\''), 'a&lt;b&gt;&amp;&quot;c&#39;');
  assert.throws(() => renderPage(content, { manifest: {}, drafts }), /no photo versions/);
});
