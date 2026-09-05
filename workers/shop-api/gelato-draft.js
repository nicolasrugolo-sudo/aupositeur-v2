import { SHOP_CATALOG, resolveVariant, getFulfillmentReadiness } from './shop-catalog.js';

const GELATO_ORDERS_API = 'https://order.gelatoapis.com/v4';
const STRIPE_API = 'https://api.stripe.com/v1';

const json = (data, status = 200) =>
  new Response(JSON.stringify(data), {
    status,
    headers: {
      'content-type': 'application/json; charset=UTF-8',
      'cache-control': 'no-store',
    },
  });

const apiError = async (response, provider) => {
  const text = await response.text();
  try {
    const data = text ? JSON.parse(text) : null;
    return {
      provider,
      status: response.status,
      message: data?.message || data?.error?.message || data?.error || `${provider} API error`,
      details: data,
    };
  } catch {
    return {
      provider,
      status: response.status,
      message: `${provider} API error ${response.status}`,
      details: text || null,
    };
  }
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
  const email = String(customer?.email || '').trim();

  if (!source || !address || !firstName || !lastName || !email) return null;
  if (!address.line1 || !address.city || !address.postal_code || !address.country) return null;

  return {
    firstName,
    lastName,
    addressLine1: String(address.line1).slice(0, 35),
    ...(address.line2 ? { addressLine2: String(address.line2).slice(0, 35) } : {}),
    city: String(address.city).slice(0, 30),
    postCode: String(address.postal_code).slice(0, 15),
    ...(address.state ? { state: String(address.state).slice(0, 35) } : {}),
    country: String(address.country).toUpperCase(),
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

  const product = SHOP_CATALOG[metadata.product_slug];
  if (!product) blockers.push('unknown_product');

  const quantity = Number(metadata.quantity);
  if (!Number.isInteger(quantity) || quantity < 1 || quantity > 5) blockers.push('invalid_quantity');

  const variant = product ? resolveVariant(product, metadata.sku) : null;
  if (!variant) blockers.push('sku_mismatch');
  if (product && metadata.gelato_template_id !== product.templateId) blockers.push('template_mismatch');
  if (variant && metadata.gelato_product_uid !== variant.productUid) blockers.push('product_uid_mismatch');
  if (product && metadata.print_file_key !== product.printFileKey) blockers.push('print_file_mismatch');

  if (product) {
    if (session.currency !== product.currency) blockers.push('currency_mismatch');
    if (Number.isInteger(quantity) && session.amount_total !== product.unitAmount * quantity) {
      blockers.push('amount_mismatch');
    }
  }

  const shippingAddress = normalizeShipping(session);
  if (!shippingAddress) blockers.push('invalid_shipping_address');

  const readiness = product
    ? await getFulfillmentReadiness(env, product)
    : { ready: false, reason: 'unknown_product' };
  if (!readiness.ready && readiness.reason) blockers.push(readiness.reason);

  if (!metadata.order_reference) blockers.push('missing_order_reference');

  return {
    blockers: [...new Set(blockers)],
    metadata,
    product,
    variant,
    quantity,
    shippingAddress,
    readiness,
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

const createGelatoDraft = async ({ env, session, trusted, printUrl }) => {
  const orderReferenceId = trusted.metadata.order_reference;
  const customerReferenceId = await createCustomerReference(trusted.shippingAddress.email);
  const itemReferenceId = `${orderReferenceId}-1`;

  const payload = {
    orderType: 'draft',
    orderReferenceId,
    customerReferenceId,
    currency: String(session.currency || trusted.product.currency).toUpperCase(),
    items: [
      {
        itemReferenceId,
        productUid: trusted.variant.productUid,
        files: [
          {
            type: 'default',
            url: printUrl,
          },
        ],
        quantity: trusted.quantity,
      },
    ],
    shippingAddress: trusted.shippingAddress,
    metadata: [
      { key: 'aupositeur_mode', value: 'test' },
      { key: 'stripe_session_id', value: String(session.id).slice(0, 100) },
      { key: 'product_slug', value: String(trusted.metadata.product_slug).slice(0, 100) },
      { key: 'sku', value: String(trusted.metadata.sku).slice(0, 100) },
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
  return { order: await response.json(), payload };
};

export const handleAdminGelatoDraftFromSession = async (request, env, createSignedPrintUrl) => {
  if (!env.GELATO_API_KEY) {
    return json({ error: 'Gelato API key is not configured' }, 503);
  }
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

  const session = stripeResult.session;
  const trusted = await validateSession(env, session);
  if (trusted.blockers.length > 0) {
    return json(
      {
        ok: false,
        draftCreated: false,
        blockers: trusted.blockers,
        checkoutSessionId: session.id,
      },
      409,
    );
  }

  const orderReferenceId = trusted.metadata.order_reference;
  const search = await searchGelatoOrder(env, orderReferenceId);
  if (search.error) return json({ error: search.error }, 502);

  if (search.orders.length > 0) {
    return json({
      ok: true,
      draftCreated: false,
      duplicatePrevented: true,
      orderReferenceId,
      existingOrders: search.orders.map((order) => ({
        id: order.id,
        orderType: order.orderType,
        fulfillmentStatus: order.fulfillmentStatus,
        financialStatus: order.financialStatus,
      })),
    });
  }

  const signed = await createSignedPrintUrl(request, env, trusted.product.printFileKey);
  if (signed?.error) {
    return json({ error: signed.error }, signed.status || 500);
  }

  const created = await createGelatoDraft({
    env,
    session,
    trusted,
    printUrl: signed.url,
  });
  if (created.error) return json({ error: created.error }, 502);

  const order = created.order;
  if (order?.orderType && order.orderType !== 'draft') {
    return json(
      {
        error: 'Gelato returned a non-draft order unexpectedly',
        orderId: order.id || null,
        orderType: order.orderType,
      },
      502,
    );
  }

  return json(
    {
      ok: true,
      testMode: true,
      draftCreated: true,
      productionOrderCreated: false,
      duplicatePrevented: false,
      checkoutSessionId: session.id,
      orderReferenceId,
      gelato: {
        id: order?.id || null,
        orderType: order?.orderType || 'draft',
        fulfillmentStatus: order?.fulfillmentStatus || null,
        financialStatus: order?.financialStatus || null,
      },
      printFile: {
        key: trusted.product.printFileKey,
        signedUrlExpires: signed.expires,
        signedUrlTtlSeconds: signed.expiresInSeconds,
      },
    },
    201,
  );
};
