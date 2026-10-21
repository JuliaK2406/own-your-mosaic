import test from 'node:test';
import assert from 'node:assert/strict';
import { loadContent, loadRaw, findDrafts, walkStrings } from '../src/check.mjs';
import { renderPage, rich, esc } from '../src/render/page.mjs';
import { COLOURS } from '../src/render/mosaic.mjs';

const content = await loadContent();
const raw = await loadRaw();
const drafts = new Set(findDrafts(raw, content).drafts.map((draft) => draft.path));
// A manifest like the one src/images.mjs returns (with its crops), without running sharp.
const manifest = {
  [content.hero.photo]: { slug: 'hero', widths: [640, 1024, 1600], width: 3859, height: 4824 },
  [content.proof.photo]: { slug: 'portrait', widths: [640, 1024, 1600], width: 3293, height: 4116 },
  [content.proof.photo_2]: { slug: 'event', widths: [640, 1024, 1600], width: 2100, height: 1400 },
};
const render = (c = content) => renderPage(c, { manifest, drafts });
const html = render();
const withMeta = (patch) => ({ ...content, meta: { ...content.meta, ...patch } });
const count = (text, pattern) => (text.match(pattern) || []).length;

// Every text of the yaml except meta, links, the button address and the photo file names.
const SKIP = /^(meta\.|links\.|register\.url$|hero\.photo$|proof\.photo$|proof\.photo_2$)/;

test('every text from the yaml is on the page word for word; ** becomes <strong>', () => {
  const missing = [];
  let checked = 0;
  walkStrings(content, '', (at, text) => {
    if (SKIP.test(at) || text.trim() === '') return;
    checked += 1;
    const expected = text.includes('**') ? rich(text) : esc(text);
    if (!html.includes(expected)) missing.push(at);
  });
  assert.deepEqual(missing, []);
  assert.ok(checked > 60, `${checked} texts checked`);
  assert.ok(html.includes('<strong>vision</strong>') && html.includes('<strong>strategic focus</strong>'));
  assert.ok(!html.includes('**'));
});

test('headings: one h1 first, a h2 per block, h3 inside the cards, no level skipped', () => {
  const levels = [...html.matchAll(/<h([123])\b/g)].map((match) => Number(match[1]));
  assert.equal(levels[0], 1);
  assert.equal(levels.filter((level) => level === 1).length, 1);
  assert.equal(levels.filter((level) => level === 2).length, 7);
  levels.reduce((previous, level) => {
    assert.ok(level <= previous + 1, `h${level} right after h${previous}`);
    return level;
  }, 0);
  assert.ok(html.includes(`<h1 id="hero-title" class="hero__title">${esc(content.hero.title)}</h1>`));
});

test('the button: four places with the label from the yaml, "#" and a TODO tag while the address is TODO, none of it when published', () => {
  const label = esc(content.register.label);
  assert.equal(count(html, new RegExp(`<a class="btn[^"]*" href="#">${label}</a>`, 'g')), 4);
  assert.equal(count(html, /tag--todo/g), 4);
  const linked = render({ ...content, register: { ...content.register, url: 'https://calendly.com/example/30min' } });
  assert.equal(count(linked, new RegExp(`href="https://calendly.com/example/30min">${label}</a>`, 'g')), 4);
  assert.ok(!linked.includes('tag--todo'));
  const published = renderPage(withMeta({ published: true }), { manifest, drafts });
  assert.ok(!published.includes('tag--todo') && !published.includes('tag--draft'));
});

test('draft tags next to the name, the two draft headings and each quote', () => {
  assert.equal(count(html, /tag--draft/g), 3 + content.proof.quotes.length);
  assert.ok(html.includes(`${esc(content.hero.name)} <span class="tag tag--draft">draft</span></p>`));
  assert.ok(html.includes(`${esc(content.proof.heading)} <span class="tag tag--draft">draft</span></h2>`));
  assert.ok(html.includes(`${esc(content.logistics.heading)} <span class="tag tag--draft">draft</span></h2>`));
  const none = renderPage(content, { manifest, drafts: new Set() });
  assert.ok(!none.includes('tag--draft'));
});

test('head: lang, title, description, og tags; noindex while unpublished; canonical, og:url and og:image only with site_url', () => {
  assert.ok(html.startsWith('<!doctype html>\n<html lang="en">'));
  assert.ok(html.includes(`<title>${esc(content.meta.title)}</title>`));
  assert.ok(html.includes(`<meta name="description" content="${esc(content.meta.description)}">`));
  assert.ok(html.includes(`<meta property="og:title" content="${esc(content.meta.title)}">`));
  assert.ok(html.includes(`<meta property="og:description" content="${esc(content.meta.description)}">`));
  assert.ok(html.includes('<meta name="robots" content="noindex, nofollow">'));
  for (const tag of ['rel="canonical"', 'og:url', 'og:image', 'twitter:card']) assert.ok(!html.includes(tag), `${tag} needs an absolute address`);
  const site = 'https://programme.juliakrylova.com';
  const live = renderPage(withMeta({ published: true, site_url: `${site}/` }), { manifest, drafts });
  assert.ok(!live.includes('name="robots"'));
  assert.ok(live.includes(`<link rel="canonical" href="${site}/">`));
  assert.ok(live.includes(`<meta property="og:url" content="${site}/">`));
  assert.ok(live.includes(`<meta property="og:image" content="${site}/og-image.png">`));
  assert.ok(live.includes('<meta property="og:image:width" content="1200">') && live.includes('<meta property="og:image:height" content="627">'));
  assert.ok(live.includes(`<meta property="og:image:alt" content="${esc(content.hero.title)}: ${esc(content.hero.subtitle)}">`));
  assert.ok(live.includes('<meta name="twitter:card" content="summary_large_image">'));
});

test('no Google fonts, no script, no absolute paths: everything comes from the site itself', () => {
  assert.ok(!/fonts\.googleapis\.com|fonts\.gstatic\.com/.test(html));
  assert.ok(!/<script/.test(html));
  assert.ok(!/(href|src|srcset)="\/[^/]/.test(html), 'no root-absolute paths');
  assert.ok(!/(href|src)="https?:\/\/(?!www\.juliakrylova\.com)/.test(html), 'the only outside link is the main site');
  assert.ok(html.includes('href="styles.css"') && html.includes('href="favicon.svg"'));
});

test('three photos: every <img> has alt, width and height from the crop; the first-screen photo loads first, the others lazily', () => {
  const imgs = html.match(/<img\b[^>]*>/g) || [];
  assert.equal(imgs.length, 3);
  for (const img of imgs) {
    for (const attr of ['alt', 'width', 'height']) assert.ok(new RegExp(` ${attr}="[^"]*"`).test(img), `${attr} in ${img}`);
  }
  assert.ok(imgs[0].includes('fetchpriority="high"') && !imgs[0].includes('loading="lazy"'));
  assert.ok(imgs[1].includes('loading="lazy"') && imgs[2].includes('loading="lazy"'));
  assert.equal(count(html, /<source type="image\/webp"/g), 3);
  assert.ok(imgs[0].includes('width="1600" height="2000"'), 'the first-screen crop is 4:5');
  assert.ok(imgs[1].includes('width="1600" height="2000"'), 'the portrait is 4:5');
  assert.ok(imgs[2].includes('width="1600" height="1067"'), 'the event photo is 3:2');
  assert.ok(html.includes('img/hero-640.webp 640w, img/hero-1024.webp 1024w, img/hero-1600.webp 1600w'));
  assert.ok(imgs[0].includes(`alt="${esc(content.hero.photo_alt)}"`) && imgs[2].includes(`alt="${esc(content.proof.photo_2_alt)}"`));
  // the text comes before the photos in the markup of Meet your mentor
  assert.ok(html.indexOf('class="proof__copy"') < html.indexOf('class="proof__photos"'));
});

test('the facts line, the quotes with their names and roles, the legal line and the link to the main site', () => {
  assert.ok(html.includes(content.hero.facts.map(esc).join('<span class="sep" aria-hidden="true">·</span>')));
  for (const q of content.proof.quotes) {
    assert.ok(html.includes(`<blockquote class="quote__text"><p>${esc(q.quote)}</p></blockquote>`));
    assert.ok(html.includes(`<strong class="quote__name">${esc(q.name)}</strong><span class="quote__role">${esc(q.role)}, ${esc(q.company)}</span>`));
  }
  assert.equal(count(html, /<span class="quote__mark" aria-hidden="true">&ldquo;<\/span>/g), content.proof.quotes.length);
  assert.ok(html.includes(`<p>${esc(content.footer.legal_line)}</p>`));
  assert.ok(html.includes(`<a href="${content.links.main_site}">${esc(content.footer.main_site_label)}</a>`));
});

test('mosaics: eight inline svgs, all aria-hidden, brand colours only, within 30 KB, the same in every build', () => {
  const svgs = html.match(/<svg class="mosaic[^]*?<\/svg>/g) || [];
  assert.equal(svgs.length, 8, 'first screen field and two corners, Promise panel and strip, mentor corner, band wide and tall');
  const bytes = svgs.reduce((n, svg) => n + Buffer.byteLength(svg), 0);
  assert.ok(bytes <= 30 * 1024, `${bytes} bytes of mosaics`);
  const allowed = new Set(Object.values(COLOURS));
  for (const svg of svgs) {
    assert.ok(svg.includes('aria-hidden="true"'));
    for (const [, fill] of svg.matchAll(/fill="(#[0-9A-Fa-f]{6})"/g)) assert.ok(allowed.has(fill), `${fill} is not a brand colour`);
    assert.ok(!/<(image|script|text|foreignObject)\b/.test(svg));
  }
  assert.equal(count(html, new RegExp(`fill="${COLOURS.gold}"`, 'g')), 2, 'gold only as the dot of the two Promise panels');
  assert.equal(render(), html, 'the same markup every time');
  // the Problem and Package blocks and the paragraphs stay on a clean background: no mosaic there
  for (const block of ['problem', 'package', 'process', 'pricing', 'logistics']) {
    const section = html.match(new RegExp(`<section class="section[^"]*\\b${block}\\b[^]*?</section>`))[0];
    assert.ok(!section.includes('<svg class="mosaic'), `${block} has no mosaic`);
  }
});

test('the deeper background on every second block, cards stay in the markup as before', () => {
  const deep = [...html.matchAll(/<section class="section section--deep (\w+)"/g)].map((m) => m[1]);
  assert.deepEqual(deep, ['who', 'process', 'pricing', 'logistics']);
  assert.equal(count(html, /class="lead"/g), content.hero.paragraphs.length + content.promise.paragraphs.length + 1, 'lead size: first-screen paragraphs, Promise paragraphs, process.intro');
});

test('rich: only **bold** is markup, everything else is escaped', () => {
  assert.equal(rich('a **b** & <c>'), 'a <strong>b</strong> &amp; &lt;c&gt;');
  assert.equal(rich('no stars'), 'no stars');
  assert.equal(esc('a<b>&"c\''), 'a&lt;b&gt;&amp;&quot;c&#39;');
});

test('the renderer refuses a photo without built versions', () => {
  assert.throws(() => renderPage(content, { manifest: {}, drafts }), /no photo versions/);
});
