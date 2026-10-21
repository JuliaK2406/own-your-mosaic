import test from 'node:test';
import assert from 'node:assert/strict';
import { loadContent, loadRaw, findDrafts, walkStrings } from '../src/check.mjs';
import { renderPage, rich, esc } from '../src/render/page.mjs';

const content = await loadContent();
const raw = await loadRaw();
const drafts = new Set(findDrafts(raw, content).drafts.map((draft) => draft.path));
// A manifest like the one src/images.mjs returns, without running sharp.
const manifest = {
  [content.hero.photo]: { slug: 'hero', widths: [640, 1024, 1600], width: 3293, height: 4116 },
  [content.proof.photo]: { slug: 'proof', widths: [640, 1024, 1600], width: 4396, height: 6593 },
};
const render = (c = content) => renderPage(c, { manifest, drafts });
const html = render();
const withMeta = (patch) => ({ ...content, meta: { ...content.meta, ...patch } });
const count = (text, pattern) => (text.match(pattern) || []).length;

// Every text of the yaml except meta, links, the button address and the photo file names.
const SKIP = /^(meta\.|links\.|register\.url$|hero\.photo$|proof\.photo$)/;

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

test('every <img> has alt, width and height; the first-screen photo loads first, the other lazily', () => {
  const imgs = html.match(/<img\b[^>]*>/g) || [];
  assert.equal(imgs.length, 2);
  for (const img of imgs) {
    for (const attr of ['alt', 'width', 'height']) assert.ok(new RegExp(` ${attr}="[^"]*"`).test(img), `${attr} in ${img}`);
  }
  assert.ok(imgs[0].includes('fetchpriority="high"') && !imgs[0].includes('loading="lazy"'));
  assert.ok(imgs[1].includes('loading="lazy"'));
  assert.equal(count(html, /<source type="image\/webp"/g), 2);
  assert.ok(imgs[0].includes('width="1600" height="2000"'), 'the height follows the ratio of the original');
  assert.ok(imgs[1].includes('width="1600" height="2400"'));
  assert.ok(html.includes('img/hero-640.webp 640w, img/hero-1024.webp 1024w, img/hero-1600.webp 1600w'));
});

test('the facts line, the quotes with their names and roles, the legal line and the link to the main site', () => {
  assert.ok(html.includes(content.hero.facts.map(esc).join('<span class="sep" aria-hidden="true">·</span>')));
  for (const q of content.proof.quotes) {
    assert.ok(html.includes(`&ldquo;${esc(q.quote)}&rdquo;`));
    assert.ok(html.includes(`<strong class="quote__name">${esc(q.name)}</strong><span class="quote__role">${esc(q.role)}, ${esc(q.company)}</span>`));
  }
  assert.ok(html.includes(`<p>${esc(content.footer.legal_line)}</p>`));
  assert.ok(html.includes(`<a href="${content.links.main_site}">${esc(content.footer.main_site_label)}</a>`));
});

test('rich: only **bold** is markup, everything else is escaped', () => {
  assert.equal(rich('a **b** & <c>'), 'a <strong>b</strong> &amp; &lt;c&gt;');
  assert.equal(rich('no stars'), 'no stars');
  assert.equal(esc('a<b>&"c\''), 'a&lt;b&gt;&amp;&quot;c&#39;');
});

test('the renderer refuses a photo without built versions', () => {
  assert.throws(() => renderPage(content, { manifest: {}, drafts }), /no photo versions/);
});
