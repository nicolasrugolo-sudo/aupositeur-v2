import { buildConfirmationEmail } from './confirmation-email.js';

const RESEND_EMAIL_API = 'https://api.resend.com/emails';
const DEFAULT_REPLY_TO = 'aupositeur@gmail.com';

const cleanProviderMessage = async (response) => {
  try {
    const data = await response.json();
    const message = data?.message || data?.error?.message || data?.error;
    return typeof message === 'string' ? message.trim().slice(0, 240) : `Email provider error ${response.status}`;
  } catch {
    return `Email provider error ${response.status}`;
  }
};

export const sendOrderConfirmation = async ({ env, session, cart, termsVersion }) => {
  const apiKey = String(env.RESEND_API_KEY || '').trim();
  const from = String(env.ORDER_EMAIL_FROM || '').trim();
  const replyTo = String(env.ORDER_EMAIL_REPLY_TO || DEFAULT_REPLY_TO).trim();

  if (!apiKey || !from) {
    return {
      ok: true,
      configured: false,
      sent: false,
      reason: 'email_provider_not_configured',
    };
  }

  if (!apiKey.startsWith('re_')) {
    return { ok: false, configured: true, sent: false, error: 'Invalid email provider configuration' };
  }

  if (!replyTo || !replyTo.includes('@')) {
    return { ok: false, configured: true, sent: false, error: 'Invalid reply-to configuration' };
  }

  const email = buildConfirmationEmail({ session, cart, termsVersion });
  if (!email.ok) {
    return { ok: false, configured: true, sent: false, error: email.code || 'Email data incomplete' };
  }

  const idempotencyKey = `aupositeur/order-confirmation/${email.reference}`.slice(0, 256);
  const response = await fetch(RESEND_EMAIL_API, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
      'Idempotency-Key': idempotencyKey,
    },
    body: JSON.stringify({
      from,
      to: [email.to],
      reply_to: replyTo,
      subject: email.subject,
      text: email.text,
      html: email.html,
    }),
  });

  if (!response.ok) {
    return {
      ok: false,
      configured: true,
      sent: false,
      status: response.status,
      error: await cleanProviderMessage(response),
    };
  }

  let data = null;
  try { data = await response.json(); } catch {}

  return {
    ok: true,
    configured: true,
    sent: true,
    providerId: typeof data?.id === 'string' ? data.id : null,
  };
};
