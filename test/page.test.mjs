import test from 'node:test';
import assert from 'node:assert/strict';
import { loadContent, loadRaw, findDrafts, walkStrings } from '../src/check.mjs';
import { renderPage, rich, esc, DIAGRAM_ALPHAS, SIGN_ALPHAS, NOT_CONNECTED } from '../src/render/page.mjs';
import { COLOURS, BAND_VARIANTS } from '../src/render/mosaic.mjs';

const content = await loadContent();
const raw = await loadRaw();
const drafts = new Set(findDrafts(raw, content).drafts.map((draft) => draft.path));
// A manifest like the one src/images.mjs returns (with its crop), without running sharp.
const manifest = {
  [content.hero.photo]: { slug: 'hero', widths: [640, 1024, 1600], width: 3293, height: 4116 },
  [content.proof.photo]: { slug: 'portrait', widths: [640, 1024, 1600], width: 3859, height: 4824 },
};
const render = (c = content) => renderPage(c, { manifest, drafts });
const html = render();
const withMeta = (patch) => ({ ...content, meta: { ...content.meta, ...patch } });
const count = (text, pattern) => (text.match(pattern) || []).length;

// Every text of the yaml except meta, links, the button address and the photo file names.
const SKIP = /^(meta\.|links\.|register\.(mode|link_url|endpoint_url|privacy_url)$|hero\.photo$|proof\.photo$)/;
const linkMode = () => ({ ...content, register: { ...content.register, mode: 'link', link_url: 'https://calendly.com/example/30min' } });

test('every text from the yaml is on the page word for word (the diagram included); ** becomes <strong>', () => {
  const missing = [];
  let checked = 0;
  walkStrings(content, '', (at, text) => {
    if (SKIP.test(at) || text.trim() === '') return;
    checked += 1;
    const expected = text.includes('**') ? rich(text) : esc(text);
    if (!html.includes(expected)) missing.push(at);
  });
  assert.deepEqual(missing, []);
  assert.ok(checked > 90, `${checked} texts checked`);
  assert.ok(html.includes('<strong>vision</strong>') && html.includes('<strong>strategic focus</strong>'));
  assert.ok(!html.includes('**'));
});

test('headings: one h1 first, a h2 per block, h3 inside the cards, no level skipped', () => {
  const levels = [...html.matchAll(/<h([123])\b/g)].map((match) => Number(match[1]));
  assert.equal(levels[0], 1);
  assert.equal(levels.filter((level) => level === 1).length, 1);
  assert.equal(levels.filter((level) => level === 2).length, 8, 'seven blocks and the form heading');
  levels.reduce((previous, level) => {
    assert.ok(level <= previous + 1, `h${level} right after h${previous}`);
    return level;
  }, 0);
  assert.ok(html.includes(`<h1 id="hero-title" class="hero__title">${esc(content.hero.title)}</h1>`));
});

test('mode form: three buttons lead to #register without TODO tags, the fourth place is the form; mode link: four buttons open the address in a new tab, no form, no script', () => {
  const label = esc(content.register.label);
  assert.equal(count(html, new RegExp(`<a class="btn[^"]*" href="#register">${label}</a>`, 'g')), 3);
  assert.equal(count(html, /<a class="btn/g), 3);
  assert.ok(!/<a class="btn[^>]*>[^<]*<\/a> <span class="tag tag--todo">/.test(html), 'no TODO tag at a button');
  assert.equal(count(html, /tag--todo/g), 2, 'TODO at the privacy link and beside the submit button while the endpoint is empty');
  const linked = render(linkMode());
  assert.equal(count(linked, new RegExp(`<a class="btn[^"]*" href="https://calendly.com/example/30min" target="_blank" rel="noopener">${label}</a>`, 'g')), 4);
  assert.ok(!linked.includes('id="register"') && !linked.includes('<form') && !linked.includes('<script') && !linked.includes('<noscript'));
  assert.ok(!linked.includes('tag--todo'), 'in mode link nothing of the form is left');
  const published = renderPage(withMeta({ published: true }), { manifest, drafts });
  assert.ok(!published.includes('tag--todo') && !published.includes('tag--draft'));
});

test('draft tags next to the name, the diagram label, the two draft headings and each quote', () => {
  assert.equal(count(html, /tag--draft/g), 5 + content.proof.quotes.length);
  assert.ok(html.includes(`${esc(content.register.form.heading)} <span class="tag tag--draft">draft</span></h2>`), 'one tag for the whole form, at its heading');
  assert.ok(html.includes(`${esc(content.hero.name)} <span class="tag tag--draft">draft</span></p>`));
  assert.ok(html.includes(`${esc(content.promise.diagram.inputs_label)} <span class="tag tag--draft">draft</span></p>`), 'one tag for the whole diagram');
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

test('no Google fonts, the only script is the form module from the site itself, no absolute paths', () => {
  assert.ok(!/fonts\.googleapis\.com|fonts\.gstatic\.com/.test(html));
  assert.equal(count(html, /<script/g), 1);
  assert.ok(html.includes('<script type="module" src="register.js"></script>\n</body>'));
  assert.ok(!/<script[^>]*src="https?:/.test(html), 'no script from another domain');
  assert.ok(!/(href|src|srcset)="\/[^/]/.test(html), 'no root-absolute paths');
  assert.ok(!/(href|src)="https?:\/\/(?!www\.juliakrylova\.com)/.test(html), 'the only outside link is the main site');
  assert.ok(html.includes('href="styles.css"') && html.includes('href="favicon.svg"'));
});

test('two photos: every <img> has alt, width and height; the first-screen photo loads first, the portrait lazily', () => {
  const imgs = html.match(/<img\b[^>]*>/g) || [];
  assert.equal(imgs.length, 2);
  for (const img of imgs) {
    for (const attr of ['alt', 'width', 'height']) assert.ok(new RegExp(` ${attr}="[^"]*"`).test(img), `${attr} in ${img}`);
  }
  assert.ok(imgs[0].includes('fetchpriority="high"') && !imgs[0].includes('loading="lazy"'));
  assert.ok(imgs[1].includes('loading="lazy"'));
  assert.equal(count(html, /<source type="image\/webp"/g), 2);
  assert.ok(imgs[0].includes('width="1600" height="2000"') && imgs[1].includes('width="1600" height="2000"'), 'both 4:5');
  assert.ok(html.includes('img/hero-640.webp 640w, img/hero-1024.webp 1024w, img/hero-1600.webp 1600w'));
  assert.ok(imgs[0].includes(`alt="${esc(content.hero.photo_alt)}"`) && imgs[1].includes(`alt="${esc(content.proof.photo_alt)}"`));
  // Meet your mentor: the heading first, then the portrait, then the paragraphs
  const heading = html.indexOf('id="proof-title"');
  assert.ok(heading < html.indexOf('class="proof__photos"') && html.indexOf('class="proof__photos"') < html.indexOf('class="proof__copy"'));
});

test('the facts line keeps each fact in one piece; the quotes, the legal line and the link to the main site', () => {
  const facts = content.hero.facts.map((fact) => `<span class="hero__fact">${esc(fact)}</span>`).join('<span class="sep" aria-hidden="true">·</span>');
  assert.ok(html.includes(facts));
  for (const q of content.proof.quotes) {
    assert.ok(html.includes(`<blockquote class="quote__text"><p>${esc(q.quote)}</p></blockquote>`));
    assert.ok(html.includes(`<strong class="quote__name">${esc(q.name)}</strong><span class="quote__role">${esc(q.role)}, ${esc(q.company)}</span>`));
  }
  assert.equal(count(html, /<span class="quote__mark" aria-hidden="true">&ldquo;<\/span>/g), content.proof.quotes.length);
  assert.ok(html.includes(`<p>${esc(content.footer.legal_line)}</p>`));
  assert.ok(html.includes(`<a href="${content.links.main_site}">${esc(content.footer.main_site_label)}</a>`));
});

test('the Promise diagram: four words with tiles from light to deep, one gold stem and dot, the result behind the brand sign, three outcomes', () => {
  const d = content.promise.diagram;
  const items = html.match(/<li class="diagram__input">[^]*?<\/li>/g) || [];
  assert.equal(items.length, 4);
  items.forEach((item, i) => {
    assert.ok(item.includes(`<span class="diagram__tile" style="--alpha: ${DIAGRAM_ALPHAS[i]}" aria-hidden="true"></span>`));
    assert.ok(item.includes(`<span class="diagram__word">${esc(d.inputs[i])}</span>`));
  });
  assert.equal(count(html, /<div class="diagram__join" aria-hidden="true"><span class="diagram__stem"><\/span><span class="diagram__dot"><\/span><\/div>/g), 1);
  assert.ok(html.includes(`<span class="diagram__title">${esc(d.result)}</span></p>`));
  assert.equal(count(html.match(/<p class="diagram__result">[^]*?<\/p>/)[0], /<span style="--alpha: /g), SIGN_ALPHAS.length, 'the 3 x 3 brand sign before the result');
  assert.equal(count(html, /<span class="diagram__rule" aria-hidden="true"><\/span>/g), 1);
  assert.equal(count(html, /<ul class="diagram__outcomes">/g), 1);
  for (const text of d.outcomes) assert.ok(html.includes(`<li>${esc(text)}</li>`));
  assert.ok(!html.includes('diagram__lines') && !html.includes('promise__panel'));
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

test('mosaics: the fields, the corner groups and the five band drawings; every tile whole inside its viewBox; brand colours only; within 30 KB; the same every build', () => {
  const svgs = html.match(/<svg class="mosaic[^]*?<\/svg>/g) || [];
  const bands = Object.keys(BAND_VARIANTS);
  assert.equal(svgs.length, 1 + 4 + bands.length * 2, 'the sprite, the first-screen field, two corners, the mentor field, and a left and right svg per band width');
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
  assert.equal(parts.length, 4 + bands.length, 'four fields and five band symbols carry tiles');
  for (const part of parts) {
    assert.ok(part.width > 0 && part.height > 0, `${part.id} has a viewBox`);
    for (const [x, y, w, h] of part.rects) {
      assert.ok(x >= 0 && y >= 0 && x + w <= part.width && y + h <= part.height, `${part.id}: tile ${x},${y} ${w}x${h} is outside ${part.width}x${part.height}`);
    }
  }
  for (const name of bands) {
    assert.ok(html.includes(`<symbol id="band-${name}" viewBox="0 0 ${BAND_VARIANTS[name].width} ${BAND_VARIANTS[name].height}">`));
    assert.ok(html.includes(`<use href="#band-${name}"/>`) && html.includes(`<use href="#band-${name}" transform="translate(${BAND_VARIANTS[name].width} 0) scale(-1 1)"/>`));
  }
  assert.equal(count(html, new RegExp(`fill="${COLOURS.gold}"`, 'g')), 0, 'gold is never a tile');
  assert.equal(render(), html, 'the same markup every time');
  for (const block of ['problem', 'package', 'process', 'pricing', 'logistics']) {
    const section = html.match(new RegExp(`<section class="section[^"]*\\b${block}\\b[^]*?</section>`))[0];
    assert.ok(!section.includes('<svg class="mosaic'), `${block} has no mosaic`);
  }
});

test('the deeper background on every second block, lead paragraphs where the task puts them', () => {
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

test('the form: fields with labels, autocomplete and error slots, four tier pills from the tiers plus the unsure option, an empty newsletter box, the trap, the texts for the script, the thank-you', () => {
  const r = content.register;
  const f = r.form;
  const form = html.match(/<form class="register__form"[^]*?<\/form>/)[0];
  assert.ok(html.includes('<div class="register" id="register">'));
  assert.ok(html.includes(`<h2 class="register__heading" id="register-heading">${esc(f.heading)}`));
  assert.ok(html.includes(`<noscript><p class="register__noscript">${esc(f.noscript_note)}</p></noscript>`));
  assert.ok(html.includes('<noscript><style>.register__form { display: none; }</style></noscript>'), 'without JavaScript the note replaces the form');
  assert.ok(form.includes('novalidate') && form.includes('aria-labelledby="register-heading"'));
  for (const [id, name, auto] of [['reg-first-name', 'first_name', 'given-name'], ['reg-last-name', 'last_name', 'family-name'], ['reg-email', 'email', 'email']]) {
    assert.ok(form.includes(`<label for="${id}">`), id);
    assert.ok(form.includes(`<input id="${id}" name="${name}" type="${name === 'email' ? 'email' : 'text'}" autocomplete="${auto}"`), name);
    assert.ok(form.includes(`aria-describedby="${id}-error"`) && form.includes(`<p class="field__error" id="${id}-error" data-error-for="${name}" aria-live="polite"></p>`), `${id} error slot`);
  }
  assert.ok(form.includes('maxlength="60"') && form.includes('maxlength="254"') && form.includes('<textarea id="reg-message" name="message" rows="3" maxlength="1000" aria-describedby="reg-message-error">'));
  assert.ok(form.includes(`<legend>${esc(f.tier_label)}</legend>`));
  const pills = form.match(/<label class="pill">[^]*?<\/label>/g) || [];
  assert.deepEqual(pills.map((pill) => pill.match(/value="([^"]+)"/)[1]), [...content.pricing.tiers.map((tier) => tier.name), 'unsure']);
  assert.ok(pills[3].includes(`<span>${esc(f.tier_unsure_label)}</span>`));
  for (const pill of pills) assert.ok(pill.includes('type="radio" name="tier"') && pill.includes('aria-describedby="reg-tier-error"') && !pill.includes('checked'));
  assert.ok(form.includes('<input type="checkbox" name="newsletter" value="yes">') && !/name="newsletter"[^>]*checked/.test(form), 'the newsletter box is empty by default');
  assert.ok(form.includes(`<span>${esc(f.newsletter_label)}</span>`));
  assert.ok(form.includes('<div class="register__trap" aria-hidden="true"><input type="text" name="website" tabindex="-1" autocomplete="off"></div>'));
  assert.ok(form.includes('<p class="register__send-error" role="alert" hidden></p>'));
  assert.ok(form.includes(`<button class="btn register__submit" type="submit">${esc(f.submit_label)}</button> <span class="tag tag--todo">TODO</span>`), 'TODO beside the button while the endpoint is empty');
  assert.ok(form.includes(`${esc(f.data_note)} <a href="#">${esc(f.privacy_label)}</a> <span class="tag tag--todo">TODO</span>`), 'the privacy link waits for its address');
  for (const [attr, value] of [['data-endpoint', ''], ['data-error-required', f.error_required], ['data-error-email', f.error_email], ['data-error-tier', f.error_tier], ['data-error-send', f.error_send], ['data-sending', f.sending_label], ['data-success-heading', f.success_heading], ['data-not-connected', NOT_CONNECTED]]) {
    assert.ok(form.includes(` ${attr}="${esc(value)}"`), attr);
  }
  assert.ok(html.includes('<div class="register__success" id="register-success" hidden aria-live="polite">'));
  assert.ok(html.includes('<p class="register__success-heading" tabindex="-1"></p>'));
  assert.ok(html.includes(`<p class="register__success-text">${esc(f.success_text)}</p>`));
  assert.ok(html.includes('class="closing__text"') && html.indexOf('class="closing__text"') < html.indexOf('id="register"'), 'the form stands under the closing text');
  // a connected form: no TODO beside the button, the privacy link opens in a new tab
  const connected = render({ ...content, register: { ...r, endpoint_url: 'https://script.google.com/macros/s/abc/exec', privacy_url: 'https://programme.juliakrylova.com/privacy/' } });
  assert.ok(connected.includes('data-endpoint="https://script.google.com/macros/s/abc/exec"'));
  assert.ok(!connected.includes('tag--todo'));
  assert.ok(connected.includes(`<a href="https://programme.juliakrylova.com/privacy/" target="_blank" rel="noopener">${esc(f.privacy_label)}</a>`));
});
