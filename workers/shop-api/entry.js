import shopApi from './index.js';
import { handleStripeWebhook } from './stripe-webhook.js';
import { SHOP_CATALOG, resolveVariant, getFulfillmentReadiness } from './shop-catalog.js';

const EXACT_ALLOWED_ORIGINS = new Set([
  'https://www.aupositeur.be',
  'https://aupositeur.be',
  'https://aupositeur-site.pages.dev',
]);

const PREVIEW_ORIGIN_RE = /^https:\/\/[a-z0-9-]+\.aupositeur-site\.pages\.dev$/i;
const STRIPE_API = 'https://api.stripe.com/v1';

const isAllowedOrigin = (origin) =>
  EXACT_ALLOWED_ORIGINS.has(origin) || PREVIEW_ORIGIN_RE.test(origin);

const json = (data, status = 200, origin = '') => {
  const headers = {
    'content-type': 'application/json; charset=UTF-8',
    'cache-control': 'no-store',
  };

  if (isAllowedOrigin(origin)) {
    headers['access-control-allow-origin'] = origin;
    headers.vary = 'Origin';
  }

  return new Response(JSON.stringify(data), { status, headers });
};

const stripeErrorMessage = async (response) => {
  const text = await response.text();

  try {
    const data = text ? JSON.parse(text) : null;
    return data?.error?.message || `Stripe API error ${response.status}`;
  } catch {
    return `Stripe API error ${response.status}`;
  }
};

const createCheckoutSession = async (request, env, origin) => {
  if (!isAllowedOrigin(origin)) {
    return json({ error: 'Origin not allowed' }, 403, origin);
  }

  if (!env.STRIPE_SECRET_KEY || !String(env.STRIPE_SECRET_KEY).startsWith('sk_test_')) {
    return json({ error: 'Stripe test key is not configured' }, 503, origin);
  }

  let input;
  try {
    input = await request.json();
  } catch {
    return json({ error: 'Invalid JSON body' }, 400, origin);
  }

  const productSlug = String(input?.productSlug || '');
  const sku = String(input?.sku || '');
  const quantity = Number(input?.quantity || 1);
  const product = SHOP_CATALOG[productSlug];

  if (!product) {
    return json({ error: 'Unknown product' }, 400, origin);
  }

  if (!Number.isInteger(quantity) || quantity < 1 || quantity > 5) {
    return json({ error: 'Quantity must be between 1 and 5' }, 400, origin);
  }

  const variant = resolveVariant(product, sku);
  if (!variant) {
    return json({ error: 'Unknown or unavailable product variant' }, 400, origin);
  }

  const readiness = await getFulfillmentReadiness(env, product);
  if (!readiness.ready) {
    return json(
      {
        error: 'Product is not ready for fulfillment',
        productSlug,
        reason: readiness.reason,
      },
      409,
      origin,
    );
  }

  const orderReference = `AUP-TEST-${crypto.randomUUID()}`;
  const returnOrigin = origin;
  const successUrl =
    `${returnOrigin}/boutique/merci/?shopTest=1&session_id={CHECKOUT_SESSION_ID}`;
  const cancelUrl =
    `${returnOrigin}/boutique/${encodeURIComponent(productSlug)}/?shopTest=1`;

  const params = new URLSearchParams();
  params.set('mode', 'payment');
  params.set('success_url', successUrl);
  params.set('cancel_url', cancelUrl);
  params.set('client_reference_id', orderReference);
  params.set('billing_address_collection', 'auto');
  params.set('shipping_address_collection[allowed_countries][0]', 'BE');
  params.set('shipping_address_collection[allowed_countries][1]', 'FR');
  params.set('shipping_address_collection[allowed_countries][2]', 'LU');
  params.set('line_items[0][price_data][currency]', product.currency);
  params.set('line_items[0][price_data][unit_amount]', String(product.unitAmount));
  params.set('line_items[0][price_data][product_data][name]', `${product.title} — ${variant.label}`);
  params.set(
    'line_items[0][price_data][product_data][description]',
    'Affiche encadrée Aupositeur · 30 × 40 cm',
  );
  params.set('line_items[0][quantity]', String(quantity));
  params.set('metadata[aupositeur_mode]', 'test');
  params.set('metadata[order_reference]', orderReference);
  params.set('metadata[product_slug]', productSlug);
  params.set('metadata[sku]', variant.sku);
  params.set('metadata[gelato_template_id]', product.templateId);
  params.set('metadata[gelato_product_uid]', variant.productUid);
  params.set('metadata[quantity]', String(quantity));
  params.set('metadata[print_file_key]', product.printFileKey);

  const response = await fetch(`${STRIPE_API}/checkout/sessions`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${env.STRIPE_SECRET_KEY}`,
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    body: params.toString(),
  });

  if (!response.ok) {
    return json({ error: await stripeErrorMessage(response) }, 502, origin);
  }

  const session = await response.json();

  return json(
    {
      ok: true,
      mode: 'test',
      gelatoOrderCreated: false,
      fulfillmentReady: true,
      orderReference,
      sessionId: session.id,
      url: session.url,
    },
    201,
    origin,
  );
};

export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);
    const origin = request.headers.get('Origin') || '';

    if (url.pathname === '/stripe/webhook') {
      if (request.method !== 'POST') {
        return json({ error: 'Method not allowed' }, 405);
      }
      return handleStripeWebhook(request, env);
    }

    if (url.pathname === '/checkout/session') {
      if (request.method === 'OPTIONS') {
        if (!isAllowedOrigin(origin)) return new Response(null, { status: 403 });

        return new Response(null, {
          status: 204,
          headers: {
            'access-control-allow-origin': origin,
            'access-control-allow-methods': 'POST, OPTIONS',
            'access-control-allow-headers': 'Content-Type',
            'access-control-max-age': '86400',
            vary: 'Origin',
          },
        });
      }

      if (request.method === 'POST') {
        return createCheckoutSession(request, env, origin);
      }
    }

    return shopApi.fetch(request, env, ctx);
  },
};
