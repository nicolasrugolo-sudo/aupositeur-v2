import { createGelatoDraftFromVerifiedSession } from './gelato-draft.js';
import { readCartFromSession, getCartReadiness, publicCartSummary } from './order-cart.js';
import { sendOrderConfirmation } from './order-email.js';

const SIGNATURE_TOLERANCE_SECONDS = 300;
const ALLOWED_SHIPPING_COUNTRIES = new Set(['BE', 'FR', 'LU']);
const SUCCESS_EVENT_TYPES = new Set([
  'checkout.session.completed',
  'checkout.session.async_payment_succeeded',
]);
const FAILED_EVENT_TYPE = 'checkout.session.async_payment_failed';

const json = (data, status = 200) =>
  new Response(JSON.stringify(data), {
    status,
    headers: {
      'content-type': 'application/json; charset=UTF-8',
      'cache-control': 'no-store',
      'x-content-type-options': 'nosniff',
    },
  });

const bytesToHex = (bytes) =>
  Array.from(new Uint8Array(bytes), (byte) => byte.toString(16).padStart(2, '0')).join('');

const safeEqual = (left, right) => {
  if (left.length !== right.length) return false;
  let diff = 0;
  for (let index = 0; index < left.length; index += 1) {
    diff |= left.charCodeAt(index) ^ right.charCodeAt(index);
  }
  return diff === 0;
};

const parseStripeSignature = (header) => {
  const values = String(header || '').split(',');
  let timestamp = null;
  const signatures = [];

  for (const value of values) {
    const separator = value.indexOf('=');
    if (separator === -1) continue;
    const key = value.slice(0, separator).trim();
    const item = value.slice(separator + 1).trim();
    if (key === 't') timestamp = Number(item);
    if (key === 'v1' && item) signatures.push(item);
  }

  return { timestamp, signatures };
};

const verifyStripeSignature = async (payload, signatureHeader, secret) => {
  const { timestamp, signatures } = parseStripeSignature(signatureHeader);

  if (!Number.isFinite(timestamp) || signatures.length === 0) {
    return { ok: false, reason: 'Malformed Stripe-Signature header' };
  }

  const now = Math.floor(Date.now() / 1000);
  if (Math.abs(now - timestamp) > SIGNATURE_TOLERANCE_SECONDS) {
    return { ok: false, reason: 'Stripe signature timestamp outside tolerance' };
  }

  const key = await crypto.subtle.importKey(
    'raw',
    new TextEncoder().encode(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign'],
  );

  const signedPayload = `${timestamp}.${payload}`;
  const digest = await crypto.subtle.sign(
    'HMAC',
    key,
    new TextEncoder().encode(signedPayload),
  );
  const expected = bytesToHex(digest);
  const valid = signatures.some((signature) => safeEqual(signature, expected));

  return valid
    ? { ok: true }
    : { ok: false, reason: 'Invalid Stripe webhook signature' };
};

const validateShippingDetails = (session) => {
  const shipping = session?.shipping_details || session?.collected_information?.shipping_details || null;
  const customer = session?.customer_details || {};
  const address = shipping?.address || null;
  const name = String(shipping?.name || customer?.name || '').trim();
  const email = String(customer?.email || '').trim();
  const country = String(address?.country || '').toUpperCase();
  const blockers = [];

  if (!shipping) blockers.push('missing_shipping_details');
  if (!name) blockers.push('missing_recipient_name');
  if (!address?.line1) blockers.push('missing_address_line1');
  if (!address?.city) blockers.push('missing_city');
  if (!address?.postal_code) blockers.push('missing_postal_code');
  if (!country) blockers.push('missing_country');
  if (country && !ALLOWED_SHIPPING_COUNTRIES.has(country)) blockers.push('unsupported_shipping_country');
  if (!email) blockers.push('missing_email');

  return { blockers };
};

const createAtomicGelatoDraft = async (request, env, session, eventId) => {
  if (!env.FULFILLMENT_LOCKS) {
    return createGelatoDraftFromVerifiedSession(request, env, session);
  }

  const durableObjectId = env.FULFILLMENT_LOCKS.idFromName(session.id);
  const stub = env.FULFILLMENT_LOCKS.get(durableObjectId);
  const response = await stub.fetch('https://fulfillment-lock.internal/fulfill', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      session,
      eventId: eventId || null,
      requestUrl: request.url,
    }),
  });

  let result;
  try {
    result = await response.json();
  } catch {
    result = { ok: false, error: 'Invalid fulfillment lock response' };
  }

  if (!response.ok) {
    return {
      ...result,
      ok: false,
      status: response.status,
    };
  }

  return result;
};

export const handleStripeWebhook = async (request, env) => {
  if (!env.STRIPE_WEBHOOK_SECRET || !String(env.STRIPE_WEBHOOK_SECRET).startsWith('whsec_')) {
    return json({ error: 'Stripe webhook secret is not configured' }, 503);
  }

  const signatureHeader = request.headers.get('Stripe-Signature');
  if (!signatureHeader) {
    return json({ error: 'Missing Stripe-Signature header' }, 400);
  }

  const payload = await request.text();
  const verification = await verifyStripeSignature(
    payload,
    signatureHeader,
    String(env.STRIPE_WEBHOOK_SECRET),
  );

  if (!verification.ok) {
    return json({ error: verification.reason }, 400);
  }

  let event;
  try {
    event = JSON.parse(payload);
  } catch {
    return json({ error: 'Invalid Stripe event payload' }, 400);
  }

  const eventType = event.type || null;
  if (!SUCCESS_EVENT_TYPES.has(eventType) && eventType !== FAILED_EVENT_TYPE) {
    return json({
      received: true,
      verified: true,
      ignored: true,
      eventId: event.id || null,
      eventType,
    });
  }

  const session = event?.data?.object;
  if (!session || session.object !== 'checkout.session') {
    return json({ error: 'Invalid Checkout Session event object' }, 400);
  }

  if (eventType === FAILED_EVENT_TYPE) {
    return json({
      received: true,
      verified: true,
      ignored: false,
      paymentFailed: true,
      gelatoOrderCreated: false,
      gelatoDraftCreated: false,
      productionOrderCreated: false,
      eventId: event.id || null,
      eventType,
      checkoutSessionId: session.id || null,
      paymentStatus: session.payment_status || null,
    });
  }

  const metadata = session?.metadata || {};
  if (metadata.aupositeur_mode !== 'test') {
    return json({ error: 'Unexpected Aupositeur checkout mode' }, 400);
  }

  const paid = session.payment_status === 'paid';
  const cart = readCartFromSession(session);
  const shipping = validateShippingDetails(session);
  const confirmationBlockers = [...shipping.blockers];
  let readiness = { allReady: false, items: [] };

  if (!cart.ok) {
    confirmationBlockers.push(cart.code || 'invalid_cart_metadata');
  } else {
    if (session.currency !== cart.currency) confirmationBlockers.push('currency_mismatch');
    if (session.amount_total !== cart.amountTotal) confirmationBlockers.push('amount_mismatch');
  }

  if (!metadata.order_reference) confirmationBlockers.push('missing_order_reference');
  if (!paid) confirmationBlockers.push('payment_not_paid');

  const uniqueConfirmationBlockers = [...new Set(confirmationBlockers)];
  let emailResult = { ok: true, configured: false, sent: false };

  if (uniqueConfirmationBlockers.length === 0 && cart.ok) {
    try {
      emailResult = await sendOrderConfirmation({
        env,
        session,
        cart,
        termsVersion: String(metadata.terms_version || ''),
      });
    } catch {
      emailResult = { ok: false, configured: true, sent: false };
    }
  }

  const fulfillmentBlockers = [...uniqueConfirmationBlockers];
  if (cart.ok) {
    readiness = await getCartReadiness(env, cart);
    for (const item of readiness.items) {
      if (!item.readiness.ready) {
        fulfillmentBlockers.push(`${item.productSlug}:${item.readiness.reason || 'not_ready'}`);
      }
    }
  }

  const uniqueFulfillmentBlockers = [...new Set(fulfillmentBlockers)];
  const readyForGelatoDraft = uniqueFulfillmentBlockers.length === 0;

  let gelatoDraft = null;
  if (readyForGelatoDraft) {
    try {
      gelatoDraft = await createAtomicGelatoDraft(request, env, session, event.id || null);
    } catch {
      return json({
        received: true,
        verified: true,
        readyForGelatoDraft: true,
        gelatoDraftCreated: false,
        emailConfigured: emailResult.configured === true,
        emailSent: emailResult.sent === true,
        error: 'Fulfillment temporarily unavailable',
        eventId: event.id || null,
        checkoutSessionId: session.id || null,
      }, 502);
    }

    if (!gelatoDraft?.ok) {
      return json({
        received: true,
        verified: true,
        readyForGelatoDraft: true,
        gelatoDraftCreated: false,
        emailConfigured: emailResult.configured === true,
        emailSent: emailResult.sent === true,
        retryable: gelatoDraft?.retryable === true,
        eventId: event.id || null,
        checkoutSessionId: session.id || null,
      }, gelatoDraft?.status || 502);
    }
  }

  if (emailResult.configured === true && emailResult.ok !== true) {
    return json({
      received: true,
      verified: true,
      retryable: true,
      emailConfigured: true,
      emailSent: false,
      gelatoDraftCreated: gelatoDraft?.draftCreated === true,
      duplicatePrevented:
        gelatoDraft?.duplicatePrevented === true || gelatoDraft?.atomicDuplicatePrevented === true,
      eventId: event.id || null,
      checkoutSessionId: session.id || null,
      error: 'Order confirmation email temporarily unavailable',
    }, 502);
  }

  const cartSummary = cart.ok ? publicCartSummary(cart) : { items: [], totalQuantity: 0, amountTotal: 0 };

  return json({
    received: true,
    verified: true,
    dryRun: false,
    gelatoOrderCreated: gelatoDraft?.draftCreated === true,
    gelatoDraftCreated: gelatoDraft?.draftCreated === true,
    duplicatePrevented:
      gelatoDraft?.duplicatePrevented === true || gelatoDraft?.atomicDuplicatePrevented === true,
    atomicDuplicatePrevented: gelatoDraft?.atomicDuplicatePrevented === true,
    atomicLockUsed: gelatoDraft?.atomicLockUsed === true || gelatoDraft?.atomicDuplicatePrevented === true,
    productionOrderCreated: false,
    eligibleForFulfillment: paid,
    readyForGelatoDraft,
    blockers: uniqueFulfillmentBlockers,
    emailConfigured: emailResult.configured === true,
    emailSent: emailResult.sent === true,
    eventId: event.id || null,
    eventType,
    checkoutSessionId: session.id || null,
    paymentStatus: session.payment_status || null,
    order: {
      reference: metadata.order_reference || null,
      schema: metadata.order_schema || 'legacy-single-item',
      itemCount: cartSummary.items.length,
      totalQuantity: cartSummary.totalQuantity || 0,
      amountTotal: cartSummary.amountTotal || 0,
      currency: cart.ok ? cart.currency : null,
      readiness: readiness.items.map((item) => ({
        productSlug: item.productSlug,
        ready: item.readiness.ready === true,
      })),
    },
  });
};
