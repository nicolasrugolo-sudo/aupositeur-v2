import test from 'node:test';
import assert from 'node:assert/strict';
import { resolveCartInput } from './order-cart.js';
import { sendOrderConfirmation } from './order-email.js';

const makeSession = () => ({
  client_reference_id: 'AUP-TEST-email-send',
  metadata: { order_reference: 'AUP-TEST-email-send', terms_version: '2026-09-06' },
  customer_details: {
    email: 'client@example.com',
    name: 'Jean Exemple',
  },
  shipping_details: {
    name: 'Jean Exemple',
    address: {
      line1: '1 rue de la Poésie',
      postal_code: '1000',
      city: 'Bruxelles',
      country: 'BE',
    },
  },
});

const makeCart = () => resolveCartInput({
  items: [{ productSlug: 'ames', sku: 'AUP-AFF-AMES-BLACK', quantity: 1 }],
});

test('does not call an email provider when configuration is absent', async () => {
  const originalFetch = globalThis.fetch;
  let calls = 0;
  globalThis.fetch = async () => {
    calls += 1;
    throw new Error('fetch should not be called');
  };

  try {
    const cart = makeCart();
    assert.equal(cart.ok, true);
    const result = await sendOrderConfirmation({ env: {}, session: makeSession(), cart, termsVersion: '2026-09-06' });
    assert.equal(result.ok, true);
    assert.equal(result.configured, false);
    assert.equal(result.sent, false);
    assert.equal(calls, 0);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test('uses an idempotency key and configured reply-to when configured', async () => {
  const originalFetch = globalThis.fetch;
  let request = null;
  globalThis.fetch = async (url, init) => {
    request = { url, init };
    return new Response(JSON.stringify({ id: 'email_123' }), {
      status: 200,
      headers: { 'content-type': 'application/json' },
    });
  };

  try {
    const cart = makeCart();
    const result = await sendOrderConfirmation({
      env: {
        RESEND_API_KEY: 're_test_value',
        ORDER_EMAIL_FROM: 'Aupositeur <commandes@aupositeur.be>',
        ORDER_EMAIL_REPLY_TO: 'aupositeur@gmail.com',
      },
      session: makeSession(),
      cart,
      termsVersion: '2026-09-06',
    });

    assert.equal(result.ok, true);
    assert.equal(result.configured, true);
    assert.equal(result.sent, true);
    assert.equal(result.providerId, 'email_123');
    assert.equal(request.url, 'https://api.resend.com/emails');
    assert.match(String(request.init.headers['Idempotency-Key']), /^aupositeur\/order-confirmation\/AUP-TEST-email-send$/);

    const body = JSON.parse(request.init.body);
    assert.equal(body.reply_to, 'aupositeur@gmail.com');
    assert.equal(body.from, 'Aupositeur <commandes@aupositeur.be>');
    assert.deepEqual(body.to, ['client@example.com']);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test('falls back to the official reply-to when the variable is absent', async () => {
  const originalFetch = globalThis.fetch;
  let request = null;
  globalThis.fetch = async (url, init) => {
    request = { url, init };
    return new Response(JSON.stringify({ id: 'email_124' }), {
      status: 200,
      headers: { 'content-type': 'application/json' },
    });
  };

  try {
    const result = await sendOrderConfirmation({
      env: {
        RESEND_API_KEY: 're_test_value',
        ORDER_EMAIL_FROM: 'Aupositeur <commandes@aupositeur.be>',
      },
      session: makeSession(),
      cart: makeCart(),
      termsVersion: '2026-09-06',
    });
    assert.equal(result.ok, true);
    const body = JSON.parse(request.init.body);
    assert.equal(body.reply_to, 'aupositeur@gmail.com');
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test('rejects a malformed configured API key without making a request', async () => {
  const originalFetch = globalThis.fetch;
  let calls = 0;
  globalThis.fetch = async () => { calls += 1; return new Response('{}'); };

  try {
    const result = await sendOrderConfirmation({
      env: {
        RESEND_API_KEY: 'not-a-resend-key',
        ORDER_EMAIL_FROM: 'Aupositeur <commandes@aupositeur.be>',
        ORDER_EMAIL_REPLY_TO: 'aupositeur@gmail.com',
      },
      session: makeSession(),
      cart: makeCart(),
      termsVersion: '2026-09-06',
    });
    assert.equal(result.ok, false);
    assert.equal(calls, 0);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test('rejects an invalid reply-to without making a request', async () => {
  const originalFetch = globalThis.fetch;
  let calls = 0;
  globalThis.fetch = async () => { calls += 1; return new Response('{}'); };

  try {
    const result = await sendOrderConfirmation({
      env: {
        RESEND_API_KEY: 're_test_value',
        ORDER_EMAIL_FROM: 'Aupositeur <commandes@aupositeur.be>',
        ORDER_EMAIL_REPLY_TO: 'invalid-address',
      },
      session: makeSession(),
      cart: makeCart(),
      termsVersion: '2026-09-06',
    });
    assert.equal(result.ok, false);
    assert.equal(calls, 0);
  } finally {
    globalThis.fetch = originalFetch;
  }
});
