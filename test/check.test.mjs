import test from 'node:test';
import assert from 'node:assert/strict';
import { loadContent, loadRaw, listPhotos, checkContent, findDrafts, report } from '../src/check.mjs';

const content = await loadContent();
const raw = await loadRaw();
const photos = await listPhotos();
const copy = () => structuredClone(content);
const errorsOf = (c) => checkContent(c, { photos }).errors;
const hasError = (errors, at) => errors.some((error) => error.startsWith(`${at}:`));

const DRAFTS = ['who.items', 'shift.heading', 'promise.diagram', 'package.stats', 'proof.stats', 'proof.shift_visual', 'proof.quotes', 'logistics.cards', 'logistics.timeline'];

test('the real content file passes: no errors, no long dashes; the only TODO is the empty site_url', () => {
  const result = checkContent(content, { photos, raw });
  assert.deepEqual(result.errors, []);
  assert.deepEqual(result.warnings, []);
  assert.deepEqual(result.todos, ['meta.site_url (empty)']);
  assert.equal(report(content, result).ok, true);
});

test('drafts: the nine groups marked in the yaml, with their notes; the approved headings, the name and the spots lines carry none', () => {
  const { drafts, problems } = findDrafts(raw, content);
  assert.deepEqual(problems, []);
  assert.deepEqual(drafts.map((draft) => draft.path), DRAFTS);
  assert.equal(drafts[0].value.length, 4, 'the whole who list is one draft');
  assert.ok(drafts[0].note.startsWith('the short titles come from'));
  assert.deepEqual(drafts[2].value.inputs, content.promise.diagram.inputs);
  assert.deepEqual(drafts[5].value.from, content.proof.shift_visual.from);
  assert.equal(drafts[8].value.length, 4);
  for (const at of ['hero.name', 'proof.heading', 'logistics.heading', 'pricing.total_spots', 'pricing.tiers[1].spots', 'pricing.tiers[2].spots']) assert.ok(!drafts.some((draft) => draft.path === at), `${at} is approved`);
  assert.ok(!('intro' in content.promise), 'the Promise intro left with the Problem repetition');
});

test('a draft marker that does not resolve to a value is a problem, not silently dropped', () => {
  const { drafts, problems } = findDrafts('hero:\n  nothing: "x"   # draft\n', { hero: {} });
  assert.equal(drafts.length, 0);
  assert.equal(problems.length, 1);
  assert.ok(problems[0].includes('hero.nothing'));
});

test('exact counts: 4 who, 4 shift, 4 inputs, 4 outcomes, 3 levels, 4 package stats, 8 package items, 3 tiers, 2 proof stats, 5 strengths, 3 from, 3 cards, 4 steps, 3 facts', () => {
  const cases = [
    ['who.items', (c) => c.who.items.pop()],
    ['shift.items', (c) => c.shift.items.pop()],
    ['promise.diagram.inputs', (c) => c.promise.diagram.inputs.push('Extra')],
    ['promise.outcomes', (c) => c.promise.outcomes.pop()],
    ['process.levels', (c) => c.process.levels.pop()],
    ['package.stats', (c) => c.package.stats.pop()],
    ['package.items', (c) => c.package.items.push('Extra')],
    ['pricing.tiers', (c) => c.pricing.tiers.pop()],
    ['proof.stats', (c) => c.proof.stats.push({ value: '1', label: 'x' })],
    ['proof.strengths', (c) => c.proof.strengths.pop()],
    ['proof.shift_visual.from', (c) => c.proof.shift_visual.from.pop()],
    ['logistics.cards', (c) => c.logistics.cards.pop()],
    ['logistics.timeline', (c) => c.logistics.timeline.pop()],
    ['hero.facts', (c) => c.hero.facts.pop()],
  ];
  for (const [at, change] of cases) {
    const c = copy();
    change(c);
    const errors = errorsOf(c);
    assert.ok(hasError(errors, at), `${at}: ${errors.join('; ')}`);
  }
});

test('an empty text is reported with its path; site_url, photo_alt and a tier\'s spots may be empty; a missing field or block is reported', () => {
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
  assert.deepEqual(errorsOf(e), []);
  assert.equal(content.pricing.tiers[0].spots, '', 'Core has no spots line');
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
  i.hero.tagline = '';
  assert.ok(hasError(errorsOf(i), 'hero.tagline'));
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
  c.problem.statement = 'The ambition is real \u2014 and it stays.';
  c.who.items[0].text = 'On paper \u2013 and in life.';
  const result = checkContent(c, { photos });
  assert.deepEqual(result.errors, []);
  assert.deepEqual(result.warnings, ['who.items[0].text: contains a long dash', 'problem.statement: contains a long dash']);
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
  const withDrafts = report(d, checkContent(d, { photos, raw }));
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
