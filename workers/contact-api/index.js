const ALLOWED_ORIGINS = new Set([
  'https://aupositeur.be',
  'https://www.aupositeur.be',
]);

const SUBJECTS = new Set([
  'Un message',
  'À propos d’un texte',
  'À propos de la musique',
  'À propos du livre',
  'Une proposition',
  'Autre',
]);

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function json(body, status = 200, origin = '') {
  const headers = {
    'content-type': 'application/json; charset=utf-8',
    'cache-control': 'no-store',
    'x-content-type-options': 'nosniff',
  };
  if (ALLOWED_ORIGINS.has(origin)) {
    headers['access-control-allow-origin'] = origin;
    headers['vary'] = 'Origin';
  }
  return new Response(JSON.stringify(body), { status, headers });
}

function clean(value) {
  return typeof value === 'string' ? value.trim() : '';
}

function escapeHtml(value) {
  return value.replace(/[&<>"']/g, (char) => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#039;',
  }[char]));
}

function validate(data) {
  const errors = {};
  const name = clean(data.name);
  const email = clean(data.email).toLowerCase();
  const subject = clean(data.subject);
  const message = clean(data.message);

  if (!name) errors.name = 'Indiquez votre nom.';
  else if (name.length < 2) errors.name = 'Votre nom doit contenir au moins 2 caractères.';
  else if (name.length > 80) errors.name = 'Votre nom est un peu trop long.';

  if (!email) errors.email = 'Indiquez votre adresse e-mail.';
  else if (email.length > 254 || !EMAIL_RE.test(email)) errors.email = 'Cette adresse e-mail ne semble pas valide.';

  if (!SUBJECTS.has(subject)) errors.subject = 'Choisissez l’objet de votre message.';

  if (!message) errors.message = 'Écrivez votre message.';
  else if (message.length < 10) errors.message = 'Votre message est un peu trop court.';
  else if (message.length > 5000) errors.message = 'Votre message ne peut pas dépasser 5 000 caractères.';

  return { errors, values: { name, email, subject, message } };
}

async function verifyTurnstile(token, secret, remoteip) {
  const body = new FormData();
  body.append('secret', secret);
  body.append('response', token);
  if (remoteip) body.append('remoteip', remoteip);

  const response = await fetch('https://challenges.cloudflare.com/turnstile/v0/siteverify', {
    method: 'POST',
    body,
  });

  if (!response.ok) return false;
  const result = await response.json().catch(() => null);

  return result?.success === true
    && (result.hostname === 'aupositeur.be' || result.hostname === 'www.aupositeur.be')
    && result.action === 'contact';
}

export default {
  async fetch(request, env) {
    const origin = request.headers.get('Origin') || '';

    if (request.method === 'OPTIONS') {
      if (!ALLOWED_ORIGINS.has(origin)) return new Response(null, { status: 403 });
      return new Response(null, {
        status: 204,
        headers: {
          'access-control-allow-origin': origin,
          'access-control-allow-methods': 'POST, OPTIONS',
          'access-control-allow-headers': 'content-type',
          'access-control-max-age': '86400',
          'vary': 'Origin',
        },
      });
    }

    if (request.method !== 'POST') return json({ ok: false }, 405, origin);
    if (!ALLOWED_ORIGINS.has(origin)) return json({ ok: false }, 403, origin);

    const type = request.headers.get('content-type') || '';
    if (!type.includes('application/json')) return json({ ok: false }, 415, origin);

    let data;
    try {
      data = await request.json();
    } catch {
      return json({ ok: false }, 400, origin);
    }

    // Honeypot : un humain ne remplit jamais ce champ.
    if (clean(data.website)) return json({ ok: true }, 200, origin);

    // Un envoi instantané est très probablement automatisé.
    const startedAt = Number(data.startedAt || 0);
    if (!Number.isFinite(startedAt) || Date.now() - startedAt < 2500) {
      return json({ ok: false, code: 'TOO_FAST' }, 429, origin);
    }

    const { errors, values } = validate(data);
    if (Object.keys(errors).length) return json({ ok: false, errors }, 422, origin);

    if (!env.RESEND_API_KEY || !env.CONTACT_TO_EMAIL || !env.TURNSTILE_SECRET_KEY) {
      console.error('Contact Worker is missing required secrets/configuration.');
      return json({ ok: false, code: 'NOT_CONFIGURED' }, 503, origin);
    }

    const turnstileToken = clean(data['cf-turnstile-response']);
    if (!turnstileToken) {
      return json({ ok: false, code: 'TURNSTILE_FAILED' }, 403, origin);
    }

    const remoteip = request.headers.get('CF-Connecting-IP') || '';
    let turnstileValid = false;
    try {
      turnstileValid = await verifyTurnstile(turnstileToken, env.TURNSTILE_SECRET_KEY, remoteip);
    } catch (error) {
      console.error('Turnstile verification failed unexpectedly.');
    }
    if (!turnstileValid) {
      return json({ ok: false, code: 'TURNSTILE_FAILED' }, 403, origin);
    }

    const safeName = escapeHtml(values.name);
    const safeEmail = escapeHtml(values.email);
    const safeSubject = escapeHtml(values.subject);
    const safeMessage = escapeHtml(values.message).replace(/\n/g, '<br>');

    const response = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        'authorization': `Bearer ${env.RESEND_API_KEY}`,
        'content-type': 'application/json',
      },
      body: JSON.stringify({
        from: 'AUPOSITEUR <contact@aupositeur.be>',
        to: [env.CONTACT_TO_EMAIL],
        reply_to: values.email,
        subject: `[AUPOSITEUR] ${values.subject}`,
        html: `<h2>Nouveau message depuis AUPOSITEUR.be</h2><p><strong>Nom :</strong> ${safeName}</p><p><strong>E-mail :</strong> ${safeEmail}</p><p><strong>Objet :</strong> ${safeSubject}</p><hr><p>${safeMessage}</p>`,
        text: `Nouveau message depuis AUPOSITEUR.be\n\nNom : ${values.name}\nE-mail : ${values.email}\nObjet : ${values.subject}\n\n${values.message}`,
      }),
    });

    if (!response.ok) {
      console.error('Resend rejected contact email.', response.status);
      return json({ ok: false, code: 'SEND_FAILED' }, 502, origin);
    }

    const result = await response.json().catch(() => null);
    if (!result?.id) {
      console.error('Resend response did not contain an email id.');
      return json({ ok: false, code: 'SEND_FAILED' }, 502, origin);
    }

    // Le succès n'est retourné qu'après acceptation effective par Resend.
    return json({ ok: true }, 200, origin);
  },
};