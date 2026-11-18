import test from 'node:test';
import assert from 'node:assert/strict';
import { loadContent, loadRaw, findDrafts, walkStrings } from '../src/check.mjs';
import { renderPage, registerUrl, rich, esc, UTM, BUTTON_PLACES, DEPOSIT_PLACES, QUOTE_BLOCKS, HERO_TILES, OG_WIDTH, OG_HEIGHT } from '../src/render/page.mjs';
import { COLOURS, BAND_VARIANTS, PATH_SIZE } from '../src/render/mosaic.mjs';
import { ICONS } from '../src/render/icons.mjs';

const content = await loadContent();
const raw = await loadRaw();
const drafts = new Set(findDrafts(raw, content).drafts.map((draft) => draft.path));
// A manifest like the one src/images.mjs returns (with its crop), without running sharp.
const manifest = {
  [content.hero.photo]: { slug: 'hero', widths: [640, 1024, 1600], width: 2709, height: 3612 },
  [content.proof.photo]: { slug: 'portrait', widths: [640, 1024, 1600], width: 3859, height: 4824 },
  [content.proof.mentoring_photo]: { slug: 'mentoring', widths: [640, 1024, 1600], width: 6240, height: 3060 },
  [content.proof.group_photo]: { slug: 'group', widths: [640, 1024, 1600, 2400], width: 5720, height: 2383 },
};
const render = (c = content, options = {}) => renderPage(c, { manifest, drafts, ...options });
const html = render();
const withMeta = (patch) => ({ ...content, meta: { ...content.meta, ...patch } });
const count = (text, pattern) => (text.match(pattern) || []).length;
const section = (name) => html.match(new RegExp(`<section class="[^"]*\\b${name}\\b[^"]*"[^]*?</section>`))[0];

// Every text of the yaml except meta, links, the button addresses, the quote places and the photo file names.
const SKIP = /^(meta\.|links\.|register\.url$|deposit\.url$|quotes\[\d+\]\.at$|hero\.photo$|proof\.(photo|mentoring_photo|group_photo)$)/;

test('every text from the yaml is on the page word for word (Julia\'s document and deck of 16 Nov included)', () => {
  const missing = [];
  let checked = 0;
  walkStrings(content, '', (at, text) => {
    if (SKIP.test(at) || text.trim() === '') return;
    checked += 1;
    if (!html.replace(/&nbsp;/g, ' ').includes(rich(text))) missing.push(at);
  });
  assert.deepEqual(missing, []);
  assert.ok(checked > 120, `${checked} texts checked`);
  assert.ok(!html.includes('**') && !/[^<]\*[^>]/.test(html.replace(/<[^>]+>/g, '')), 'no asterisk reaches the page');
  assert.ok(!/programme/.test(html), 'American spelling everywhere, as Julia asked');
  assert.ok(!/\bpilot\b/i.test(html.replace(/utm_campaign=pilot-2027/g, '')), 'January 2027 Founding Cohort everywhere instead of pilot; only the tracking key keeps its first value');
  assert.ok(html.includes('January 2027 Founding Cohort'));
  assert.ok(!/[\u2013\u2014]/.test(html), 'no long dash on the page');
});

test('headings: one h1 first, a h2 per block (eleven), h3 inside the cards and points, no level skipped; the blocks in the order of the page', () => {
  const levels = [...html.matchAll(/<h([123])\b/g)].map((match) => Number(match[1]));
  assert.equal(levels[0], 1);
  assert.equal(levels.filter((level) => level === 1).length, 1);
  assert.equal(levels.filter((level) => level === 2).length, 11, 'who, shift, promise, process, package, pricing, proof, approach, logistics, faq, closing');
  assert.equal(levels.filter((level) => level === 3).length, 4 + 1 + 3 + 6 + 3 + 3 + 4 + 6, 'who titles, the roadmap list, levels, included tiles, tiers, approach cards, timeline steps, questions');
  levels.reduce((previous, level) => {
    assert.ok(level <= previous + 1, `h${level} right after h${previous}`);
    return level;
  }, 0);
  assert.ok(html.includes(`<h1 id="hero-title" class="hero__title">${esc(content.hero.title)}</h1>`));
  const marks = [
    'class="hero"', 'class="section section--deep who"', 'class="section shift"', 'class="section section--deep bridge"', 'class="section promise band band--aubergine"',
    'class="section section--deep process"', 'class="section package"', 'class="section section--deep pricing"', 'class="section proof band band--navy"',
    'class="section approach"', '<div class="group-photo">', 'class="section section--deep logistics"', 'class="section faq"', 'class="closing"',
  ];
  const positions = marks.map((mark) => html.indexOf(mark));
  positions.forEach((at, i) => assert.ok(at >= 0 && (i === 0 || at > positions[i - 1]), `${marks[i]} in its place`));
  assert.ok(!html.includes('class="section quotes"') && !html.includes('class="section bring"') && !html.includes('band--navy"\n  <div class="container problem__inner">'), 'no block of quotes, no "What producing gave me" since 16 Nov, no Problem band since 17 Nov');
});

test('six buttons: four call buttons to Calendly with the label from the yaml, two outline deposit buttons to Stripe; all with the four tags and their own utm_content, all in a new tab; no TODO tag anywhere', () => {
  const r = content.register;
  const d = content.deposit;
  const all = html.match(/<a class="btn[^"]*" href="[^"]+" target="_blank" rel="noopener">[^<]+<\/a>/g) || [];
  assert.equal(all.length, 6);
  assert.equal(count(html, /<a class="btn/g), 6);
  const calls = all.filter((button) => !button.includes('btn--outline'));
  const deposits = all.filter((button) => button.includes('btn--outline'));
  assert.equal(calls.length, 4);
  assert.equal(deposits.length, 2);
  const check = (button, base, place, label) => {
    const expected = registerUrl(base, place);
    assert.ok(button.includes(`href="${esc(expected)}"`), `${place}: ${button}`);
    assert.ok(button.endsWith(`>${esc(label)}</a>`), `${place} carries the label`);
    const params = new URL(expected).searchParams;
    assert.equal(params.get('utm_source'), 'own-your-mosaic');
    assert.equal(params.get('utm_medium'), 'page');
    assert.equal(params.get('utm_campaign'), 'pilot-2027');
    assert.equal(params.get('utm_content'), place);
  };
  calls.forEach((button, i) => check(button, r.url, BUTTON_PLACES[i], r.label));
  deposits.forEach((button, i) => check(button, d.url, DEPOSIT_PLACES[i], d.label));
  assert.equal(r.label, 'Book a program fit call', 'Julia\'s wording of 17 Nov');
  assert.ok(r.url.endsWith('/30min'), 'the link stays the 30-minute meeting');
  assert.ok(d.url.startsWith('https://buy.stripe.com/'), 'the deposit goes to Stripe');
  assert.deepEqual(BUTTON_PLACES, ['topbar', 'hero', 'pricing', 'closing']);
  assert.deepEqual(DEPOSIT_PLACES, ['pricing', 'closing']);
  assert.deepEqual(Object.keys(UTM), ['utm_source', 'utm_medium', 'utm_campaign']);
  assert.ok(html.indexOf('class="closing__line"') < html.indexOf('class="closing__cta"'), 'the closing buttons stand under the closing lines');
  assert.ok(!section('hero').includes('btn--outline') && !html.slice(0, html.indexOf('<main>')).includes('btn--outline'), 'no deposit button on the first screen or in the top bar');
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

test('draft tags: none on the page since 16 November; a marked group would still get its tag at the heading or as a line of its own', () => {
  assert.equal(count(html, /tag--draft/g), 0);
  assert.equal(count(html, /draft-line/g), 0);
  assert.ok(html.includes(`<h2 id="shift-title" class="shift__heading">${esc(content.shift.heading)}</h2>`) && html.includes(`<h2 id="who-title">${esc(content.who.heading)}</h2>`));
  assert.ok(html.includes(`<h2 id="faq-title">${esc(content.faq.heading)}</h2>`) && html.includes(`<h2 id="proof-title">${esc(content.proof.heading)}</h2>`));
  const marked = renderPage(content, { manifest, drafts: new Set(['shift.heading', 'package.items', 'faq.items']) });
  assert.equal(count(marked, /tag--draft/g), 3);
  assert.ok(marked.includes(`${esc(content.shift.heading)} <span class="tag tag--draft">draft</span></h2>`), 'at the block heading');
  assert.ok(marked.includes(`${esc(content.faq.heading)} <span class="tag tag--draft">draft</span></h2>`), 'at the heading of Good to know');
  assert.equal(count(marked, /<p class="draft-line"><span class="tag tag--draft">draft<\/span><\/p>/g), 1, 'the included tiles get a line of their own');
  const published = render(withMeta({ published: true }), { drafts: new Set(['shift.heading']) });
  assert.ok(!published.includes('tag--draft') && !published.includes('draft-line'), 'published: no tags whatever is marked');
});

test('head: lang, title, description, og tags; noindex while unpublished; canonical, og:url and og:image only with site_url', () => {
  assert.ok(html.startsWith('<!doctype html>\n<html lang="en">'));
  assert.ok(html.includes(`<title>${esc(content.meta.title)}</title>`));
  assert.ok(content.meta.title.includes('January 2027 Founding Cohort') && content.meta.description.includes('January 2027 Founding Cohort'));
  assert.ok(html.includes(`<meta name="description" content="${esc(content.meta.description)}">`));
  assert.ok(html.includes('<meta name="robots" content="noindex, nofollow">'));
  for (const tag of ['rel="canonical"', 'og:url', 'og:image', 'twitter:card']) assert.ok(!html.includes(tag), `${tag} needs an absolute address`);
  const site = 'https://program.juliakrylova.com';
  const live = render(withMeta({ published: true, site_url: `${site}/` }));
  assert.ok(!live.includes('name="robots"'));
  assert.ok(live.includes(`<link rel="canonical" href="${site}/">`));
  assert.ok(live.includes(`<meta property="og:image" content="${site}/og-image.png">`));
  assert.ok(live.includes(`<meta property="og:image:width" content="${OG_WIDTH}">`) && OG_WIDTH === 1200 && OG_HEIGHT === 627);
  assert.ok(live.includes(`<meta property="og:image:alt" content="${esc(content.hero.title)}: ${esc(content.hero.lines.join(' '))}">`));
  assert.ok(live.includes('<meta name="twitter:card" content="summary_large_image">'));
});

test('no Google fonts, no script at all, no absolute paths: everything comes from the site itself', () => {
  assert.ok(!/fonts\.googleapis\.com|fonts\.gstatic\.com/.test(html));
  assert.ok(!/<script/.test(html), 'not one script on the page');
  assert.ok(!/(href|src|srcset)="\/[^/]/.test(html), 'no root-absolute paths');
  assert.ok(!/(href|src)="https?:\/\/(?!www\.juliakrylova\.com|calendly\.com\/juliakrylova\/30min|buy\.stripe\.com\/)/.test(html), 'the only outside links are the main site, the Calendly booking and the Stripe deposit');
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
  assert.ok(imgs[0].includes('width="1600" height="2133"'), 'the first-screen photo is 3:4');
  assert.ok(html.includes('<div class="hero__photo" style="--photo-ratio: 2709 / 3612">'), 'the frame of the first screen follows the served file');
  assert.ok(html.includes('<div class="hero__intro">\n      <p class="hero__name">'), 'name and positioning in a row of their own');
  assert.ok(imgs[2].includes(`alt="${esc(content.proof.mentoring_photo_alt)}"`) && imgs[2].includes('width="1600" height="785"'), 'the session photo, 6240 x 3060 crop');
  assert.ok(imgs[3].includes(`alt="${esc(content.proof.group_photo_alt)}"`) && imgs[3].includes('width="2400" height="1000"'), 'the group band, 5720 x 2383 crop at 2400');
  assert.ok(imgs[3].includes('sizes="100vw"') && html.includes('img/group-2400.webp 2400w'));
});

test('the session photo closes the approach cards under them; the group band stands between the cards and Practical details without a heading or caption', () => {
  const approach = section('approach');
  assert.ok(approach.indexOf('</ul>') < approach.indexOf('<div class="container approach__photo">'), 'the photo comes after the cards');
  assert.ok(approach.includes(`alt="${esc(content.proof.mentoring_photo_alt)}"`));
  const band = html.match(/<div class="group-photo">[^]*?<\/div>/)[0];
  assert.ok(html.indexOf('class="section approach"') < html.indexOf('<div class="group-photo">') && html.indexOf('<div class="group-photo">') < html.indexOf('class="section section--deep logistics"'));
  assert.ok(!/<h[1-6]|<figcaption|<p\b/.test(band), 'no words beside the photo');
  assert.equal(band.replace(/<[^>]+>/g, '').trim(), '', 'the band carries no text');
});

test('first screen: the title, the three lines of 17 Nov under it (each on a line of its own), the supporting copy, the button, the facts strip with three cells; the tile group in the corner in detached mode and none in none mode', () => {
  const hero = section('hero');
  const h = content.hero;
  assert.ok(hero.includes(`<h1 id="hero-title" class="hero__title">${esc(h.title)}</h1>\n      <p class="hero__lines">${esc(h.lines[0])}<br>\n        ${esc(h.lines[1])}<br>\n        ${esc(h.lines[2])}</p>`));
  assert.deepEqual(h.lines, ["You've built a career or business and achieved a lot.", "You're ready for bigger.", "What's missing is a clear roadmap of how to get there."]);
  assert.equal(h.positioning, 'Strategic Mentor for High-Achieving Women Leaders');
  assert.ok(hero.indexOf('hero__lines') < hero.indexOf('hero__photo') && hero.indexOf('hero__photo') < hero.indexOf('hero__supporting'));
  assert.ok(hero.includes(`<div class="hero__body">\n      <p class="hero__supporting">${esc(h.supporting)}</p>\n      <div class="hero__cta">`), 'the supporting copy is the only paragraph: the opening was a repeat of the lines');
  assert.ok(!hero.includes('hero__subtitle') && !hero.includes('hero__opening') && !hero.includes('hero__tagline'));
  const facts = hero.match(/<ul class="facts">[^]*?<\/ul>/)[0];
  assert.equal(count(facts, /<li>/g), 3);
  for (const fact of h.facts) assert.ok(facts.includes(`<li>${esc(fact)}</li>`));
  assert.equal(h.facts[0], 'January 2027 Founding Cohort');
  assert.equal(HERO_TILES, 'detached');
  assert.equal(count(hero, /<span class="hero__tiles/g), 2, 'a wide and a phone group');
  assert.ok(hero.includes('hero__tiles--wide') && hero.includes('hero__tiles--phone'));
  assert.ok(hero.indexOf('hero__tiles') < hero.indexOf('hero__grid'), 'the group stands outside the grid, at the block corner');
  const none = render(content, { heroTiles: 'none' });
  assert.ok(!none.includes('hero__tiles'));
  assert.equal(count(none, /<svg class="mosaic /g), 10, 'only the band drawings remain');
});

test('Who it is for: the small line and the heading of 18 Nov, Ready for bigger first, then Stretched too thin; an icon in a champagne circle, the title in italic Lora and the text; no tiles in the cards', () => {
  const who = section('who');
  assert.equal(content.who.heading, 'Which of these sounds like you?');
  assert.ok(who.includes(`<p class="who__label caps">${esc(content.who.label)}</p>\n    <h2 id="who-title">${esc(content.who.heading)}</h2>`));
  assert.equal(content.who.label, 'Where you are now');
  assert.deepEqual(content.who.items.map((item) => item.title), ['Ready for bigger', 'Stretched too thin', 'The best-kept secret', 'A plan for everyone but you']);
  assert.equal(ICONS['who-0'], 'trending-up');
  assert.equal(ICONS['who-1'], 'expand');
  const cards = who.match(/<li class="card who__card">[^]*?<\/li>/g) || [];
  assert.equal(cards.length, 4);
  cards.forEach((card, i) => {
    assert.ok(card.includes('<span class="circle circle--champagne" aria-hidden="true"><svg class="icon"'), `card ${i} icon`);
    assert.ok(card.includes(`<h3 class="who__title">${esc(content.who.items[i].title)}</h3>`));
    assert.ok(card.includes(`<p>${esc(content.who.items[i].text)}</p>`));
  });
  assert.ok(!who.includes('class="tile"'));
});

test('the shift: the heading, four compact rows with the From and to labels, a gold arrow between and a full stop at the end, and the tiles picture: two squares of one size (now pushed and turned, after 8 weeks even), a label over each, an arrow from the first to the second; no quote here since 17 Nov', () => {
  const shift = section('shift');
  const s = content.shift;
  assert.ok(shift.includes('<div class="container shift__grid">\n    <h2 id="shift-title" class="shift__heading">'));
  const rows = shift.match(/<li class="shift__row">[^]*?<\/li>/g) || [];
  assert.equal(rows.length, 4);
  rows.forEach((row, i) => {
    const item = s.items[i];
    assert.ok(row.includes(`<span class="shift__label caps">${esc(s.from_label)}</span> <span class="shift__text">${esc(item.from)}</span>`));
    assert.ok(row.includes(`<span class="shift__label caps">${esc(s.to_label)}</span> <span class="shift__text">${esc(item.to)}.</span>`));
    assert.ok(row.includes('<span class="shift__arrow"><svg class="arrow"'));
  });
  assert.equal(s.heading, 'The shift we work toward');
  assert.ok(shift.includes(`<div class="tiles-pair__cell tiles-pair__cell--now">\n        <p class="tiles-pair__label caps">${esc(s.now_label)}</p>\n        <div class="tiles-pair__square"><svg class="picture picture--now" viewBox="0 0 ${PATH_SIZE} ${PATH_SIZE}"`));
  assert.ok(shift.includes(`<div class="tiles-pair__cell tiles-pair__cell--after">\n        <p class="tiles-pair__label caps">${esc(s.after_label)}</p>\n        <div class="tiles-pair__square"><svg class="picture picture--after" viewBox="0 0 ${PATH_SIZE} ${PATH_SIZE}"`));
  assert.ok(shift.includes('</svg><span class="tiles-pair__arrow" aria-hidden="true"><svg class="arrow"'), 'the arrow sits in the first square, between the two');
  assert.equal(count(shift, /tiles-pair__arrow/g), 1);
  const pictures = shift.match(/<svg class="picture[^]*?<\/svg>/g) || [];
  assert.equal(pictures.length, 2);
  for (const svg of pictures) {
    assert.equal(count(svg, /<rect /g), 16);
    assert.ok(svg.includes('aria-hidden="true"') && !svg.includes('slice') && !/<(image|text|script)\b/.test(svg));
    for (const [, fill] of svg.matchAll(/fill="(#[0-9A-Fa-f]{6})"/g)) assert.ok([COLOURS.champagne, COLOURS.aubergine, COLOURS.navy].includes(fill), fill);
  }
  assert.ok(pictures[0].includes('rotate(') && !pictures[1].includes('rotate('), 'scattered tiles are turned, the mosaic is not');
  assert.ok(shift.indexOf('</ol>') < shift.indexOf('<div class="tiles-pair">'), 'the picture follows the rows');
  assert.ok(!shift.includes('<figure class="quote') && !shift.includes('<svg class="mosaic'));
  assert.equal(count(html, /<svg class="picture/g), 2, 'the picture stands in The shift only');
});

test('the bridge: between The shift and the Roadmap a light band with nothing but Anna\'s quote; without a quote there the band is not printed; no Adam Grant, no navy band there', () => {
  const bridge = section('bridge');
  assert.ok(bridge.startsWith('<section class="section section--deep bridge" aria-label="Anna Buevich">'));
  assert.equal(count(bridge, /<figure class="quote/g), 1);
  assert.ok(bridge.includes('<strong class="quote__name">Anna Buevich</strong>'));
  assert.ok(!bridge.includes('<h2') && !bridge.includes('band--navy') && !bridge.includes('picture'));
  assert.ok(!/Adam Grant|Hidden Potential|stop dreaming/.test(html), 'the quote of Adam Grant is gone (Julia, 17 Nov)');
  assert.ok(!html.includes('problem__') && !html.includes('class="problem'), 'the Problem band is gone');
  const without = render({ ...content, quotes: content.quotes.filter((q) => q.at !== 'bridge') });
  assert.ok(!without.includes('class="section section--deep bridge"'));
});

test('Roadmap (slide 8): an aubergine band; left the label, the heading, the inputs label and four filled tiles; right the list title, four numbered points with their leads and the line about the circle with a star; no diagram, no quote', () => {
  const promise = section('promise');
  const p = content.promise;
  assert.ok(promise.includes(`<p class="promise__label caps">${esc(p.label)}</p>\n      <h2 id="promise-title">${esc(p.heading)}</h2>\n      <p class="promise__label promise__label--inputs caps">${esc(p.inputs_label)}</p>`));
  const tiles = promise.match(/<li class="inputs__tile inputs__tile--(\d)">([^<]*)<\/li>/g) || [];
  assert.equal(tiles.length, 4);
  p.inputs.forEach((text, i) => assert.ok(tiles[i].includes(`inputs__tile--${i + 1}">${esc(text)}</li>`)));
  assert.ok(promise.includes(`<h3 class="roadmap__title">${esc(p.list_heading)}</h3>`));
  const items = promise.match(/<li class="roadmap__item">[^]*?<\/li>/g) || [];
  assert.equal(items.length, 4);
  p.outcomes.forEach((item, i) => assert.ok(items[i].includes(`<span class="roadmap__number" aria-hidden="true">${i + 1}</span><p><strong>${esc(item.lead)}</strong> ${esc(item.text)}</p>`)));
  assert.ok(promise.includes(`<p class="roadmap__together"><span class="circle circle--outline" aria-hidden="true"><svg class="icon"`));
  assert.ok(promise.includes(`<span><strong>${esc(p.together.lead)}</strong> ${esc(p.together.text)}</span></p>`));
  assert.ok(promise.indexOf('promise__copy') < promise.indexOf('class="roadmap"'), 'the outcome on the left, the list on the right');
  assert.ok(!promise.includes('diagram') && !promise.includes('<figure class="quote') && !promise.includes('promise__quote'), 'no diagram card and no quote since 16 Nov');
  assert.equal(count(html, /band--aubergine/g), 1, 'the Roadmap is the aubergine band');
});

test('the Method (slide 4): one intro paragraph as a lead, weeks above the start, every level and the finish; coloured level cards; no mini mosaics', () => {
  const process = section('process');
  const p = content.process;
  assert.ok(process.includes(`<h2 id="process-title">${esc(p.heading)}</h2>\n    <p class="lead">${esc(p.intro)}</p>`));
  assert.ok(!('levels_intro' in p) && p.intro.endsWith('we work through three levels.'));
  assert.ok(process.includes(`<span class="path__weeks caps">${esc(p.start_weeks)}</span><span class="path__end-label caps">${esc(p.start_label)}</span>`));
  assert.ok(process.includes(`<span class="path__weeks caps">${esc(p.finish_weeks)}</span><span class="path__end-label caps">${esc(p.finish_label)}</span>`));
  p.levels.forEach((level, i) => {
    assert.ok(process.includes(`<span class="path__marker">${i + 1}</span>\n          <span class="path__weeks caps">${esc(level.weeks)}</span>\n          <div class="level level--${i + 1}">`), `level ${i + 1}`);
    assert.ok(process.includes(`<h3 class="level__name">${esc(level.name)}</h3>`));
  });
  assert.equal(p.levels[0].text.slice(0, 27), 'Make room for your ambition');
  assert.ok(!process.includes('class="mini"'));
});

test('What\'s included (slide 7): six tiles with an icon in an aubergine circle, a title and a line; the strip after week 8 with a star and two bold phrases; then the two quotes side by side; no 30-minute session anywhere', () => {
  const pack = section('package');
  const p = content.package;
  const items = pack.match(/<li class="included__item">[^]*?<\/li>/g) || [];
  assert.equal(items.length, 6);
  items.forEach((item, i) => {
    assert.ok(item.includes('<span class="circle circle--aubergine" aria-hidden="true"><svg class="icon"'));
    assert.ok(item.includes(`<h3 class="included__title">${esc(p.items[i].title)}</h3>\n          <p class="included__text">${esc(p.items[i].text)}</p>`));
  });
  assert.ok(pack.includes(`<div class="after-week">\n      <span class="circle circle--aubergine" aria-hidden="true"><svg class="icon"`));
  assert.ok(pack.includes(`<p class="after-week__label caps">${esc(p.after_label)}</p>\n        <p class="after-week__text">${rich(p.after_text)}</p>`));
  assert.ok(pack.includes('<strong>A group calibration session</strong>') && pack.includes('<strong>Mosaic of Life alumni club</strong>'), 'the two phrases Julia wants bold (17 Nov)');
  assert.ok(pack.indexOf('</ul>') < pack.indexOf('<div class="after-week">') && pack.indexOf('<div class="after-week">') < pack.indexOf('<div class="package__quotes">'));
  assert.ok(!pack.includes('class="stats"') && !pack.includes('package__list'));
  assert.ok(!/30[- ]min/i.test(html), 'the 30-minute session is gone from every block');
  assert.equal(p.heading, "What's included, in every tier");
});

test('Pricing (Julia\'s slide of 18 Nov): the cohort line, the heading Choose Your Experience, the invoices line with a check above the cards, three coloured cards with one price each and "(excl. VAT)" beside it, no spots, the intro and the list or the line, the badge on Plus only; under the cards only the buttons', () => {
  const pricing = section('pricing');
  const p = content.pricing;
  assert.ok(pricing.includes(`<p class="pricing__label caps">${esc(p.subheading)} · ${esc(p.total_spots).replace(/ /g, '&nbsp;')}</p>\n    <h2 id="pricing-title">${esc(p.heading)}</h2>\n    <p class="pricing__invoice"><span class="circle circle--aubergine" aria-hidden="true"><svg class="icon"`));
  assert.equal(p.heading, 'Choose Your Experience');
  assert.ok(pricing.includes('2027 · 8&nbsp;spots&nbsp;in&nbsp;total</p>'), 'the spots hold together, the line may break before the dot');
  assert.ok(pricing.includes(`<span>${esc(p.invoice_note)}</span></p>`) && p.invoice_note.endsWith('plus a short letter for your manager.'));
  assert.ok(pricing.indexOf('pricing__invoice') < pricing.indexOf('<ul class="tiers">'), 'the invoices line stands above the cards');
  assert.equal(ICONS.invoice, 'check');
  const tiers = pricing.match(/<li class="tier tier--\w+">[^]*?\n      <\/li>/g) || [];
  assert.equal(tiers.length, 3);
  assert.ok(tiers[0].includes('tier--core') && tiers[1].includes('tier--plus') && tiers[2].includes('tier--premium'));
  tiers.forEach((tier, i) => {
    const t = p.tiers[i];
    assert.ok(tier.includes(`<p class="tier__price"><span class="tier__amount">${esc(t.price)}</span> <span class="tier__vat">${esc(p.vat_label)}</span></p>`), `${t.name}: the price with the VAT note beside it`);
    assert.ok(tier.includes(`<p class="tier__intro">${esc(t.intro)}</p>`));
    assert.ok(!tier.includes('tier__terms') && !tier.includes('tier__was') && !tier.includes('tier__arrow'), `${t.name}: no spots, no first price, no arrow`);
  });
  assert.equal(p.vat_label, '(excl. VAT)');
  assert.deepEqual(p.tiers.map((t) => t.price), ['€800', '€1,100', '€1,900']);
  assert.deepEqual(p.tiers.map((t) => t.spots), ['', '', '']);
  const list = tiers[0].match(/<ul class="tier__list">[^]*?<\/ul>/)[0];
  assert.equal(count(list, /<li>/g), 5);
  p.tiers[0].items.forEach((item) => assert.ok(list.includes(`<li>${esc(item)}</li>`)));
  assert.ok(list.includes('<li>Post course &quot;check-in&quot; group session</li>'));
  assert.ok(tiers[1].includes(`<p class="tier__line">${esc(p.tiers[1].items[0])}</p>`) && !tiers[1].includes('tier__list'));
  assert.ok(tiers[2].includes(`<p class="tier__line">${esc(p.tiers[2].items[0])}</p>`) && !tiers[2].includes('tier__list'));
  assert.ok(tiers[1].endsWith(`<p class="tier__badge">${esc(p.tiers[1].badge)}</p>\n      </li>`), 'Most recommended at the foot of Plus');
  assert.equal(p.tiers[1].badge, 'Most recommended');
  assert.equal(count(pricing, /tier__badge/g), 1, 'a badge on Plus only');
  assert.ok(!pricing.includes('pricing__note') && !/founding member|better price than future cohorts|up to 5 spots|only 2 spots|€995|€795/.test(html), 'the founding note, the spots and the old prices are gone');
  assert.ok(pricing.includes('<div class="pricing__call">\n        <div class="pricing__cta">'), 'under the cards only the call button on the left');
  assert.ok(!pricing.includes('tier__text') && !pricing.includes('pricing__sub'));
});

test('Meet your mentor: a navy band, the six paragraphs of Julia\'s document (the book title in italic), the sticky portrait without tiles, no figures any more', () => {
  const proof = html.match(/<section class="section proof band band--navy"[^]*?<\/section>/)[0];
  assert.equal(content.proof.paragraphs.length, 6);
  assert.ok(proof.includes(`<h2 id="proof-title">${esc(content.proof.heading)}</h2>`) && content.proof.heading === 'Meet Your Mentor');
  content.proof.paragraphs.forEach((text) => assert.ok(proof.includes(`<p>${rich(text)}</p>`)));
  assert.ok(proof.includes('author of <em>Mosaic of Life</em>.</p>'));
  assert.ok(proof.includes('<div class="proof__photos">') && !proof.includes('mosaic') && !proof.includes('proof__stats'));
  assert.ok(proof.indexOf('id="proof-title"') < proof.indexOf('proof__grid') && proof.indexOf('proof__photos') < proof.indexOf('proof__copy'));
});

test('What makes my approach different: three cards with an icon in a champagne circle, a title and the text, then the session photo', () => {
  const approach = section('approach');
  const a = content.approach;
  assert.ok(approach.includes(`<h2 id="approach-title">${esc(a.heading)}</h2>`));
  const cards = approach.match(/<li class="card approach__card">[^]*?<\/li>/g) || [];
  assert.equal(cards.length, 3);
  cards.forEach((card, i) => {
    assert.ok(card.includes('<span class="circle circle--champagne" aria-hidden="true"><svg class="icon"'));
    assert.ok(card.includes(`<h3 class="approach__title">${esc(a.items[i].title)}</h3>\n        <p>${esc(a.items[i].text)}</p>`));
  });
  assert.ok(!approach.includes('bring__') && !approach.includes('shift-visual') && !approach.includes('struck'));
  assert.ok(!html.includes('What producing gave me') && !html.includes('strengths'));
});

test('five quotes, each inside the block its "at" names, in Lora italic with every paragraph, the key phrase in bold, the name and the role with the company; two under What\'s included side by side; Kateryna in the Method, Anna in the bridge', () => {
  assert.equal(content.quotes.length, 5);
  assert.deepEqual(content.quotes.map((q) => [q.name.split(' ')[0], q.at]), [['Kateryna', 'process'], ['Anna', 'bridge'], ['Ellen', 'package'], ['Ally', 'package'], ['Angela', 'logistics']]);
  assert.deepEqual(QUOTE_BLOCKS, ['shift', 'bridge', 'process', 'package', 'pricing', 'logistics']);
  assert.ok(!html.includes('quotes__grid') && !html.includes('quotes-title'));
  const bold = { Kateryna: 'In just a few weeks, I secured a new job', Anna: 'I moved from reactive networking to strategic engagement', Angela: 'a much bigger impact than I expected', Ally: 'turn my goals into a clear, measurable plan', Ellen: 'a warm and supportive environment' };
  for (const q of content.quotes) {
    assert.ok(QUOTE_BLOCKS.includes(q.at));
    const block = section(q.at);
    const figures = block.split('<figure class="quote').slice(1).map((f) => f.split('</figure>')[0]);
    const figure = figures.find((f) => f.includes(`<strong class="quote__name">${esc(q.name)}</strong>`));
    assert.ok(figure, `${q.name} stands in ${q.at}`);
    for (const p of q.text) assert.ok(figure.includes(`<p>${rich(p)}</p>`), `${q.name}: every paragraph`);
    const phrase = bold[q.name.split(' ')[0]];
    assert.equal(count(figure, /<strong>/g), 1, `${q.name}: one bold phrase`);
    assert.ok(figure.includes(`<strong>${esc(phrase)}</strong>`), `${q.name}: the phrase Julia chose`);
    assert.ok(figure.includes(`<span class="quote__role">${esc(q.role)}, ${esc(q.company)}</span>`));
    assert.ok(figure.includes('<span class="quote__mark" aria-hidden="true">&ldquo;</span>'));
  }
  assert.equal(count(html, /<figure class="quote[" ]/g), 5);
  assert.equal(count(html, /quote--compact/g), 0, 'no compact quote since the Roadmap follows slide 8');
  const pack = section('package');
  const wrapped = pack.match(/<div class="package__quotes">[^]*?<\/div>\n  <\/div>/)[0];
  assert.equal(count(wrapped, /<figure class="quote">/g), 2, 'Ellen and Ally under What\'s included, before the prices');
  assert.ok(wrapped.indexOf('Ellen Farnan') < wrapped.indexOf('Ally Alombro'));
  assert.ok(pack.indexOf('<div class="after-week">') < pack.indexOf('<div class="package__quotes">'));
  assert.throws(() => render({ ...content, quotes: [{ ...content.quotes[0], at: 'footer' }] }), /footer/);
  assert.throws(() => render({ ...content, quotes: [{ ...content.quotes[0], at: 'promise' }] }), /promise/);
});

test('the deposit: under the tiers the call button, then the lead line, the outline button and its note; in the closing band the outline button with its note beside the call button', () => {
  const d = content.deposit;
  const pricing = section('pricing');
  assert.ok(pricing.indexOf('<ul class="tiers">') < pricing.indexOf('<div class="pricing__actions">'));
  assert.ok(pricing.indexOf('class="pricing__cta"') < pricing.indexOf('<div class="deposit">'));
  assert.ok(pricing.includes(`<p class="deposit__lead">${esc(d.lead)}</p>\n        <a class="btn btn--outline"`), 'the lead line stands right above the deposit button');
  assert.ok(pricing.includes(`<p class="deposit__note">${esc(d.note)}</p>`));
  const closing = html.match(/<section class="closing"[^]*?<\/section>/)[0];
  assert.ok(closing.indexOf('class="closing__cta"') < closing.indexOf('<div class="closing__deposit">'), 'the call button first, the deposit second');
  assert.ok(closing.includes(`<a class="btn btn--outline" href="${esc(registerUrl(d.url, 'closing'))}" target="_blank" rel="noopener">${esc(d.label)}</a>\n        <p class="deposit__note">${esc(d.note)}</p>`));
  assert.ok(!closing.includes('deposit__lead'), 'no lead line in the closing band');
  assert.equal(count(html, /deposit__note/g), 2);
  assert.ok(!/refund/i.test(html), 'nothing about refunds');
});

test('Practical details: three coloured cards with icons and the timeline of four steps; the payment step carries no date', () => {
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
    if (s.when.trim()) assert.ok(step.includes(`<span class="step__when caps">${esc(s.when)}</span>\n        <span class="step__dot" aria-hidden="true"></span>`));
    else assert.ok(!step.includes('step__when') && step.includes('<li class="step">\n        <span class="step__dot" aria-hidden="true"></span>'), 'no date line');
    assert.ok(step.includes(`<h3 class="step__title">${esc(s.title)}</h3>`) && step.includes(`<p class="step__text">${esc(s.text)}</p>`));
  });
  assert.deepEqual(content.logistics.timeline.map((s) => s.title), ['Program fit call', 'Payment', 'Onboarding', 'We begin']);
  assert.equal(count(logistics, /step__when/g), 3);
  assert.equal(content.logistics.timeline[1].text, 'Remaining balance due by December 18th.', 'the date sits in the text of the payment step (Julia, 17 Nov)');
});

test('Good to know (slide 10): the label, the heading and six questions with their answers, in the order of the slide columns', () => {
  const faq = section('faq');
  const f = content.faq;
  assert.ok(faq.includes(`<p class="faq__label caps">${esc(f.label)}</p>\n    <h2 id="faq-title">${esc(f.heading)}</h2>`));
  const items = faq.match(/<div class="faq__item">[^]*?<\/div>/g) || [];
  assert.equal(items.length, 6);
  f.items.forEach((item, i) => assert.ok(items[i].includes(`<h3 class="faq__q">${esc(item.q)}</h3>\n        <p class="faq__a">${esc(item.a)}</p>`)));
  assert.equal(f.items[0].q, 'Is this for corporate women or entrepreneurs?');
  assert.equal(f.items[3].q, 'Can my employer pay?');
  assert.ok(html.indexOf('class="section section--deep logistics"') < html.indexOf('class="section faq"') && html.indexOf('class="section faq"') < html.indexOf('class="closing"'), 'between Practical details and the closing band');
});

test('the closing band (Julia\'s screenshot of 17 Nov): the two large lines of the heading, the smaller line, the gold italic line and the two buttons, nothing else', () => {
  const closing = html.match(/<section class="closing"[^]*?<\/section>/)[0];
  const c = content.closing;
  assert.ok(closing.includes(`<h2 id="closing-title" class="closing__title">${esc(c.heading)}<br>${esc(c.heading_more)}</h2>\n    <p class="closing__text">${esc(c.text)}</p>\n    <p class="closing__line">${esc(c.line)}</p>\n    <div class="closing__actions">`));
  assert.equal(count(closing, /<a class="btn/g), 2);
  assert.equal(count(closing, /<p\b/g), 3, 'the line, the gold line and the deposit note');
  assert.deepEqual([c.heading, c.heading_more, c.text, c.line], ['In January, everyone thinks about goals.', 'We act on them.', "This time, you won't be alone.", 'Join the founding cohort']);
  assert.ok(!/One year from now/.test(html));
});

test('icons: nineteen places, every icon an inline svg with one stroke, aria-hidden, without text; five arrows; the footer and the legal line', () => {
  assert.equal(Object.keys(ICONS).length, 19);
  const icons = html.match(/<svg class="icon"[^]*?<\/svg>/g) || [];
  assert.equal(icons.length, 19);
  for (const svg of icons) {
    assert.ok(svg.includes('stroke="currentColor" stroke-width="1.5"') && svg.includes('aria-hidden="true"') && svg.includes('focusable="false"'));
    assert.ok(!/<(text|image|script)\b/.test(svg));
  }
  assert.equal(count(html, /<svg class="arrow"/g), 5, 'four shift rows and the tiles picture');
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

test('mosaics: the two hero groups and the five band drawings; every tile whole inside its viewBox; brand colours only; within 30 KB; the same every build; no mosaic inside the blocks', () => {
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
  for (const block of ['who', 'shift', 'bridge', 'promise', 'package', 'process', 'pricing', 'proof', 'approach', 'logistics', 'faq']) {
    assert.ok(!section(block).includes('<svg class="mosaic'), `${block} has no mosaic`);
  }
});

test('the deeper background on every second light block, the navy bands, the aubergine band, lead paragraphs where the task puts them', () => {
  const deep = [...html.matchAll(/<section class="section section--deep (\w+)"/g)].map((m) => m[1]);
  assert.deepEqual(deep, ['who', 'bridge', 'process', 'pricing', 'logistics']);
  assert.equal(count(html, /band--navy/g), 1, 'Meet your mentor only: the Problem band left on 17 Nov');
  assert.equal(count(html, /class="lead"/g), 1, 'the Method intro');
});

test('rich: **bold** and *italic* are the only markup, everything else is escaped; the renderer refuses a photo without built versions', () => {
  assert.equal(rich('a **b** *c* & <d>'), 'a <strong>b</strong> <em>c</em> &amp; &lt;d&gt;');
  assert.equal(rich('author of *Mosaic of Life*.'), 'author of <em>Mosaic of Life</em>.');
  assert.equal(esc('a<b>&"c\''), 'a&lt;b&gt;&amp;&quot;c&#39;');
  assert.throws(() => renderPage(content, { manifest: {}, drafts }), /no photo versions/);
});
