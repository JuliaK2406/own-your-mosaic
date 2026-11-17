import test from 'node:test';
import assert from 'node:assert/strict';
import { loadContent, loadRaw, listPhotos, checkContent, findDrafts, report } from '../src/check.mjs';

const content = await loadContent();
const raw = await loadRaw();
const photos = await listPhotos();
const copy = () => structuredClone(content);
const errorsOf = (c) => checkContent(c, { photos }).errors;
const hasError = (errors, at) => errors.some((error) => error.startsWith(`${at}:`));

const DRAFTS = [];   // every draft mark was lifted on 16 November; the mechanism stays for later texts

test('the real content file passes: no errors, no long dashes; the only TODO is the empty site_url', () => {
  const result = checkContent(content, { photos, raw });
  assert.deepEqual(result.errors, []);
  assert.deepEqual(result.warnings, []);
  assert.deepEqual(result.todos, ['meta.site_url (empty)']);
  assert.equal(report(content, result).ok, true);
});

test('drafts: no mark is left in the yaml since 16 November; a mark on a key or a list still resolves, with its note', () => {
  const { drafts, problems } = findDrafts(raw, content);
  assert.deepEqual(problems, []);
  assert.deepEqual(drafts.map((draft) => draft.path), DRAFTS);
  assert.ok(!raw.includes('# draft'));
  const marked = raw
    .replace('heading: "The shift we work toward"', 'heading: "The shift we work toward"   # draft: a heading of ours')
    .replace('\n  items:\n    - { title: "8 live sessions"', '\n  items:   # draft\n    - { title: "8 live sessions"');
  const again = findDrafts(marked, content);
  assert.deepEqual(again.problems, []);
  assert.deepEqual(again.drafts.map((draft) => draft.path), ['shift.heading', 'package.items']);
  assert.equal(again.drafts[0].note, 'a heading of ours');
  assert.equal(again.drafts[1].value.length, 6, 'the whole list is one draft');
  assert.ok(!('tagline' in content.hero) && !('subtitle' in content.hero) && !('opening' in content.hero), 'the first screen carries the three lines of 17 Nov and the supporting copy, no tagline, no subtitle');
  assert.ok(!('problem' in content), 'the Problem band left on 17 Nov');
});

test('a draft marker that does not resolve to a value is a problem, not silently dropped', () => {
  const { drafts, problems } = findDrafts('hero:\n  nothing: "x"   # draft\n', { hero: {} });
  assert.equal(drafts.length, 0);
  assert.equal(problems.length, 1);
  assert.ok(problems[0].includes('hero.nothing'));
});

test('exact counts: 3 hero lines, 4 who, 4 shift, 4 inputs, 4 outcomes, 3 levels, 6 package items, 3 tiers with at least one item, 3 approach items, 3 cards, 4 steps, 6 questions, 3 facts', () => {
  const cases = [
    ['hero.lines', (c) => c.hero.lines.pop()],
    ['pricing.tiers[1].items', (c) => { c.pricing.tiers[1].items = []; }],
    ['who.items', (c) => c.who.items.pop()],
    ['shift.items', (c) => c.shift.items.pop()],
    ['promise.inputs', (c) => c.promise.inputs.push('Extra')],
    ['promise.outcomes', (c) => c.promise.outcomes.pop()],
    ['process.levels', (c) => c.process.levels.pop()],
    ['package.items', (c) => c.package.items.push({ title: 'Extra', text: 'x' })],
    ['pricing.tiers', (c) => c.pricing.tiers.pop()],
    ['approach.items', (c) => c.approach.items.pop()],
    ['logistics.cards', (c) => c.logistics.cards.pop()],
    ['logistics.timeline', (c) => c.logistics.timeline.pop()],
    ['faq.items', (c) => c.faq.items.pop()],
    ['hero.facts', (c) => c.hero.facts.pop()],
  ];
  for (const [at, change] of cases) {
    const c = copy();
    change(c);
    const errors = errorsOf(c);
    assert.ok(hasError(errors, at), `${at}: ${errors.join('; ')}`);
  }
});

test('an empty text is reported with its path; site_url, photo_alt, a tier\'s spots and a step\'s date may be empty; a missing field or block is reported', () => {
  const c = copy();
  c.who.items[1].text = '   ';
  assert.ok(hasError(errorsOf(c), 'who.items[1].text'));
  const d = copy();
  d.pricing.tiers[2].price = '';
  assert.ok(hasError(errorsOf(d), 'pricing.tiers[2].price'));
  const e = copy();
  e.meta.site_url = '';
  e.hero.photo_alt = '';
  e.proof.photo_alt = '';
  e.pricing.tiers[1].spots = '';
  e.logistics.timeline[2].when = '';
  assert.deepEqual(errorsOf(e), []);
  assert.equal(content.pricing.tiers[0].spots, '', 'Core has no spots line');
  assert.equal(content.logistics.timeline[1].when, '', 'the payment step carries no date (Julia, 16 Nov)');
  assert.equal(content.logistics.timeline[1].title, 'Payment');
  const f = copy();
  delete f.shift;
  assert.ok(hasError(errorsOf(f), 'shift'));
  const g = copy();
  delete g.logistics.timeline[3].text;
  assert.ok(hasError(errorsOf(g), 'logistics.timeline[3].text'));
  const h = copy();
  delete h.process.levels[1].weeks;
  assert.ok(hasError(errorsOf(h), 'process.levels[1].weeks'));
  const i = copy();
  i.hero.lines[1] = '';
  assert.ok(hasError(errorsOf(i), 'hero.lines[1]'));
  const l = copy();
  l.pricing.invoice_note = '';
  assert.ok(hasError(errorsOf(l), 'pricing.invoice_note'));
  const j = copy();
  j.faq.items[5].a = '';
  assert.ok(hasError(errorsOf(j), 'faq.items[5].a'));
  const k = copy();
  delete k.closing.line;
  assert.ok(hasError(errorsOf(k), 'closing.line'));
});

test('photos named in the yaml must exist in content/photos; the two group photos and their descriptions are required', () => {
  const c = copy();
  c.proof.photo = 'missing.jpg';
  assert.ok(hasError(checkContent(c, { photos }).errors, 'proof.photo'));
  for (const field of ['mentoring_photo', 'group_photo']) {
    const e = copy();
    e.proof[field] = 'nobody.jpg';
    assert.ok(hasError(checkContent(e, { photos }).errors, `proof.${field}`), `${field} must exist`);
    const f = copy();
    f.proof[`${field}_alt`] = '';
    assert.ok(hasError(errorsOf(f), `proof.${field}_alt`), `${field}_alt may not be empty`);
    const g = copy();
    delete g.proof[field];
    assert.ok(hasError(errorsOf(g), `proof.${field}`), `${field} is required`);
  }
  assert.ok(photos.has(content.proof.mentoring_photo) && photos.has(content.proof.group_photo));
  assert.deepEqual(checkContent(c, {}).errors, [], 'without the photo list the names are not checked');
  const d = copy();
  d.hero.photo = 'photos/julia.jpg';
  assert.ok(hasError(errorsOf(d), 'hero.photo'));
});

test('a long dash is a warning with the path of the field, not an error', () => {
  const c = copy();
  c.shift.after_label = 'After 8 weeks \u2014 whole';
  c.who.items[0].text = 'On paper \u2013 and in life.';
  const result = checkContent(c, { photos });
  assert.deepEqual(result.errors, []);
  assert.deepEqual(result.warnings, ['who.items[0].text: contains a long dash', 'shift.after_label: contains a long dash']);
});

test('published: true with a TODO or a draft left stops the build', () => {
  const c = copy();
  c.meta.published = true;
  const withTodo = report(c, checkContent(c, { photos }));   // site_url is still empty
  assert.equal(withTodo.ok, false);
  assert.ok(withTodo.lines.some((line) => line.includes('TODO markers remain')));
  const d = copy();
  d.meta.published = true;
  d.meta.site_url = 'https://program.juliakrylova.com';
  assert.equal(report(d, checkContent(d, { photos })).ok, true, 'no TODO left and no draft markers known: ok');
  assert.equal(report(d, checkContent(d, { photos, raw })).ok, true, 'the real yaml carries no draft mark any more');
  const marked = raw.replace('heading: "The shift we work toward"', 'heading: "The shift we work toward"   # draft');
  const withDrafts = report(d, checkContent(d, { photos, raw: marked }));
  assert.equal(withDrafts.ok, false);
  assert.ok(withDrafts.lines.some((line) => line.includes('draft markers remain')));
});

test('addresses: main_site must be a full address, site_url empty or https; published must be true or false', () => {
  const c = copy();
  c.links.main_site = 'juliakrylova.com';
  assert.ok(hasError(errorsOf(c), 'links.main_site'));
  const d = copy();
  d.meta.site_url = 'http://program.juliakrylova.com';
  assert.ok(hasError(errorsOf(d), 'meta.site_url'));
  const e = copy();
  e.meta.site_url = 'https://program.juliakrylova.com';
  assert.deepEqual(errorsOf(e), []);
  const f = copy();
  f.meta.published = 'yes';
  assert.ok(hasError(errorsOf(f), 'meta.published'));
});

test('register: the label is required, the address must be a full https:// one', () => {
  const c = copy();
  c.register.url = '';
  assert.ok(hasError(errorsOf(c), 'register.url'), 'empty address');
  c.register.url = 'http://calendly.com/juliakrylova/30min';
  assert.ok(hasError(errorsOf(c), 'register.url'), 'http is not enough');
  c.register.url = 'https://calendly.com/juliakrylova/30min?month=2027-01';
  assert.deepEqual(errorsOf(c), [], 'an https address with its own parameters passes');
  const d = copy();
  d.register.label = '  ';
  assert.ok(hasError(errorsOf(d), 'register.label'));
  assert.deepEqual(checkContent(copy(), { photos }).todos, ['meta.site_url (empty)'], 'nothing about the button is a TODO');
});

test('deposit and quotes: the deposit needs a lead, a label, a note and an https address; every quote names its block in "at" and carries paragraphs, a name, a role and a company', () => {
  const c = copy();
  c.deposit.url = 'http://buy.stripe.com/x';
  assert.ok(hasError(errorsOf(c), 'deposit.url'), 'http is not enough');
  const d = copy();
  d.deposit.note = '';
  assert.ok(hasError(errorsOf(d), 'deposit.note'));
  const e = copy();
  e.quotes[0].text = 'not a list';
  assert.ok(hasError(errorsOf(e), 'quotes[0].text'));
  const f = copy();
  delete f.quotes[1].at;
  assert.ok(hasError(errorsOf(f), 'quotes[1].at'));
  assert.equal(content.quotes.length, 5);
  assert.deepEqual(content.quotes.map((q) => q.text.length), [1, 1, 1, 1, 2], 'Angela keeps her two paragraphs; Ally lost her last sentence on 17 Nov');
  assert.deepEqual(content.quotes.map((q) => q.at), ['process', 'bridge', 'package', 'package', 'logistics'], 'since 17 Nov Kateryna stands in the Method, Anna in the bridge, two under What\'s included, none in the Roadmap');
  assert.ok(content.quotes.every((q) => q.text.join(' ').includes('**')), 'every quote carries its bold phrase');
  assert.deepEqual(checkContent(copy(), { photos }).todos, ['meta.site_url (empty)']);
});
