import entry from './entry.js';
import { handleAdminGelatoMarketAudit } from './gelato-market-audit.js';
import { SHOP_CATALOG, resolveVariant } from './shop-catalog.js';
import { readCartFromSession, publicCartSummary } from './order-cart.js';
export { FulfillmentLock } from './fulfillment-lock.js';

const SHOP_TERMS_VERSION = '2026-09-06';
const STRIPE_API = 'https://api.stripe.com/v1';
const EXACT_ALLOWED_ORIGINS = new Set([
  'https://www.aupositeur.be',
  'https://aupositeur.be',
  'https://aupositeur-site.pages.dev',
]);
const PREVIEW_ORIGIN_RE = /^https:\/\/[a-z0-9-]+\.aupositeur-site\.pages\.dev$/i;

const isAllowedShopOrigin = (origin) =>
  EXACT_ALLOWED_ORIGINS.has(origin) || PREVIEW_ORIGIN_RE.test(origin);

const json = (data, status = 200, origin = '') => {
  const headers = {
    'content-type': 'application/json; charset=UTF-8',
    'cache-control': 'no-store',
  };

  if (origin) {
    headers['access-control-allow-origin'] = origin;
    headers.vary = 'Origin';
  }

  return new Response(JSON.stringify(data), { status, headers });
};

const isAdmin = (request, env) => {
  const provided = request.headers.get('X-Aupositeur-Admin') || '';
  return Boolean(env.SHOP_ADMIN_TOKEN) && provided === env.SHOP_ADMIN_TOKEN;
};

const recordStripeTermsAcceptance = async (sessionId, env) => {
  if (!env.STRIPE_SECRET_KEY || !String(env.STRIPE_SECRET_KEY).startsWith('sk_test_')) {
    return { ok: false, error: 'Stripe test key is not configured' };
  }

  const params = new URLSearchParams();
  params.set('metadata[terms_accepted]', 'true');
  params.set('metadata[terms_version]', SHOP_TERMS_VERSION);
  params.set('metadata[terms_accepted_at]', new Date().toISOString());

  const response = await fetch(
    `${STRIPE_API}/checkout/sessions/${encodeURIComponent(sessionId)}`,
    {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${env.STRIPE_SECRET_KEY}`,
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: params.toString(),
    },
  );

  if (response.ok) return { ok: true };

  const text = await response.text();
  return {
    ok: false,
    error: `Could not record terms acceptance in Stripe (${response.status})`,
    detail: text.slice(0, 300),
  };
};

const expireStripeSession = async (sessionId, env) => {
  if (!env.STRIPE_SECRET_KEY || !String(env.STRIPE_SECRET_KEY).startsWith('sk_test_')) return;

  try {
    await fetch(
      `${STRIPE_API}/checkout/sessions/${encodeURIComponent(sessionId)}/expire`,
      {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${env.STRIPE_SECRET_KEY}`,
          'Content-Type': 'application/x-www-form-urlencoded',
        },
        body: '',
      },
    );
  } catch {
    // Best-effort cleanup only. The session URL is never returned when recording fails.
  }
};

const getFulfillmentState = async (env, sessionId) => {
  if (!env.FULFILLMENT_LOCKS) return 'unavailable';

  try {
    const durableObjectId = env.FULFILLMENT_LOCKS.idFromName(sessionId);
    const stub = env.FULFILLMENT_LOCKS.get(durableObjectId);
    const response = await stub.fetch('https://fulfillment-lock.internal/status', { method: 'GET' });
    if (!response.ok) return 'unavailable';
    const result = await response.json();
    return String(result?.state || 'not_started');
  } catch {
    return 'unavailable';
  }
};

const fetchStripeCheckoutSession = async (env, sessionId, paymentIntentId) => {
  const headers = { Authorization: `Bearer ${env.STRIPE_SECRET_KEY}` };

  if (sessionId) {
    const direct = await fetch(
      `${STRIPE_API}/checkout/sessions/${encodeURIComponent(sessionId)}`,
      { headers },
    );
    if (direct.ok) return { ok: true, session: await direct.json() };
    if (direct.status !== 404) return { ok: false, status: direct.status };
  }

  if (!paymentIntentId) return { ok: false, status: 404 };

  const params = new URLSearchParams();
  params.set('payment_intent', paymentIntentId);
  params.set('limit', '1');
  const listResponse = await fetch(`${STRIPE_API}/checkout/sessions?${params.toString()}`, { headers });
  if (!listResponse.ok) return { ok: false, status: listResponse.status };

  const list = await listResponse.json();
  const session = Array.isArray(list?.data) ? list.data[0] : null;
  if (!session) return { ok: false, status: 404 };
  return { ok: true, session };
};

const getCheckoutStatus = async (request, env, origin) => {
  if (!env.STRIPE_SECRET_KEY || !String(env.STRIPE_SECRET_KEY).startsWith('sk_test_')) {
    return json({ error: 'Stripe test key is not configured', code: 'stripe_key_unavailable' }, 503, origin);
  }

  const url = new URL(request.url);
  const rawSessionId = String(url.searchParams.get('session_id') || '');
  const rawPaymentIntentId = String(url.searchParams.get('payment_intent') || '');
  const sessionId = rawSessionId.startsWith('cs_test_') && rawSessionId.length <= 255 ? rawSessionId : '';
  const paymentIntentId = rawPaymentIntentId.startsWith('pi_') && rawPaymentIntentId.length <= 255
    ? rawPaymentIntentId
    : '';

  if (!sessionId && !paymentIntentId) {
    return json({ error: 'Missing valid test Checkout identifier', code: 'invalid_checkout_identifier' }, 400, origin);
  }

  let lookup;
  try {
    lookup = await fetchStripeCheckoutSession(env, sessionId, paymentIntentId);
  } catch {
    return json({ error: 'Stripe is temporarily unavailable', code: 'stripe_unreachable' }, 502, origin);
  }

  if (!lookup.ok || !lookup.session) {
    return json(
      {
        error: lookup.status === 404 ? 'Checkout Session not found' : 'Stripe Checkout lookup failed',
        code: lookup.status === 404 ? 'session_not_found' : 'stripe_lookup_failed',
      },
      lookup.status === 404 ? 404 : 502,
      origin,
    );
  }

  const session = lookup.session;
  const resolvedSessionId = String(session.id || '');
  const metadata = session?.metadata || {};
  if (metadata.aupositeur_mode !== 'test') {
    return json({ error: 'Unexpected checkout mode', code: 'unexpected_checkout_mode' }, 400, origin);
  }

  const cart = readCartFromSession(session);
  if (!cart.ok) {
    return json({ error: 'Checkout cart metadata is invalid', code: cart.code || 'invalid_cart_metadata' }, 409, origin);
  }

  const fulfillmentState = await getFulfillmentState(env, resolvedSessionId);
  const cartSummary = publicCartSummary(cart);
  const firstItem = cartSummary.items[0] || null;

  return json(
    {
      ok: true,
      mode: 'test',
      checkoutSessionId: resolvedSessionId,
      paymentIntentId: session.payment_intent || paymentIntentId || null,
      paymentStatus: session.payment_status || null,
      paymentComplete: session.payment_status === 'paid',
      fulfillmentState,
      gelatoDraftPrepared: fulfillmentState === 'completed',
      productionOrderCreated: false,
      order: {
        reference: metadata.order_reference || session.client_reference_id || null,
        schema: metadata.order_schema || 'legacy-single-item',
        items: cartSummary.items,
        totalQuantity: cartSummary.totalQuantity,
        amountTotal: session.amount_total ?? cartSummary.amountTotal,
        currency: session.currency || cartSummary.currency,
        // Legacy single-item fields kept temporarily for the current Merci page.
        productSlug: firstItem?.productSlug || null,
        productTitle: firstItem?.productTitle || null,
        variant: firstItem?.variant || null,
        sku: firstItem?.sku || null,
        quantity: firstItem?.quantity || null,
      },
    },
    200,
    origin,
  );
};

export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);
    const origin = request.headers.get('Origin') || '';

    if (url.pathname === '/admin/gelato/market-audit') {
      if (request.method !== 'POST') return json({ error: 'Method not allowed' }, 405, origin);
      if (!isAdmin(request, env)) return json({ error: 'Unauthorized' }, 401, origin);
      return handleAdminGelatoMarketAudit(request, env, SHOP_CATALOG, resolveVariant);
    }

    if (url.pathname === '/checkout/status') {
      if (request.method === 'OPTIONS') {
        return new Response(null, {
          status: 204,
          headers: {
            'access-control-allow-origin': origin || '*',
            'access-control-allow-methods': 'GET, OPTIONS',
            'access-control-allow-headers': 'Content-Type, Accept',
            'access-control-max-age': '86400',
            vary: 'Origin',
          },
        });
      }

      if (request.method !== 'GET') {
        return json({ error: 'Method not allowed' }, 405, origin);
      }

      return getCheckoutStatus(request, env, origin);
    }

    if (url.pathname === '/checkout/session' && request.method === 'POST') {
      let input;
      try {
        input = await request.clone().json();
      } catch {
        return json({ error: 'Invalid JSON body' }, 400, origin);
      }

      if (!isAllowedShopOrigin(origin)) {
        return json({ error: 'Origin not allowed' }, 403, origin);
      }

      if (input?.termsAccepted !== true) {
        return json({ error: 'Shop terms must be accepted before checkout' }, 400, origin);
      }

      if (String(input?.termsVersion || '') !== SHOP_TERMS_VERSION) {
        return json(
          {
            error: 'Shop terms version has changed. Please review the current terms.',
            currentTermsVersion: SHOP_TERMS_VERSION,
          },
          409,
          origin,
        );
      }

      const checkoutResponse = await entry.fetch(request, env, ctx);
      if (!checkoutResponse.ok) return checkoutResponse;

      let checkoutData;
      try {
        checkoutData = await checkoutResponse.clone().json();
      } catch {
        return json({ error: 'Invalid checkout response' }, 502, origin);
      }

      const checkoutSessionId = String(checkoutData?.sessionId || '');
      if (!checkoutSessionId.startsWith('cs_test_')) {
        return json({ error: 'Expected a Stripe test Checkout Session' }, 502, origin);
      }

      const recorded = await recordStripeTermsAcceptance(checkoutSessionId, env);
      if (!recorded.ok) {
        await expireStripeSession(checkoutSessionId, env);
        return json(
          {
            error: recorded.error || 'Could not record shop terms acceptance',
          },
          502,
          origin,
        );
      }

      return checkoutResponse;
    }

    return entry.fetch(request, env, ctx);
  },
};
