import test from 'node:test';
import assert from 'node:assert/strict';
import { loadContent, loadRaw, listPhotos, checkContent, findDrafts, report } from '../src/check.mjs';

const content = await loadContent();
const raw = await loadRaw();
const photos = await listPhotos();
const copy = () => structuredClone(content);
const errorsOf = (c) => checkContent(c, { photos }).errors;
const hasError = (errors, at) => errors.some((error) => error.startsWith(`${at}:`));

test('the real content file passes: no errors, no long dashes; the TODO list is the button address and the empty site_url', () => {
  const result = checkContent(content, { photos, raw });
  assert.deepEqual(result.errors, []);
  assert.deepEqual(result.warnings, []);
  assert.deepEqual(result.todos, ['register.url', 'meta.site_url (empty)']);
  assert.equal(report(content, result).ok, true);
});

test('drafts: the name on the first screen, the Promise diagram, the headings of Proof and Practical details, the whole quotes list', () => {
  const { drafts, problems } = findDrafts(raw, content);
  assert.deepEqual(problems, []);
  assert.deepEqual(drafts.map((draft) => draft.path), ['hero.name', 'promise.diagram', 'proof.heading', 'proof.quotes', 'logistics.heading']);
  assert.equal(drafts[0].value, content.hero.name);
  assert.deepEqual(drafts[1].value.inputs, content.promise.diagram.inputs, 'the whole diagram is one draft');
  assert.ok(drafts[1].note.startsWith('labels taken word for word'));
  assert.equal(drafts[3].value.length, content.proof.quotes.length);
  assert.ok(drafts[3].note.startsWith('two quotes'));
  assert.equal(drafts[4].value, content.logistics.heading);
});

test('a draft marker that does not resolve to a value is a problem, not silently dropped', () => {
  const { drafts, problems } = findDrafts('hero:\n  nothing: "x"   # draft\n', { hero: {} });
  assert.equal(drafts.length, 0);
  assert.equal(problems.length, 1);
  assert.ok(problems[0].includes('hero.nothing'));
});

test('exact counts: four who items, three levels, eight package items, three tiers, seven logistics rows', () => {
  const cases = [
    ['who.items', (c) => c.who.items.pop()],
    ['process.levels', (c) => c.process.levels.pop()],
    ['package.items', (c) => c.package.items.push('Extra')],
    ['pricing.tiers', (c) => c.pricing.tiers.pop()],
    ['logistics.items', (c) => c.logistics.items.pop()],
  ];
  for (const [at, change] of cases) {
    const c = copy();
    change(c);
    const errors = errorsOf(c);
    assert.ok(hasError(errors, at), `${at}: ${errors.join('; ')}`);
  }
});

test('an empty text is reported with its path; site_url and photo_alt may be empty; a missing block is reported', () => {
  const c = copy();
  c.who.items[1] = '   ';
  assert.ok(hasError(errorsOf(c), 'who.items[1]'));
  const d = copy();
  d.pricing.tiers[2].price = '';
  assert.ok(hasError(errorsOf(d), 'pricing.tiers[2].price'));
  const e = copy();
  e.meta.site_url = '';
  e.hero.photo_alt = '';
  e.proof.photo_alt = '';
  assert.deepEqual(errorsOf(e), []);
  const f = copy();
  delete f.closing;
  assert.ok(hasError(errorsOf(f), 'closing'));
  const g = copy();
  delete g.logistics.items[3].value;
  assert.ok(hasError(errorsOf(g), 'logistics.items[3].value'));
});

test('photos named in the yaml must exist in content/photos', () => {
  const c = copy();
  c.proof.photo = 'missing.jpg';
  assert.ok(hasError(checkContent(c, { photos }).errors, 'proof.photo'));
  assert.deepEqual(checkContent(c, {}).errors, [], 'without the photo list the names are not checked');
  const d = copy();
  d.hero.photo = 'photos/julia.jpg';
  assert.ok(hasError(errorsOf(d), 'hero.photo'));
});

test('the Promise diagram: exactly four inputs and three outcomes, labels and result present', () => {
  const c = copy();
  c.promise.diagram.inputs.pop();
  assert.ok(hasError(errorsOf(c), 'promise.diagram.inputs'));
  const d = copy();
  d.promise.diagram.outcomes.push('Extra');
  assert.ok(hasError(errorsOf(d), 'promise.diagram.outcomes'));
  const e = copy();
  e.promise.diagram.result = '';
  assert.ok(hasError(errorsOf(e), 'promise.diagram.result'));
  const f = copy();
  delete f.promise.diagram;
  assert.ok(hasError(errorsOf(f), 'promise.diagram'));
});

test('a long dash is a warning with the path of the field, not an error', () => {
  const c = copy();
  c.problem.statement = 'The ambition is real \u2014 and it stays.';
  c.who.items[0] = 'On paper \u2013 and in life.';
  const result = checkContent(c, { photos });
  assert.deepEqual(result.errors, []);
  assert.deepEqual(result.warnings, ['who.items[0]: contains a long dash', 'problem.statement: contains a long dash']);
});

test('published: true with a TODO or a draft left stops the build', () => {
  const c = copy();
  c.meta.published = true;
  const withTodo = report(c, checkContent(c, { photos }));
  assert.equal(withTodo.ok, false);
  assert.ok(withTodo.lines.some((line) => line.includes('TODO markers remain')));
  const d = copy();
  d.meta.published = true;
  d.register.url = 'https://calendly.com/example/30min';
  d.meta.site_url = 'https://programme.juliakrylova.com';
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
  d.meta.site_url = 'http://programme.juliakrylova.com';
  assert.ok(hasError(errorsOf(d), 'meta.site_url'));
  const e = copy();
  e.meta.site_url = 'https://programme.juliakrylova.com';
  assert.deepEqual(errorsOf(e), []);
  const f = copy();
  f.meta.published = 'yes';
  assert.ok(hasError(errorsOf(f), 'meta.published'));
});
