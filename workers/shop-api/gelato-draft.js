import { readCartFromSession, getCartReadiness, publicCartSummary } from './order-cart.js';

const GELATO_ORDERS_API = 'https://order.gelatoapis.com/v4';
const STRIPE_API = 'https://api.stripe.com/v1';
const PRINT_URL_TTL_SECONDS = 60 * 60;
const ALLOWED_SHIPPING_COUNTRIES = new Set(['BE', 'FR', 'LU']);

const json = (data, status = 200) =>
  new Response(JSON.stringify(data), {
    status,
    headers: {
      'content-type': 'application/json; charset=UTF-8',
      'cache-control': 'no-store',
      'x-content-type-options': 'nosniff',
    },
  });

const apiError = async (response, provider) => {
  const text = await response.text();
  let message = `${provider} API error ${response.status}`;

  try {
    const data = text ? JSON.parse(text) : null;
    const providerMessage = data?.message || data?.error?.message || data?.error;
    if (typeof providerMessage === 'string' && providerMessage.trim()) {
      message = providerMessage.trim().slice(0, 300);
    }
  } catch {
    // Provider bodies are deliberately not returned to callers.
  }

  return {
    provider,
    status: response.status,
    message,
  };
};

const fetchStripeSession = async (env, sessionId) => {
  const response = await fetch(`${STRIPE_API}/checkout/sessions/${encodeURIComponent(sessionId)}`, {
    headers: {
      Authorization: `Bearer ${env.STRIPE_SECRET_KEY}`,
    },
  });

  if (!response.ok) return { error: await apiError(response, 'Stripe') };
  return { session: await response.json() };
};

const normalizeShipping = (session) => {
  const source = session?.shipping_details || session?.collected_information?.shipping_details || null;
  const customer = session?.customer_details || {};
  const address = source?.address || null;
  const fullName = String(source?.name || customer?.name || '').trim();
  const parts = fullName.split(/\s+/).filter(Boolean);
  const firstName = (parts.shift() || '').slice(0, 25);
  const lastName = (parts.join(' ') || firstName).slice(0, 25);
  const email = String(customer?.email || '').trim().slice(0, 254);
  const country = String(address?.country || '').toUpperCase();

  if (!source || !address || !firstName || !lastName || !email) return null;
  if (!address.line1 || !address.city || !address.postal_code || !country) return null;
  if (!ALLOWED_SHIPPING_COUNTRIES.has(country)) return null;

  return {
    firstName,
    lastName,
    addressLine1: String(address.line1).slice(0, 35),
    ...(address.line2 ? { addressLine2: String(address.line2).slice(0, 35) } : {}),
    city: String(address.city).slice(0, 30),
    postCode: String(address.postal_code).slice(0, 15),
    ...(address.state ? { state: String(address.state).slice(0, 35) } : {}),
    country,
    email,
    ...(customer?.phone ? { phone: String(customer.phone).slice(0, 25) } : {}),
  };
};

const validateSession = async (env, session) => {
  const blockers = [];
  const metadata = session?.metadata || {};

  if (session?.object !== 'checkout.session') blockers.push('invalid_checkout_session');
  if (!String(session?.id || '').startsWith('cs_test_')) blockers.push('not_a_test_checkout_session');
  if (metadata.aupositeur_mode !== 'test') blockers.push('unexpected_checkout_mode');
  if (session?.payment_status !== 'paid') blockers.push('payment_not_paid');
  if (!metadata.order_reference) blockers.push('missing_order_reference');

  const cart = readCartFromSession(session);
  let readiness = { allReady: false, items: [] };

  if (!cart.ok) {
    blockers.push(cart.code || 'invalid_cart_metadata');
  } else {
    if (session.currency !== cart.currency) blockers.push('currency_mismatch');
    if (session.amount_total !== cart.amountTotal) blockers.push('amount_mismatch');

    readiness = await getCartReadiness(env, cart);
    for (const item of readiness.items) {
      if (!item.readiness.ready) {
        blockers.push(`${item.productSlug}:${item.readiness.reason || 'not_ready'}`);
      }
    }
  }

  const shippingAddress = normalizeShipping(session);
  if (!shippingAddress) blockers.push('invalid_or_unsupported_shipping_address');

  return {
    blockers: [...new Set(blockers)],
    metadata,
    cart,
    readiness,
    shippingAddress,
  };
};

const searchGelatoOrder = async (env, orderReferenceId) => {
  const response = await fetch(`${GELATO_ORDERS_API}/orders:search`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-API-KEY': env.GELATO_API_KEY,
    },
    body: JSON.stringify({
      orderReferenceId,
      orderTypes: ['draft', 'order'],
      limit: 20,
    }),
  });

  if (!response.ok) return { error: await apiError(response, 'Gelato') };
  const data = await response.json();
  const orders = Array.isArray(data?.orders) ? data.orders : [];
  const exact = orders.filter((order) => order?.orderReferenceId === orderReferenceId);
  return { orders: exact };
};

const createCustomerReference = async (email) => {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(email.toLowerCase()));
  const hex = Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, '0')).join('');
  return `AUP-CUST-${hex.slice(0, 20)}`;
};

const createGelatoDraft = async ({ env, session, trusted, printUrls }) => {
  const orderReferenceId = trusted.metadata.order_reference;
  const customerReferenceId = await createCustomerReference(trusted.shippingAddress.email);

  const payload = {
    orderType: 'draft',
    orderReferenceId,
    customerReferenceId,
    currency: String(session.currency || trusted.cart.currency || 'eur').toUpperCase(),
    items: trusted.cart.items.map((item, index) => ({
      itemReferenceId: `${orderReferenceId}-${index + 1}`,
      productUid: item.variant.productUid,
      files: [{ type: 'default', url: printUrls[index].url }],
      quantity: item.quantity,
    })),
    shippingAddress: trusted.shippingAddress,
    metadata: [
      { key: 'aupositeur_mode', value: 'test' },
      { key: 'stripe_session_id', value: String(session.id).slice(0, 100) },
      { key: 'order_schema', value: String(trusted.metadata.order_schema || 'legacy-single-item').slice(0, 100) },
      { key: 'item_count', value: String(trusted.cart.items.length) },
    ],
  };

  const response = await fetch(`${GELATO_ORDERS_API}/orders`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-API-KEY': env.GELATO_API_KEY,
    },
    body: JSON.stringify(payload),
  });

  if (!response.ok) return { error: await apiError(response, 'Gelato') };
  return { order: await response.json() };
};

const bytesToHex = (bytes) =>
  Array.from(new Uint8Array(bytes), (byte) => byte.toString(16).padStart(2, '0')).join('');

const signPrintAccess = async (env, key, expires) => {
  const secret = String(env.PRINT_URL_SIGNING_SECRET || '');
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

const createSignedPrintUrlForWebhook = async (request, env, key) => {
  if (!env.SHOP_ASSETS) return { error: 'R2 binding SHOP_ASSETS is missing', status: 503 };
  const object = await env.SHOP_ASSETS.head(key);
  if (!object) return { error: 'Print master not found', status: 404 };
  const expires = Math.floor(Date.now() / 1000) + PRINT_URL_TTL_SECONDS;
  const sig = await signPrintAccess(env, key, expires);
  const url = new URL(request.url);
  url.pathname = '/print-file';
  url.search = '';
  url.searchParams.set('key', key);
  url.searchParams.set('expires', String(expires));
  url.searchParams.set('sig', sig);
  return { url: url.toString(), expires, expiresInSeconds: PRINT_URL_TTL_SECONDS, key };
};

const createDraftForSession = async ({ request, env, session, createSignedPrintUrl }) => {
  if (!env.GELATO_API_KEY) return { ok: false, status: 503, error: 'Gelato API key is not configured' };
  const trusted = await validateSession(env, session);
  if (trusted.blockers.length > 0) {
    return { ok: false, status: 409, blockers: trusted.blockers, checkoutSessionId: session.id };
  }

  const orderReferenceId = trusted.metadata.order_reference;
  const search = await searchGelatoOrder(env, orderReferenceId);
  if (search.error) return { ok: false, status: 502, error: search.error };

  if (search.orders.length > 0) {
    return {
      ok: true,
      status: 200,
      draftCreated: false,
      duplicatePrevented: true,
      orderReferenceId,
      existingOrders: search.orders.map((order) => ({
        id: order.id,
        orderType: order.orderType,
        fulfillmentStatus: order.fulfillmentStatus,
        financialStatus: order.financialStatus,
      })),
    };
  }

  const printUrls = [];
  for (const item of trusted.cart.items) {
    const signed = createSignedPrintUrl
      ? await createSignedPrintUrl(request, env, item.product.printFileKey)
      : await createSignedPrintUrlForWebhook(request, env, item.product.printFileKey);
    if (signed?.error) return { ok: false, status: signed.status || 500, error: signed.error };
    printUrls.push({ ...signed, key: item.product.printFileKey });
  }

  const created = await createGelatoDraft({ env, session, trusted, printUrls });
  if (created.error) return { ok: false, status: 502, error: created.error };

  const order = created.order;
  if (order?.orderType && order.orderType !== 'draft') {
    return {
      ok: false,
      status: 502,
      error: 'Gelato returned a non-draft order unexpectedly',
      orderId: order.id || null,
      orderType: order.orderType,
    };
  }

  return {
    ok: true,
    status: 201,
    testMode: true,
    draftCreated: true,
    productionOrderCreated: false,
    duplicatePrevented: false,
    checkoutSessionId: session.id,
    orderReferenceId,
    cart: publicCartSummary(trusted.cart),
    gelato: {
      id: order?.id || null,
      orderType: order?.orderType || 'draft',
      fulfillmentStatus: order?.fulfillmentStatus || null,
      financialStatus: order?.financialStatus || null,
    },
    printFiles: printUrls.map((signed, index) => ({
      productSlug: trusted.cart.items[index].productSlug,
      key: signed.key,
      signedUrlExpires: signed.expires,
      signedUrlTtlSeconds: signed.expiresInSeconds,
    })),
  };
};

export const createGelatoDraftFromVerifiedSession = async (request, env, session) =>
  createDraftForSession({ request, env, session });

export const handleAdminGelatoDraftFromSession = async (request, env, createSignedPrintUrl) => {
  if (!env.STRIPE_SECRET_KEY || !String(env.STRIPE_SECRET_KEY).startsWith('sk_test_')) {
    return json({ error: 'Stripe test key is not configured' }, 503);
  }

  let input;
  try {
    input = await request.json();
  } catch {
    return json({ error: 'Invalid JSON body' }, 400);
  }

  const sessionId = String(input?.checkoutSessionId || '').trim();
  if (!sessionId.startsWith('cs_test_')) {
    return json({ error: 'A Stripe test Checkout Session id is required' }, 400);
  }

  const stripeResult = await fetchStripeSession(env, sessionId);
  if (stripeResult.error) return json({ error: stripeResult.error }, 502);

  const result = await createDraftForSession({
    request,
    env,
    session: stripeResult.session,
    createSignedPrintUrl,
  });

  if (!result.ok) return json(result, result.status || 500);
  return json(result, result.status || 200);
};
