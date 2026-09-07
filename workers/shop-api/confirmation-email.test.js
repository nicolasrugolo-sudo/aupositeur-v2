import test from 'node:test';
import assert from 'node:assert/strict';
import { resolveCartInput } from './order-cart.js';
import { buildConfirmationEmail } from './confirmation-email.js';

const baseSession = {
  client_reference_id: 'AUP-TEST-email',
  metadata: { order_reference: 'AUP-TEST-email' },
  customer_details: {
    email: 'client@example.com',
    name: 'Jean Exemple',
  },
  shipping_details: {
    name: 'Jean Exemple',
    address: {
      line1: '1 rue de la Poésie',
      line2: 'Boîte 2',
      postal_code: '1000',
      city: 'Bruxelles',
      country: 'BE',
    },
  },
};

test('builds a confirmation without payment-card or provider internals', () => {
  const cart = resolveCartInput({
    items: [
      { productSlug: 'ames', sku: 'AUP-AFF-AMES-BLACK', quantity: 2 },
      { productSlug: 'le-pire', sku: 'AUP-AFF-LE-PIRE-WHITE', quantity: 1 },
    ],
  });
  assert.equal(cart.ok, true);

  const email = buildConfirmationEmail({ session: baseSession, cart, termsVersion: '2026-09-06' });
  assert.equal(email.ok, true);
  assert.equal(email.to, 'client@example.com');
  assert.match(email.subject, /AUP-TEST-email/);
  assert.match(email.text, /207,00/);
  assert.match(email.text, /Âmes/);
  assert.match(email.text, /Le pire/);
  assert.match(email.text, /Boîte 2/);
  assert.match(email.text, /Nicolas RUGOLO/);
  assert.match(email.text, /Rue de Baudour 83/);
  assert.match(email.text, /aupositeur@gmail\.com/);
  assert.match(email.text, /14 jours calendrier/);
  assert.match(email.text, /\/retractation\//);
  assert.doesNotMatch(email.text, /Gelato|Stripe|card|pi_|cs_test_/i);
  assert.doesNotMatch(email.html, /Gelato|Stripe|pi_|cs_test_/i);
});

test('escapes customer-controlled HTML in the HTML email', () => {
  const cart = resolveCartInput({
    items: [{ productSlug: 'ames', sku: 'AUP-AFF-AMES-BLACK', quantity: 1 }],
  });
  assert.equal(cart.ok, true);

  const malicious = structuredClone(baseSession);
  malicious.shipping_details.name = '<script>alert(1)</script>';
  malicious.customer_details.name = malicious.shipping_details.name;

  const email = buildConfirmationEmail({ session: malicious, cart, termsVersion: '2026-09-06' });
  assert.equal(email.ok, true);
  assert.doesNotMatch(email.html, /<script>/i);
  assert.match(email.html, /&lt;script&gt;/i);
});

test('refuses to render when required delivery data is incomplete', () => {
  const cart = resolveCartInput({
    items: [{ productSlug: 'ames', sku: 'AUP-AFF-AMES-BLACK', quantity: 1 }],
  });
  const incomplete = structuredClone(baseSession);
  incomplete.customer_details.email = '';

  const email = buildConfirmationEmail({ session: incomplete, cart, termsVersion: '2026-09-06' });
  assert.equal(email.ok, false);
  assert.equal(email.code, 'incomplete_confirmation_email_data');
});
