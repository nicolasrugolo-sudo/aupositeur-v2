import { SHOP_CATALOG, resolveVariant, getFulfillmentReadiness } from './shop-catalog.js';

const SIGNATURE_TOLERANCE_SECONDS = 300;

const json = (data, status = 200) =>
  new Response(JSON.stringify(data), {
    status,
    headers: {
      'content-type': 'application/json; charset=UTF-8',
      'cache-control': 'no-store',
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

const validateCheckoutMetadata = (session) => {
  const metadata = session?.metadata || {};
  const required = [
    'order_reference',
    'product_slug',
    'sku',
    'gelato_template_id',
    'gelato_product_uid',
    'quantity',
    'print_file_key',
  ];
  const missing = required.filter((key) => !metadata[key]);
  return { metadata, missing };
};

const validateTrustedProduct = (session, metadata) => {
  const blockers = [];
  const product = SHOP_CATALOG[metadata.product_slug];

  if (!product) {
    blockers.push('unknown_product');
    return { blockers, product: null, variant: null };
  }

  const quantity = Number(metadata.quantity);
  if (!Number.isInteger(quantity) || quantity < 1 || quantity > 5) {
    blockers.push('invalid_quantity');
  }

  if (metadata.gelato_template_id !== product.templateId) {
    blockers.push('template_mismatch');
  }

  const variant = resolveVariant(product, metadata.sku);
  if (!variant) {
    blockers.push('sku_mismatch');
  } else if (metadata.gelato_product_uid !== variant.productUid) {
    blockers.push('product_uid_mismatch');
  }

  if (session.currency !== product.currency) {
    blockers.push('currency_mismatch');
  }

  const expectedAmount = product.unitAmount * quantity;
  if (session.amount_total !== expectedAmount) {
    blockers.push('amount_mismatch');
  }

  if (!product.printFileKey) {
    blockers.push('missing_print_file_configuration');
  } else if (metadata.print_file_key !== product.printFileKey) {
    blockers.push('print_file_mismatch');
  }

  return { blockers, product, variant };
};

const validateShippingDetails = (session) => {
  const shipping = session?.shipping_details || session?.collected_information?.shipping_details || null;
  const customer = session?.customer_details || {};
  const address = shipping?.address || null;
  const name = String(shipping?.name || customer?.name || '').trim();
  const email = String(customer?.email || '').trim();
  const blockers = [];

  if (!shipping) blockers.push('missing_shipping_details');
  if (!name) blockers.push('missing_recipient_name');
  if (!address?.line1) blockers.push('missing_address_line1');
  if (!address?.city) blockers.push('missing_city');
  if (!address?.postal_code) blockers.push('missing_postal_code');
  if (!address?.country) blockers.push('missing_country');
  if (!email) blockers.push('missing_email');

  return {
    blockers,
    shipping: shipping
      ? {
          name,
          email,
          phone: customer?.phone || null,
          address: {
            line1: address?.line1 || null,
            line2: address?.line2 || null,
            city: address?.city || null,
            postalCode: address?.postal_code || null,
            state: address?.state || null,
            country: address?.country || null,
          },
        }
      : null,
  };
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

  if (event.type !== 'checkout.session.completed') {
    return json({
      received: true,
      ignored: true,
      eventId: event.id || null,
      eventType: event.type || null,
    });
  }

  const session = event?.data?.object;
  if (!session || session.object !== 'checkout.session') {
    return json({ error: 'Invalid Checkout Session event object' }, 400);
  }

  const { metadata, missing } = validateCheckoutMetadata(session);
  if (metadata.aupositeur_mode !== 'test') {
    return json({ error: 'Unexpected Aupositeur checkout mode' }, 400);
  }

  if (missing.length > 0) {
    return json({ error: 'Missing Checkout metadata', missing }, 400);
  }

  const paid = session.payment_status === 'paid';
  const trusted = validateTrustedProduct(session, metadata);
  const shipping = validateShippingDetails(session);
  const readiness = await getFulfillmentReadiness(env, trusted.product);
  const blockers = [...trusted.blockers, ...shipping.blockers];

  if (!readiness.ready && readiness.reason) {
    blockers.push(readiness.reason);
  }

  if (!paid) blockers.push('payment_not_paid');

  const uniqueBlockers = [...new Set(blockers)];
  const readyForGelatoDraft = uniqueBlockers.length === 0;

  return json({
    received: true,
    verified: true,
    dryRun: true,
    gelatoOrderCreated: false,
    eligibleForFulfillment: paid,
    readyForGelatoDraft,
    blockers: uniqueBlockers,
    eventId: event.id || null,
    eventType: event.type,
    checkoutSessionId: session.id || null,
    paymentStatus: session.payment_status || null,
    amountTotal: session.amount_total ?? null,
    currency: session.currency || null,
    order: {
      reference: metadata.order_reference,
      productSlug: metadata.product_slug,
      sku: metadata.sku,
      quantity: Number(metadata.quantity),
      gelatoTemplateId: metadata.gelato_template_id,
      gelatoProductUid: metadata.gelato_product_uid,
      printFileKey: trusted.product?.printFileKey || null,
      printFilePresent: readiness.printFilePresent || false,
      printFileBytes: readiness.printFileBytes ?? null,
      shipping: shipping.shipping,
    },
  });
};
