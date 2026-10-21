// The registration form's pure logic: checking the fields, building the registration, cleaning
// the ?src= tag, sending. No DOM here, so the tests import it directly. register.js wires it to
// the form on the page; the build joins both files into dist/register.js.

export const PAYLOAD_VERSION = 1;
export const FORM_NAME = 'own-your-mosaic-pilot';
export const NAME_MAX = 60;
export const EMAIL_MAX = 254;
export const MESSAGE_MAX = 1000;
export const SRC_MAX = 40;
export const TIER_UNSURE = 'unsure';
export const FIELD_ORDER = ['first_name', 'last_name', 'email', 'tier', 'message'];
const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

const trim = (value) => (typeof value === 'string' ? value.trim() : '');

// Workshop tag from ?src=. Keeps a-z, 0-9, "-" and "_" only, at most 40 characters.
// Letters are lower-cased first, so "Workshop-A" and "workshop-a" count as the same tag.
export function sanitizeSrc(raw) {
  if (typeof raw !== 'string') return '';
  return raw.toLowerCase().replace(/[^a-z0-9_-]/g, '').slice(0, SRC_MAX);
}

export function readSrc(search) {
  const params = new URLSearchParams(search || '');
  return sanitizeSrc(params.get('src') || '');
}

// fields: { first_name, last_name, email, tier, message, newsletter, website }
// texts: { error_required, error_email, error_tier }; tiers: the values the form offers.
// Returns { ok, errors }: one message per field that fails. First and last name must be
// 1 to 60 characters after trimming, the email must look like one and be at most 254, the
// tier must be one of the offered values, the message may be empty and at most 1000.
export function validate(fields, texts, tiers = null) {
  const errors = {};
  for (const key of ['first_name', 'last_name']) {
    const value = trim(fields[key]);
    if (!value || value.length > NAME_MAX) errors[key] = texts.error_required;
  }
  const email = trim(fields.email);
  if (!email) errors.email = texts.error_required;
  else if (email.length > EMAIL_MAX || !EMAIL_PATTERN.test(email)) errors.email = texts.error_email;
  const tier = typeof fields.tier === 'string' ? fields.tier : '';
  if (!tier || (Array.isArray(tiers) && !tiers.includes(tier))) errors.tier = texts.error_tier;
  if (trim(fields.message).length > MESSAGE_MAX) errors.message = texts.error_required;
  return { ok: Object.keys(errors).length === 0, errors };
}

// The hidden "website" field: a person never sees it, a bot fills it in.
export function isTrap(fields) {
  return trim(fields.website) !== '';
}

// The registration sent to the endpoint, version 1:
// {
//   "version": 1, "form": "own-your-mosaic-pilot", "submitted_at": "2026-10-21T10:00:00.000Z",
//   "first_name": "Anna", "last_name": "Smith", "email": "anna@example.com",
//   "tier": "Core|Plus|Premium|unsure", "message": "", "newsletter": false, "src": ""
// }
export function buildPayload(fields, { now = new Date(), src = '' } = {}) {
  return {
    version: PAYLOAD_VERSION,
    form: FORM_NAME,
    submitted_at: now.toISOString(),
    first_name: trim(fields.first_name),
    last_name: trim(fields.last_name),
    email: trim(fields.email),
    tier: typeof fields.tier === 'string' ? fields.tier : '',
    message: trim(fields.message),
    newsletter: Boolean(fields.newsletter),
    src: sanitizeSrc(src),
  };
}

// "Thank you, {name}" with the name put in as text (never markup).
export function fillName(template, name) {
  return String(template || '').replace('{name}', () => name);
}

// Sends the registration. Resolves true when the request completed and false when it failed;
// a blank address or no fetch means: nothing is sent, false.
export function sendPayload(payload, endpointUrl, fetchImpl = globalThis.fetch) {
  const url = typeof endpointUrl === 'string' ? endpointUrl.trim() : '';
  if (!url || typeof fetchImpl !== 'function') return Promise.resolve(false);
  try {
    return fetchImpl(url, {
      method: 'POST',
      mode: 'no-cors',
      keepalive: true,
      headers: { 'Content-Type': 'text/plain;charset=utf-8' },
      body: JSON.stringify(payload),
    }).then(() => true, () => false);
  } catch {
    return Promise.resolve(false);
  }
}
