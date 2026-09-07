import shopApi from './index.js';
import { handleStripeWebhook } from './stripe-webhook.js';
import { handleAdminGelatoDraftFromSession } from './gelato-draft.js';
import { SHOP_CATALOG, getFulfillmentReadiness } from './shop-catalog.js';
import {
  resolveCartInput,
  writeCartMetadata,
  getCartReadiness,
  publicCartSummary,
} from './order-cart.js';

const EXACT_ALLOWED_ORIGINS = new Set([
  'https://www.aupositeur.be',
  'https://aupositeur.be',
  'https://aupositeur-site.pages.dev',
]);

const PREVIEW_ORIGIN_RE = /^https:\/\/[a-z0-9-]+\.aupositeur-site\.pages\.dev$/i;
const STRIPE_API = 'https://api.stripe.com/v1';
const BUILD_MARKER = 'cart-checkout-v1';
const PRINT_URL_TTL_SECONDS = 60 * 60;

const isAllowedOrigin = (origin) =>
  EXACT_ALLOWED_ORIGINS.has(origin) || PREVIEW_ORIGIN_RE.test(origin);

const json = (data, status = 200, origin = '') => {
  const headers = {
    'content-type': 'application/json; charset=UTF-8',
    'cache-control': 'no-store',
    'x-content-type-options': 'nosniff',
  };

  if (isAllowedOrigin(origin)) {
    headers['access-control-allow-origin'] = origin;
    headers.vary = 'Origin';
  }

  return new Response(JSON.stringify(data), { status, headers });
};

const isAdmin = (request, env) => {
  const provided = request.headers.get('X-Aupositeur-Admin') || '';
  return Boolean(env.SHOP_ADMIN_TOKEN) && provided === env.SHOP_ADMIN_TOKEN;
};

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

const printSigningSecret = (env) => String(env.PRINT_URL_SIGNING_SECRET || '');

const signPrintAccess = async (env, key, expires) => {
  const secret = printSigningSecret(env);
  if (!secret) throw new Error('Print URL signing secret is not configured');

  const cryptoKey = await crypto.subtle.importKey(
    'raw',
    new TextEncoder().encode(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign'],
  );
  const digest = await crypto.subtle.sign(
    'HMAC',
    cryptoKey,
    new TextEncoder().encode(`${key}\n${expires}`),
  );
  return bytesToHex(digest);
};

const isConfiguredPrintKey = (key) =>
  Object.values(SHOP_CATALOG).some((product) => product.printFileKey === key);

const createSignedPrintUrl = async (request, env, key) => {
  if (!isConfiguredPrintKey(key)) {
    return { error: 'Print master is not configured in the shop catalog', status: 404 };
  }
  if (!env.SHOP_ASSETS) {
    return { error: 'R2 binding SHOP_ASSETS is missing', status: 503 };
  }

  const object = await env.SHOP_ASSETS.head(key);
  if (!object) return { error: 'Print master not found', status: 404 };

  const expires = Math.floor(Date.now() / 1000) + PRINT_URL_TTL_SECONDS;
  const signature = await signPrintAccess(env, key, expires);
  const url = new URL(request.url);
  url.pathname = '/print-file';
  url.search = '';
  url.searchParams.set('key', key);
  url.searchParams.set('expires', String(expires));
  url.searchParams.set('sig', signature);

  return {
    ok: true,
    private: true,
    key,
    bytes: object.size ?? null,
    expires,
    expiresInSeconds: PRINT_URL_TTL_SECONDS,
    url: url.toString(),
  };
};

const serveSignedPrintFile = async (request, env) => {
  if (request.method !== 'GET' && request.method !== 'HEAD') {
    return json({ error: 'Method not allowed' }, 405);
  }
  if (!env.SHOP_ASSETS) return json({ error: 'Not found' }, 404);

  const url = new URL(request.url);
  const key = url.searchParams.get('key') || '';
  const expires = Number(url.searchParams.get('expires'));
  const signature = url.searchParams.get('sig') || '';

  if (!key || !Number.isInteger(expires) || !signature || !isConfiguredPrintKey(key)) {
    return json({ error: 'Not found' }, 404);
  }

  const now = Math.floor(Date.now() / 1000);
  if (expires <= now || expires > now + PRINT_URL_TTL_SECONDS + 60) {
    return json({ error: 'Print URL expired' }, 403);
  }

  let expected;
  try {
    expected = await signPrintAccess(env, key, expires);
  } catch {
    return json({ error: 'Print delivery unavailable' }, 503);
  }
  if (!safeEqual(signature, expected)) return json({ error: 'Invalid print URL signature' }, 403);

  const object = request.method === 'HEAD'
    ? await env.SHOP_ASSETS.head(key)
    : await env.SHOP_ASSETS.get(key);
  if (!object) return json({ error: 'Not found' }, 404);

  const headers = new Headers();
  headers.set('content-type', object.httpMetadata?.contentType || 'application/octet-stream');
  headers.set('content-length', String(object.size));
  headers.set('cache-control', 'private, no-store, max-age=0');
  headers.set('content-disposition', 'inline');
  headers.set('x-content-type-options', 'nosniff');
  if (object.httpEtag) headers.set('etag', object.httpEtag);

  return new Response(request.method === 'HEAD' ? null : object.body, { status: 200, headers });
};

const listPrintMasters = async (env) => {
  if (!env.SHOP_ASSETS) {
    return { error: 'R2 binding SHOP_ASSETS is missing', status: 503 };
  }

  const objects = [];
  let cursor;

  do {
    const page = await env.SHOP_ASSETS.list({
      prefix: 'print-masters/',
      cursor,
      include: ['httpMetadata', 'customMetadata'],
      limit: 1000,
    });

    for (const object of page.objects || []) {
      objects.push({
        key: object.key,
        bytes: object.size ?? null,
        uploaded: object.uploaded ? new Date(object.uploaded).toISOString() : null,
        mime: object.httpMetadata?.contentType || null,
        originalName: object.customMetadata?.originalName || null,
        kind: object.customMetadata?.kind || null,
      });
    }

    cursor = page.truncated ? page.cursor : undefined;
  } while (cursor);

  objects.sort((a, b) => String(a.uploaded || '').localeCompare(String(b.uploaded || '')));

  return {
    ok: true,
    prefix: 'print-masters/',
    count: objects.length,
    objects,
  };
};

const auditFulfillmentReadiness = async (env) => {
  const products = [];

  for (const [slug, product] of Object.entries(SHOP_CATALOG)) {
    const readiness = await getFulfillmentReadiness(env, product);
    products.push({
      slug,
      title: product.title,
      templateId: product.templateId,
      printFileKey: product.printFileKey,
      ...readiness,
    });
  }

  return {
    ok: true,
    allReady: products.every((product) => product.ready),
    readyCount: products.filter((product) => product.ready).length,
    total: products.length,
    products,
  };
};

const stripeErrorMessage = async (response) => {
  const text = await response.text();

  try {
    const data = text ? JSON.parse(text) : null;
    const message = data?.error?.message;
    return typeof message === 'string' && message.trim()
      ? message.trim().slice(0, 300)
      : `Stripe API error ${response.status}`;
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

  const cart = resolveCartInput(input);
  if (!cart.ok) {
    return json(
      {
        error: cart.error || 'Invalid cart',
        code: cart.code || 'invalid_cart',
        productSlug: cart.productSlug || null,
      },
      cart.status || 400,
      origin,
    );
  }

  const readiness = await getCartReadiness(env, cart);
  if (!readiness.allReady) {
    return json(
      {
        error: 'One or more products are not ready for fulfillment',
        code: 'cart_not_ready',
        items: readiness.items
          .filter((item) => !item.readiness.ready)
          .map((item) => ({ productSlug: item.productSlug, reason: item.readiness.reason })),
      },
      409,
      origin,
    );
  }

  const orderReference = `AUP-TEST-${crypto.randomUUID()}`;
  const returnOrigin = origin;
  const successUrl =
    `${returnOrigin}/boutique/merci/?shopTest=1&session_id={CHECKOUT_SESSION_ID}`;
  const cancelUrl = Array.isArray(input?.items)
    ? `${returnOrigin}/panier/?shopTest=1`
    : `${returnOrigin}/boutique/${encodeURIComponent(cart.items[0].productSlug)}/?shopTest=1`;

  const params = new URLSearchParams();
  params.set('mode', 'payment');
  params.set('success_url', successUrl);
  params.set('cancel_url', cancelUrl);
  params.set('client_reference_id', orderReference);
  params.set('billing_address_collection', 'auto');
  params.set('shipping_address_collection[allowed_countries][0]', 'BE');
  params.set('shipping_address_collection[allowed_countries][1]', 'FR');
  params.set('shipping_address_collection[allowed_countries][2]', 'LU');
  params.set('branding_settings[display_name]', 'AUPOSITEUR');
  params.set('branding_settings[font_family]', 'lora');
  params.set('branding_settings[border_style]', 'rectangular');
  params.set('branding_settings[background_color]', '#171714');
  params.set('branding_settings[button_color]', '#D4683B');

  cart.items.forEach((item, index) => {
    params.set(`line_items[${index}][price_data][currency]`, item.currency);
    params.set(`line_items[${index}][price_data][unit_amount]`, String(item.unitAmount));
    params.set(
      `line_items[${index}][price_data][product_data][name]`,
      `${item.product.title} — ${item.variant.label}`,
    );
    params.set(
      `line_items[${index}][price_data][product_data][description]`,
      'Affiche encadrée Aupositeur · 30 × 40 cm',
    );
    params.set(`line_items[${index}][quantity]`, String(item.quantity));
  });

  writeCartMetadata(params, cart, orderReference);

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
      orderSchema: 'cart-v1',
      gelatoOrderCreated: false,
      fulfillmentReady: true,
      orderReference,
      cart: publicCartSummary(cart),
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

    if (url.pathname === '/__build') {
      if (request.method !== 'GET') {
        return json({ error: 'Method not allowed' }, 405, origin);
      }

      return json(
        {
          service: 'aupositeur-shop-api',
          status: 'ok',
          buildMarker: BUILD_MARKER,
          fulfillmentReadinessRoute: '/admin/fulfillment/readiness',
          signedPrintDelivery: true,
          signedPrintTtlSeconds: PRINT_URL_TTL_SECONDS,
          gelatoDraftRoute: '/admin/gelato/draft-from-session',
          gelatoDraftOnly: true,
          multiItemCheckout: true,
        },
        200,
        origin,
      );
    }

    if (url.pathname === '/print-file') {
      return serveSignedPrintFile(request, env);
    }

    if (url.pathname === '/stripe/webhook') {
      if (request.method !== 'POST') {
        return json({ error: 'Method not allowed' }, 405);
      }
      return handleStripeWebhook(request, env);
    }

    if (url.pathname === '/admin/print-files/list') {
      if (request.method !== 'GET') {
        return json({ error: 'Method not allowed' }, 405, origin);
      }
      if (!isAdmin(request, env)) {
        return json({ error: 'Unauthorized' }, 401, origin);
      }

      const result = await listPrintMasters(env);
      if (result?.error) {
        return json({ error: result.error }, result.status || 500, origin);
      }
      return json(result, 200, origin);
    }

    if (url.pathname === '/admin/print-files/signed-url') {
      if (request.method !== 'POST') {
        return json({ error: 'Method not allowed' }, 405, origin);
      }
      if (!isAdmin(request, env)) {
        return json({ error: 'Unauthorized' }, 401, origin);
      }

      let input;
      try {
        input = await request.json();
      } catch {
        return json({ error: 'Invalid JSON body' }, 400, origin);
      }

      try {
        const result = await createSignedPrintUrl(request, env, String(input?.printFileKey || ''));
        if (result?.error) return json({ error: result.error }, result.status || 500, origin);
        return json(result, 201, origin);
      } catch (error) {
        return json(
          { error: error instanceof Error ? error.message : 'Could not create signed print URL' },
          500,
          origin,
        );
      }
    }

    if (url.pathname === '/admin/gelato/draft-from-session') {
      if (request.method !== 'POST') {
        return json({ error: 'Method not allowed' }, 405, origin);
      }
      if (!isAdmin(request, env)) {
        return json({ error: 'Unauthorized' }, 401, origin);
      }

      return handleAdminGelatoDraftFromSession(request, env, createSignedPrintUrl);
    }

    if (url.pathname === '/admin/fulfillment/readiness') {
      if (request.method !== 'GET') {
        return json({ error: 'Method not allowed' }, 405, origin);
      }
      if (!isAdmin(request, env)) {
        return json({ error: 'Unauthorized' }, 401, origin);
      }

      const result = await auditFulfillmentReadiness(env);
      return json(result, result.allReady ? 200 : 409, origin);
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
