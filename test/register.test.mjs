import test from 'node:test';
import assert from 'node:assert/strict';
import { validate, buildPayload, sanitizeSrc, readSrc, isTrap, fillName, sendPayload, FORM_NAME, PAYLOAD_VERSION, TIER_UNSURE } from '../src/app/register-core.js';

const texts = { error_required: 'Please fill in this field.', error_email: 'Please enter a valid email address.', error_tier: 'Please choose an option.' };
const tiers = ['Core', 'Plus', 'Premium', TIER_UNSURE];
const good = { first_name: ' Anna ', last_name: 'Smith', email: 'anna@example.com', tier: 'Core', message: '', newsletter: false, website: '' };
const errorsOf = (patch) => validate({ ...good, ...patch }, texts, tiers).errors;

test('a good registration passes; an empty one fails on first name, last name, email and tier', () => {
  assert.deepEqual(validate(good, texts, tiers), { ok: true, errors: {} });
  const { ok, errors } = validate({ first_name: '', last_name: '', email: '', tier: '', message: '', newsletter: false, website: '' }, texts, tiers);
  assert.equal(ok, false);
  assert.deepEqual(errors, { first_name: texts.error_required, last_name: texts.error_required, email: texts.error_required, tier: texts.error_tier });
});

test('names: spaces only count as empty, 61 characters fail, 60 pass', () => {
  assert.equal(errorsOf({ first_name: '   ' }).first_name, texts.error_required);
  assert.equal(errorsOf({ last_name: '\t' }).last_name, texts.error_required);
  assert.equal(errorsOf({ first_name: 'a'.repeat(61) }).first_name, texts.error_required);
  assert.deepEqual(errorsOf({ first_name: 'a'.repeat(60), last_name: 'b'.repeat(60) }), {});
  assert.deepEqual(errorsOf({ first_name: '  Anna-Maria  ' }), {});
});

test('email: empty is required, a bad shape or more than 254 characters is invalid, a plain good one passes', () => {
  assert.equal(errorsOf({ email: '' }).email, texts.error_required);
  for (const bad of ['anna', 'anna@', 'anna@example', '@example.com', 'anna smith@example.com', 'anna@exa mple.com', `${'a'.repeat(250)}@example.com`]) {
    assert.equal(errorsOf({ email: bad }).email, texts.error_email, bad);
  }
  for (const fine of ['anna@example.com', ' Anna.Smith+news@sub.example.co.uk ', 'a@b.cd']) assert.deepEqual(errorsOf({ email: fine }), {}, fine);
});

test('tier: required and one of the offered values; message: optional, at most 1000 characters', () => {
  assert.equal(errorsOf({ tier: '' }).tier, texts.error_tier);
  assert.equal(errorsOf({ tier: 'Gold' }).tier, texts.error_tier);
  assert.deepEqual(errorsOf({ tier: TIER_UNSURE }), {});
  assert.deepEqual(errorsOf({ message: 'x'.repeat(1000) }), {});
  assert.equal(errorsOf({ message: 'x'.repeat(1001) }).message, texts.error_required);
  assert.deepEqual(validate({ ...good, tier: 'Anything' }, texts).errors, {}, 'without a list of tiers any non-empty tier passes');
});

test('the registration: trimmed texts, the unsure tier, newsletter false by default, a cleaned src, version and form name', () => {
  const now = new Date('2026-10-21T10:00:00.000Z');
  const payload = buildPayload({ first_name: ' Anna ', last_name: ' Smith', email: ' anna@example.com ', tier: TIER_UNSURE, message: '  hello  ', website: '' }, { now, src: 'Workshop_Nov!' });
  assert.deepEqual(payload, {
    version: PAYLOAD_VERSION,
    form: FORM_NAME,
    submitted_at: '2026-10-21T10:00:00.000Z',
    first_name: 'Anna',
    last_name: 'Smith',
    email: 'anna@example.com',
    tier: 'unsure',
    message: 'hello',
    newsletter: false,
    src: 'workshop_nov',
  });
  assert.equal(PAYLOAD_VERSION, 1);
  assert.equal(FORM_NAME, 'own-your-mosaic-pilot');
  assert.equal(buildPayload({ ...good, newsletter: true }, { now }).newsletter, true);
  assert.equal(buildPayload({ ...good, newsletter: 'yes' }, { now }).newsletter, true);
  assert.deepEqual(Object.keys(buildPayload(good, { now })), ['version', 'form', 'submitted_at', 'first_name', 'last_name', 'email', 'tier', 'message', 'newsletter', 'src']);
});

test('src: lower case, only a-z 0-9 - _, at most 40 characters; read from the query', () => {
  assert.equal(sanitizeSrc('Workshop_Nov!'), 'workshop_nov');
  assert.equal(sanitizeSrc('Test_QR!'), 'test_qr');
  assert.equal(sanitizeSrc('a'.repeat(50)), 'a'.repeat(40));
  assert.equal(sanitizeSrc(''), '');
  assert.equal(sanitizeSrc(null), '');
  assert.equal(readSrc('?src=Test_QR!'), 'test_qr');
  assert.equal(readSrc('?other=1'), '');
  assert.equal(readSrc(''), '');
});

test('the bot trap: a filled website field means no sending', () => {
  assert.equal(isTrap(good), false);
  assert.equal(isTrap({ ...good, website: 'http://spam.example' }), true);
  assert.equal(isTrap({ ...good, website: '   ' }), false);
});

test('the thank-you heading takes the name as text, whatever it contains', () => {
  assert.equal(fillName('Thank you, {name}', 'Anna'), 'Thank you, Anna');
  assert.equal(fillName('Thank you, {name}', '$& <b>'), 'Thank you, $& <b>');
  assert.equal(fillName('No placeholder', 'Anna'), 'No placeholder');
});

test('sending: one POST with the registration as text, true when it completes, false when it fails or there is no address', async () => {
  const calls = [];
  const okFetch = (url, options) => { calls.push({ url, options }); return Promise.resolve({ ok: true }); };
  const payload = buildPayload(good, { now: new Date('2026-10-21T10:00:00.000Z') });
  assert.equal(await sendPayload(payload, 'https://script.google.com/macros/s/abc/exec', okFetch), true);
  assert.equal(calls.length, 1);
  assert.equal(calls[0].url, 'https://script.google.com/macros/s/abc/exec');
  assert.equal(calls[0].options.method, 'POST');
  assert.equal(calls[0].options.mode, 'no-cors');
  assert.equal(calls[0].options.keepalive, true);
  assert.equal(calls[0].options.headers['Content-Type'], 'text/plain;charset=utf-8');
  assert.deepEqual(JSON.parse(calls[0].options.body), payload);
  assert.equal(await sendPayload(payload, 'https://example.com/dead', () => Promise.reject(new TypeError('Failed to fetch'))), false);
  assert.equal(await sendPayload(payload, '', okFetch), false);
  assert.equal(await sendPayload(payload, '   ', okFetch), false);
  assert.equal(calls.length, 1, 'no address, no request');
});
