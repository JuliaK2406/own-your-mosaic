// Browser checks of the registration form through Playwright (npm run verify:form).
// Run after npm run build.
//   1. The real build (endpoint empty), at 390 and 1440: the first-screen button scrolls to the
//      form; an empty submission shows the errors and puts the focus on the first name; a
//      filled form shows the thank-you with the TODO tag; not one network request after the
//      page has loaded. Screenshots: the band with the empty form, the form with errors, the
//      thank-you, plus 390-full.
//   2. A temporary build whose endpoint is this server's /__endpoint, at 1440: exactly one POST
//      with the right body, a double click still one request, ?src=Test_QR! arrives as test_qr.
//   3. A temporary build with a dead endpoint: error_send is shown, the fields keep their
//      values, the button works again.
//   4. Keyboard only, on the real build: Tab through the fields, arrows for the tier, Enter sends.
// Output folder: ../screenshots 03 - форма/ (override with --out).
// --live <url>: part 1 only, against that address, screenshots prefixed live-.

import { mkdir, mkdtemp, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright';
import { ROOT, loadContent } from '../src/check.mjs';
import { build } from '../src/build.mjs';
import { NOT_CONNECTED } from '../src/render/page.mjs';
import { startServer, PREVIEW_BASE } from './serve.mjs';

const DEFAULT_OUT_DIR = path.resolve(ROOT, '..', 'screenshots 03 - форма');
const content = await loadContent();
const f = content.register.form;
const PERSON = { first: 'Anna', last: 'Smith', email: 'anna@example.com' };
const VIEWPORTS = {
  390: { width: 390, height: 844, deviceScaleFactor: 2, isMobile: true, hasTouch: true },
  1440: { width: 1440, height: 900, deviceScaleFactor: 1, isMobile: false, hasTouch: false },
};
const SETTLE = 250;

const problems = [];
const notes = [];
function expect(condition, message) {
  if (!condition) problems.push(message);
  console.log(`  ${condition ? 'ok' : 'PROBLEM'}  ${message}`);
}

async function open(browser, base, name, query = '') {
  const vp = VIEWPORTS[name];
  const context = await browser.newContext({ viewport: { width: vp.width, height: vp.height }, deviceScaleFactor: vp.deviceScaleFactor, isMobile: vp.isMobile, hasTouch: vp.hasTouch });
  const page = await context.newPage();
  const requests = [];
  page.on('request', (request) => requests.push({ url: request.url(), method: request.method(), body: request.postData() }));
  await page.goto(`${base}${query}`, { waitUntil: 'networkidle' });
  await page.evaluate(() => document.fonts.ready);
  const loaded = requests.length;
  return { context, page, afterLoad: () => requests.slice(loaded) };
}

async function fillForm(page, { tier = 'Core', newsletter = false, message = '' } = {}) {
  await page.fill('#reg-first-name', PERSON.first);
  await page.fill('#reg-last-name', PERSON.last);
  await page.fill('#reg-email', PERSON.email);
  await page.locator('label.pill', { has: page.locator(`input[value="${tier}"]`) }).click();
  if (message) await page.fill('#reg-message', message);
  if (newsletter) await page.locator('label.check').click();
}

const state = (page) => page.evaluate(() => ({
  errors: [...document.querySelectorAll('.field__error')].map((node) => node.textContent).filter(Boolean),
  active: document.activeElement && (document.activeElement.id || document.activeElement.name || document.activeElement.className),
  formHidden: document.getElementById('register-form').getClientRects().length === 0,
  successHidden: document.getElementById('register-success').getClientRects().length === 0,
  namesSideBySide: (() => { const [a, b] = document.querySelectorAll('.register__names .field'); return Math.abs(a.getBoundingClientRect().top - b.getBoundingClientRect().top) < 2; })(),
  successHeading: document.querySelector('.register__success-heading').textContent,
  successTag: (document.querySelector('.register__success-heading .tag--todo') || {}).textContent || '',
  sendError: document.querySelector('.register__send-error').hidden ? '' : document.querySelector('.register__send-error').textContent,
  buttonDisabled: document.querySelector('.register__submit').disabled,
  buttonText: document.querySelector('.register__submit').textContent,
  firstName: document.getElementById('reg-first-name').value,
  registerTop: Math.round(document.getElementById('register').getBoundingClientRect().top),
}));

// Part 1: the form without an endpoint (the real build or the live page).
async function emptyEndpointPass(browser, base, name, outDir, prefix) {
  console.log(`\n${prefix}${name}: the form without an endpoint`);
  const { context, page, afterLoad } = await open(browser, base, name);
  const vp = VIEWPORTS[name];
  if (name === '390' && !prefix) await page.screenshot({ path: path.join(outDir, '390-full.png'), fullPage: true });
  await page.locator('.closing').screenshot({ path: path.join(outDir, `${prefix}${name}-form.png`) });
  await page.locator('.hero .btn').click();
  // the page scrolls smoothly: wait until the form has arrived, up to four seconds
  await page.waitForFunction(() => { const top = document.getElementById('register').getBoundingClientRect().top; return top >= 0 && top < window.innerHeight; }, null, { timeout: 4000 }).catch(() => {});
  await page.waitForTimeout(SETTLE);
  let s = await state(page);
  expect(s.registerTop >= 0 && s.registerTop < vp.height, `the first-screen button brings the form into view (top at ${s.registerTop} px)`);
  expect(s.namesSideBySide === (name === '1440'), `first and last name ${name === '1440' ? 'side by side' : 'under each other'} at ${name}`);
  expect(!/^reg-/.test(s.active || ''), `no field took the focus on arrival (active: ${s.active})`);
  await page.locator('.register__submit').click();
  await page.waitForTimeout(SETTLE);
  s = await state(page);
  expect(s.errors.length === 4, `an empty submission shows ${s.errors.length} messages: ${s.errors.join(' | ')}`);
  expect(s.active === 'reg-first-name', `the focus goes to the first name (active: ${s.active})`);
  await page.locator('.closing').screenshot({ path: path.join(outDir, `${prefix}${name}-form-errors.png`) });
  await page.fill('#reg-first-name', PERSON.first);
  await page.waitForTimeout(100);
  s = await state(page);
  expect(s.errors.length === 3, `the error of a corrected field disappears (${s.errors.length} left)`);
  await fillForm(page, { tier: 'Plus' });
  await page.locator('.register__submit').click();
  await page.waitForTimeout(SETTLE);
  s = await state(page);
  expect(s.formHidden && !s.successHidden, 'the thank-you replaces the form');
  expect(s.successHeading.startsWith(f.success_heading.replace('{name}', PERSON.first)), `the thank-you names the person: "${s.successHeading}"`);
  expect(s.successTag === NOT_CONNECTED, `the TODO tag says "${s.successTag}"`);
  expect(s.active === 'register__success-heading' || s.active === '', `the focus moves to the thank-you (active: ${s.active})`);
  await page.locator('.closing').screenshot({ path: path.join(outDir, `${prefix}${name}-form-success.png`) });
  // the browser may still fetch the page's own lazy photo while scrolling; nothing else may happen
  const asset = (r) => r.method === 'GET' && r.url.startsWith(base) && /\.(webp|jpg|woff2|css|js|svg|png)$/.test(r.url.split('?')[0]);
  const requests = afterLoad().filter((r) => !asset(r));
  expect(requests.length === 0, `no network request after the page loaded, apart from the page's own files (${requests.length}: ${requests.map((r) => `${r.method} ${r.url}`).join(', ')})`);
  const lazy = afterLoad().filter(asset);
  if (lazy.length) console.log(`  note  the browser loaded ${lazy.length} of the page's own files while scrolling: ${lazy.map((r) => r.url.replace(base, '')).join(', ')}`);
  await context.close();
}

// Part 2: a build that sends to this server's /__endpoint.
async function localEndpointPass(browser, serverUrl, dir) {
  console.log('\n1440: sending to the local endpoint');
  const endpoint = `${serverUrl}/__endpoint`;
  await fetch(`${endpoint}?clear=1`);
  const base = `${serverUrl}${PREVIEW_BASE}/`;
  const { context, page, afterLoad } = await open(browser, base, '1440', '?src=Test_QR!');
  await fillForm(page, { tier: 'Premium', newsletter: true, message: '  Looking forward  ' });
  // two clicks in a row: the second finds the button disabled
  await page.evaluate(() => { const button = document.querySelector('.register__submit'); button.click(); button.click(); });
  await page.waitForTimeout(600);
  const s = await state(page);
  expect(s.formHidden && !s.successHidden && s.successTag === '', 'the thank-you without a TODO tag once the request completed');
  const posts = afterLoad().filter((r) => r.method === 'POST');
  expect(posts.length === 1 && posts[0].url === endpoint, `exactly one POST to the endpoint (${posts.length})`);
  const received = await (await fetch(endpoint)).json();
  expect(received.length === 1, `the server received one registration (${received.length})`);
  if (received.length) {
    const body = JSON.parse(received[0].body);
    expect(received[0].contentType.startsWith('text/plain'), `content type ${received[0].contentType}`);
    expect(body.version === 1 && body.form === 'own-your-mosaic-pilot', 'version and form name');
    expect(body.first_name === PERSON.first && body.last_name === PERSON.last && body.email === PERSON.email, 'name and email');
    expect(body.tier === 'Premium' && body.newsletter === true && body.message === 'Looking forward', `tier, newsletter and trimmed message (${body.tier}, ${body.newsletter}, "${body.message}")`);
    expect(body.src === 'test_qr', `?src=Test_QR! arrives as "${body.src}"`);
    expect(!Number.isNaN(Date.parse(body.submitted_at)), `submitted_at is a date (${body.submitted_at})`);
    notes.push(`registration received by the local endpoint: ${JSON.stringify(body)}`);
  }
  await context.close();
  await fetch(`${endpoint}?clear=1`);
}

// Part 3: a build whose endpoint does not answer.
async function deadEndpointPass(browser, serverUrl) {
  console.log('\n1440: a dead endpoint');
  const { context, page, afterLoad } = await open(browser, `${serverUrl}${PREVIEW_BASE}/`, '1440');
  await fillForm(page, { tier: 'Core' });
  await page.locator('.register__submit').click();
  await page.waitForFunction(() => !document.querySelector('.register__send-error').hidden, null, { timeout: 8000 }).catch(() => {});
  const s = await state(page);
  expect(s.sendError === f.error_send, `error_send is shown: "${s.sendError}"`);
  expect(!s.formHidden && s.successHidden, 'the form stays');
  expect(s.firstName === PERSON.first, 'the fields keep their values');
  expect(!s.buttonDisabled && s.buttonText === f.submit_label, `the button works again ("${s.buttonText}")`);
  expect(afterLoad().filter((r) => r.method === 'POST').length === 1, 'one attempt was made');
  await context.close();
}

// Part 4: keyboard only.
async function keyboardPass(browser, base) {
  console.log('\n1440: keyboard only');
  const { context, page } = await open(browser, base, '1440');
  const active = () => page.evaluate(() => document.activeElement.id || document.activeElement.name || document.activeElement.tagName);
  await page.focus('#reg-first-name');
  await page.keyboard.type(PERSON.first);
  await page.keyboard.press('Tab');
  expect((await active()) === 'reg-last-name', 'Tab reaches the last name');
  await page.keyboard.type(PERSON.last);
  await page.keyboard.press('Tab');
  expect((await active()) === 'reg-email', 'Tab reaches the email');
  await page.keyboard.type(PERSON.email);
  await page.keyboard.press('Tab');
  expect((await active()) === 'tier', 'Tab reaches the tier options');
  await page.keyboard.press('ArrowRight');
  const picked = await page.evaluate(() => (document.querySelector('input[name="tier"]:checked') || {}).value);
  expect(picked === 'Plus', `the arrow picks the next option (${picked})`);
  await page.keyboard.press('Tab');
  expect((await active()) === 'reg-message', 'Tab reaches the message');
  await page.keyboard.press('Tab');
  expect((await active()) === 'newsletter', 'Tab reaches the newsletter box');
  await page.keyboard.press('Tab');
  const onButton = await page.evaluate(() => document.activeElement.classList.contains('register__submit'));
  expect(onButton, 'Tab skips the trap and reaches the button');
  await page.keyboard.press('Enter');
  await page.waitForTimeout(SETTLE);
  const s = await state(page);
  expect(s.formHidden && !s.successHidden, 'Enter sends the form');
  await context.close();
}

async function main() {
  const args = process.argv.slice(2);
  const option = (flag) => (args.indexOf(flag) >= 0 ? args[args.indexOf(flag) + 1] : '');
  const liveUrl = option('--live');
  const outDir = option('--out') ? path.resolve(option('--out')) : DEFAULT_OUT_DIR;
  await mkdir(outDir, { recursive: true });
  const browser = await chromium.launch();
  const local = liveUrl ? null : await startServer(0);
  const base = liveUrl ? liveUrl.replace(/\/?$/, '/') : `${local.url}${PREVIEW_BASE}/`;
  const temp = [];
  try {
    for (const name of ['390', '1440']) await emptyEndpointPass(browser, base, name, outDir, liveUrl ? 'live-' : '');
    if (!liveUrl) {
      const dir = await mkdtemp(path.join(os.tmpdir(), 'own-your-mosaic-form-'));
      temp.push(dir);
      const localServer = await startServer(0, path.join(dir, 'local'));
      await build({ distDir: path.join(dir, 'local'), endpointUrl: `${localServer.url}/__endpoint`, quiet: true });
      await localEndpointPass(browser, localServer.url, dir);
      localServer.server.close();
      const deadServer = await startServer(0, path.join(dir, 'dead'));
      await build({ distDir: path.join(dir, 'dead'), endpointUrl: 'http://127.0.0.1:1/__endpoint', quiet: true });
      await deadEndpointPass(browser, deadServer.url);
      deadServer.server.close();
      await keyboardPass(browser, base);
    }
  } finally {
    await browser.close();
    if (local) local.server.close();
    for (const dir of temp) await rm(dir, { recursive: true, force: true });
  }
  if (notes.length) console.log(`\n${notes.join('\n')}`);
  if (problems.length) {
    console.error(`\n${problems.length} problem(s):\n${problems.join('\n')}`);
    process.exitCode = 1;
  } else {
    console.log('\nForm checks passed.');
  }
}

const isMain = process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (isMain) await main();
