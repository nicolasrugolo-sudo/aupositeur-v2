import entry from './entry.js';
import { handleAdminGelatoMarketAudit } from './gelato-market-audit.js';
import { SHOP_CATALOG, resolveVariant } from './shop-catalog.js';

const SHOP_TERMS_VERSION = '2026-09-06';
const STRIPE_API = 'https://api.stripe.com/v1';

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

export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);
    const origin = request.headers.get('Origin') || '';

    if (url.pathname === '/admin/gelato/market-audit') {
      if (request.method !== 'POST') return json({ error: 'Method not allowed' }, 405, origin);
      if (!isAdmin(request, env)) return json({ error: 'Unauthorized' }, 401, origin);
      return handleAdminGelatoMarketAudit(request, env, SHOP_CATALOG, resolveVariant);
    }

    if (url.pathname === '/checkout/session' && request.method === 'POST') {
      let input;
      try {
        input = await request.clone().json();
      } catch {
        return json({ error: 'Invalid JSON body' }, 400, origin);
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

      const sessionId = String(checkoutData?.sessionId || '');
      if (!sessionId.startsWith('cs_test_')) {
        return json({ error: 'Expected a Stripe test Checkout Session' }, 502, origin);
      }

      const recorded = await recordStripeTermsAcceptance(sessionId, env);
      if (!recorded.ok) {
        await expireStripeSession(sessionId, env);
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
