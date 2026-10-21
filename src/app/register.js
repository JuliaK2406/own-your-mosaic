// Wires the registration form on the page: the check on submit with errors under the fields,
// the bot trap, one sending (or none while endpoint_url is empty), the thank-you state.
// Loaded only in mode form. The texts and the endpoint come from data attributes that the
// build writes on the form, so this file holds no words of its own except the TODO tag text.
import { validate, isTrap, buildPayload, sendPayload, readSrc, fillName, FIELD_ORDER } from './register-core.js';

const registerForm = document.getElementById('register-form');
if (registerForm) setUpRegisterForm(registerForm);

function setUpRegisterForm(form) {
  const texts = form.dataset;
  const button = form.querySelector('.register__submit');
  const submitLabel = button.textContent;
  const sendError = form.querySelector('.register__send-error');
  const success = document.getElementById('register-success');
  const successHeading = success.querySelector('.register__success-heading');
  const inputs = {
    first_name: form.elements.first_name,
    last_name: form.elements.last_name,
    email: form.elements.email,
    message: form.elements.message,
  };
  const tierInputs = [...form.querySelectorAll('input[name="tier"]')];
  const errorNodes = Object.fromEntries(FIELD_ORDER.map((key) => [key, form.querySelector(`[data-error-for="${key}"]`)]));
  let sending = false;

  const read = () => ({
    first_name: inputs.first_name.value,
    last_name: inputs.last_name.value,
    email: inputs.email.value,
    tier: (tierInputs.find((input) => input.checked) || {}).value || '',
    message: inputs.message.value,
    newsletter: form.elements.newsletter.checked,
    website: form.elements.website.value,
  });

  function setError(key, message) {
    const node = errorNodes[key];
    if (!node) return;
    node.textContent = message || '';
    const targets = key === 'tier' ? tierInputs : [inputs[key]];
    for (const target of targets) {
      if (message) target.setAttribute('aria-invalid', 'true');
      else target.removeAttribute('aria-invalid');
    }
  }

  // an error disappears as soon as the field is corrected
  for (const [key, input] of Object.entries(inputs)) input.addEventListener('input', () => setError(key, ''));
  for (const input of tierInputs) input.addEventListener('change', () => setError('tier', ''));

  function showSuccess(firstName, notConnected) {
    form.hidden = true;
    const intro = document.querySelector('.register__intro');
    if (intro) intro.hidden = true;
    successHeading.textContent = fillName(texts.successHeading, firstName);
    if (notConnected) {
      const tag = document.createElement('span');
      tag.className = 'tag tag--todo';
      tag.textContent = texts.notConnected;
      successHeading.append(' ', tag);
    }
    success.hidden = false;
    successHeading.focus();
  }

  form.addEventListener('submit', async (event) => {
    event.preventDefault();
    if (sending) return;
    sendError.hidden = true;
    sendError.textContent = '';
    const fields = read();
    const { ok, errors } = validate(fields, { error_required: texts.errorRequired, error_email: texts.errorEmail, error_tier: texts.errorTier }, tierInputs.map((input) => input.value));
    for (const key of FIELD_ORDER) setError(key, errors[key]);
    if (!ok) {
      const first = FIELD_ORDER.find((key) => errors[key]);
      (first === 'tier' ? tierInputs[0] : inputs[first]).focus();
      return;
    }
    const firstName = fields.first_name.trim();
    if (isTrap(fields)) {
      showSuccess(firstName, false);
      return;
    }
    const endpoint = (texts.endpoint || '').trim();
    if (!endpoint) {
      showSuccess(firstName, true);
      return;
    }
    const payload = buildPayload(fields, { now: new Date(), src: readSrc(window.location.search) });
    sending = true;
    button.disabled = true;
    button.textContent = texts.sending;
    const sent = await sendPayload(payload, endpoint);
    if (sent) {
      showSuccess(firstName, false);
      return;
    }
    sending = false;
    button.disabled = false;
    button.textContent = submitLabel;
    sendError.textContent = texts.errorSend;
    sendError.hidden = false;
  });
}
