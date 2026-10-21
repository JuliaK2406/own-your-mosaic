// Content check: the shape of content/offer.yaml, TODO markers, draft markers and long dashes.
// Run with npm run check. The build runs it too and stops on any error.
//
//   TODO     a text that does not exist yet (the word TODO in a value, or an empty site_url).
//            Shown as a yellow tag on the page while meta.published is false.
//   # draft  a text we wrote ourselves that Julia has not approved yet: an inline "# draft"
//            comment on the line of the value. Shown as an aubergine "draft" tag on the page.
//            On a key that opens a list (quotes:   # draft) it marks the whole list.
//
// Both are only reminders while meta.published is false. With published: true any TODO or
// draft stops the build, so unfinished text never reaches the published page.

import { readdir, readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { load } from 'js-yaml';

export const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
export const CONTENT_FILE = path.join(ROOT, 'content', 'offer.yaml');
export const PHOTOS_DIR = path.join(ROOT, 'content', 'photos');

export async function loadContent(file = CONTENT_FILE) {
  return load(await readFile(file, 'utf8'));
}

export async function loadRaw(file = CONTENT_FILE) {
  return readFile(file, 'utf8');
}

// Names of the files in content/photos (the yaml refers to photos by file name).
export async function listPhotos(dir = PHOTOS_DIR) {
  const names = await readdir(dir).catch(() => []);
  return new Set(names.filter((name) => !name.startsWith('.')));
}

// Required fields and their kinds:
//   'string'        a non-empty text
//   'text'          a text that may be empty
//   'boolean'       true or false
//   'url'           a full web address
//   'url-or-empty'  a full https:// address or empty
//   'file'          a file name
//   'list'          a list of non-empty texts, at least one
//   'list:N'        exactly N non-empty texts
//   [shape]         a list of groups with the given fields, at least one
//   [shape, N]      exactly N such groups
const SHAPE = {
  meta: { published: 'boolean', site_url: 'url-or-empty', title: 'string', description: 'string' },
  links: { main_site: 'url' },
  register: { label: 'string', url: 'string' },
  hero: {
    title: 'string',
    subtitle: 'string',
    name: 'string',
    positioning: 'string',
    paragraphs: 'list',
    facts: 'list',
    photo: 'file',
    photo_alt: 'text',
  },
  who: { heading: 'string', items: 'list:4' },
  problem: { statement: 'string' },
  promise: { heading: 'string', paragraphs: 'list' },
  process: {
    heading: 'string',
    intro: 'string',
    levels_intro: 'string',
    start_label: 'string',
    finish_label: 'string',
    levels: [{ name: 'string', text: 'string' }, 3],
  },
  package: { heading: 'string', items: 'list:8' },
  pricing: {
    heading: 'string',
    subheading: 'string',
    vat_label: 'string',
    tiers: [{ name: 'string', price: 'string', spots: 'string', text: 'string' }, 3],
    note: 'string',
  },
  proof: {
    heading: 'string',
    paragraphs: 'list',
    photo: 'file',
    photo_alt: 'text',
    quotes_heading: 'string',
    quotes: [{ quote: 'string', name: 'string', role: 'string', company: 'string' }],
  },
  logistics: { heading: 'string', items: [{ label: 'string', value: 'string' }, 7] },
  closing: { text: 'string' },
  footer: { legal_line: 'string', main_site_label: 'string' },
};

// The only values that may be empty.
const EMPTY_ALLOWED = new Set(['meta.site_url', 'hero.photo_alt', 'proof.photo_alt']);
// Fields that name a photo in content/photos.
const PHOTO_FIELDS = ['hero.photo', 'proof.photo'];

const isString = (value) => typeof value === 'string';
const isFilled = (value) => isString(value) && value.trim() !== '';
const isObject = (value) => value !== null && typeof value === 'object' && !Array.isArray(value);
const join = (at, key) => (at ? `${at}.${key}` : key);

function isWebUrl(value, protocols = ['https:', 'http:']) {
  if (!isFilled(value)) return false;
  try {
    const url = new URL(value.trim());
    return protocols.includes(url.protocol) && url.hostname !== '';
  } catch {
    return false;
  }
}

export function get(object, dotted) {
  return dotted.split(/[.[\]]+/).filter(Boolean).reduce((value, key) => (value == null ? undefined : value[/^\d+$/.test(key) ? Number(key) : key]), object);
}

// options.photos: the Set of file names in content/photos (missing photos are errors);
// options.raw: the yaml text, needed to find the "# draft" markers.
export function checkContent(content, { photos, raw } = {}) {
  const empty = { errors: [], todos: [], drafts: [], warnings: [] };
  if (!isObject(content)) return { ...empty, errors: ['content: the file is not a list of fields'] };
  const errors = [];
  const fail = (at, message) => errors.push(`${at}: ${message}`);
  checkShape(content, SHAPE, '', fail);
  checkNoEmptyValues(content, '', fail);
  if (photos) {
    for (const at of PHOTO_FIELDS) {
      const name = get(content, at);
      if (isFilled(name) && !photos.has(name)) fail(at, `${name} is not in content/photos`);
    }
  }
  const todos = [];
  const warnings = [];
  walkStrings(content, '', (at, value) => {
    if (/\bTODO\b/.test(value)) todos.push(at);
    if (/[\u2013\u2014]/.test(value)) warnings.push(`${at}: contains a long dash`);
  });
  if (isObject(content.meta) && isString(content.meta.site_url) && content.meta.site_url.trim() === '') todos.push('meta.site_url (empty)');
  let drafts = [];
  if (isString(raw)) {
    const found = findDrafts(raw, content);
    drafts = found.drafts;
    for (const problem of found.problems) fail('draft marker', problem);
  }
  return { errors, todos, drafts, warnings };
}

function checkShape(value, shape, at, fail) {
  if (isString(shape)) {
    checkKind(value, shape, at, fail);
    return;
  }
  if (Array.isArray(shape)) {
    checkGroupList(value, shape[0], shape[1], at, fail);
    return;
  }
  if (!isObject(value)) {
    fail(at || 'content', 'expected a group of fields');
    return;
  }
  for (const [key, sub] of Object.entries(shape)) {
    const here = join(at, key);
    if (!(key in value)) {
      fail(here, 'missing');
      continue;
    }
    checkShape(value[key], sub, here, fail);
  }
}

function checkKind(value, kind, at, fail) {
  const [name, count] = kind.split(':');
  switch (name) {
    case 'string':
      if (!isFilled(value)) fail(at, 'must be a non-empty text');
      break;
    case 'text':
      if (!isString(value)) fail(at, 'must be a text (empty is allowed)');
      break;
    case 'boolean':
      if (typeof value !== 'boolean') fail(at, 'must be true or false');
      break;
    case 'url':
      if (!isWebUrl(value)) fail(at, 'must be a full address starting with https:// or http://');
      break;
    case 'url-or-empty':
      if (!isString(value)) fail(at, 'must be a text (empty is allowed)');
      else if (value.trim() !== '' && !isWebUrl(value, ['https:'])) fail(at, 'must be empty or a full https:// address');
      break;
    case 'file':
      if (!isFilled(value)) fail(at, 'must be a file name');
      else if (/[/\\]/.test(value)) fail(at, 'must be a file name without a folder');
      break;
    case 'list':
      checkTextList(value, count ? Number(count) : null, at, fail);
      break;
    default:
      fail(at, `unknown check "${kind}"`);
  }
}

function checkTextList(value, count, at, fail) {
  if (!Array.isArray(value)) {
    fail(at, 'must be a list');
    return;
  }
  if (count !== null && value.length !== count) fail(at, `must have exactly ${count} items, found ${value.length}`);
  else if (count === null && value.length === 0) fail(at, 'must have at least one item');
  value.forEach((text, i) => {
    if (!isFilled(text)) fail(`${at}[${i}]`, 'must be a non-empty text');
  });
}

function checkGroupList(value, shape, count, at, fail) {
  if (!Array.isArray(value)) {
    fail(at, 'must be a list');
    return;
  }
  const fields = Object.keys(shape).join(', ');
  if (count !== undefined && value.length !== count) fail(at, `must have exactly ${count} items, found ${value.length}`);
  else if (count === undefined && value.length === 0) fail(at, 'must have at least one item');
  value.forEach((entry, i) => {
    const here = `${at}[${i}]`;
    if (!isObject(entry)) {
      fail(here, `must have ${fields}`);
      return;
    }
    checkShape(entry, shape, here, fail);
  });
}

function checkNoEmptyValues(value, at, fail) {
  if (isString(value)) {
    if (value.trim() === '' && !EMPTY_ALLOWED.has(at)) fail(at, 'is empty');
    return;
  }
  if (Array.isArray(value)) {
    if (value.length === 0) fail(at, 'is an empty list');
    value.forEach((entry, i) => checkNoEmptyValues(entry, `${at}[${i}]`, fail));
    return;
  }
  if (isObject(value)) {
    for (const [key, entry] of Object.entries(value)) checkNoEmptyValues(entry, join(at, key), fail);
    return;
  }
  if (value === null || value === undefined) fail(at, 'is empty');
}

export function walkStrings(value, at, visit) {
  if (isString(value)) {
    visit(at, value);
    return;
  }
  if (Array.isArray(value)) {
    value.forEach((entry, i) => walkStrings(entry, `${at}[${i}]`, visit));
    return;
  }
  if (isObject(value)) {
    for (const [key, entry] of Object.entries(value)) walkStrings(entry, join(at, key), visit);
  }
}

// Finds every line marked with an inline "# draft" comment and works out the path of its value
// by tracking the yaml indentation. The file is our own regular two-space yaml, so the tracker
// stays simple; every found path is verified against the parsed data, and a marker that does
// not resolve is reported as a problem instead of being dropped silently.
export function findDrafts(raw, content) {
  const drafts = [];
  const problems = [];
  const stack = []; // { indent, seg }
  const counters = new Map(); // parent path -> next list index
  let blockIndent = -1; // inside a | or > block scalar while >= 0

  const pathOf = () => stack.map((frame) => frame.seg).join('.').replace(/\.\[/g, '[');
  const lines = raw.split('\n');
  for (let n = 0; n < lines.length; n += 1) {
    const line = lines[n];
    if (!line.trim()) continue;
    let indent = line.match(/^ */)[0].length;
    if (blockIndent >= 0) {
      if (indent > blockIndent) continue;
      blockIndent = -1;
    }
    let rest = line.slice(indent);
    if (rest.startsWith('#')) continue;
    while (stack.length && stack[stack.length - 1].indent >= indent) stack.pop();

    if (rest.startsWith('- ')) {
      const parent = pathOf();
      const index = counters.get(parent) ?? 0;
      counters.set(parent, index + 1);
      stack.push({ indent, seg: `[${index}]` });
      rest = rest.slice(2).trimStart();
      if (/^[|>]/.test(rest)) {
        blockIndent = indent;
        continue;
      }
      indent += 2;
    }

    const marker = /#\s*draft\b:?\s*(.*)$/.exec(rest);
    const keyMatch = /^([A-Za-z_][\w-]*):(.*)$/.exec(rest);
    if (keyMatch) {
      const [, key, valuePart] = keyMatch;
      counters.delete(`${pathOf()}${stack.length ? '.' : ''}${key}`);
      stack.push({ indent, seg: key });
      if (/^[|>]/.test(valuePart.trim())) blockIndent = indent;
    }
    if (!marker) continue;
    const at = pathOf();
    const value = get(content, at);
    if (value === undefined) problems.push(`line ${n + 1}: the marker does not resolve to a value (${at})`);
    else drafts.push({ path: at, value, note: (marker[1] || '').trim(), line: n + 1 });
  }
  return { drafts, problems };
}

function describe(value) {
  if (isString(value)) return `"${value}"`;
  if (Array.isArray(value)) return `${value.length} items`;
  return JSON.stringify(value);
}

// Human-readable report. TODO and draft entries block only once meta.published is true.
export function report(content, { errors, todos, drafts, warnings }) {
  const lines = [];
  const published = Boolean(content && content.meta && content.meta.published === true);
  lines.push(`Content: published ${published}`);
  const list = (title, entries) => {
    if (!entries.length) {
      lines.push(`${title}: none`);
      return;
    }
    lines.push(`${title} (${entries.length}):`);
    for (const entry of entries) lines.push(`  ${entry}`);
  };
  list('TODO', todos);
  list('Drafts', drafts.map((d) => `${d.path} = ${describe(d.value)}${d.note ? `  (${d.note})` : ''}`));
  list('Warnings', warnings);
  const blocking = [...errors];
  if (published && todos.length) blocking.push('meta.published: is true while TODO markers remain');
  if (published && drafts.length) blocking.push('meta.published: is true while draft markers remain');
  list('Errors', blocking);
  return { ok: blocking.length === 0, lines };
}

export async function runCheck(file = CONTENT_FILE) {
  let content;
  let raw;
  try {
    raw = await loadRaw(file);
    content = load(raw);
  } catch (error) {
    return { ok: false, lines: [`Cannot read ${path.relative(ROOT, file)}: ${error.message}`] };
  }
  const photos = await listPhotos();
  return report(content, checkContent(content, { photos, raw }));
}

const isMain = process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (isMain) {
  const { ok, lines } = await runCheck(process.argv[2] ? path.resolve(process.argv[2]) : undefined);
  console.log(lines.join('\n'));
  process.exitCode = ok ? 0 : 1;
}
