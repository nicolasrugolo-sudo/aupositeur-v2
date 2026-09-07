import { SHOP_CATALOG, resolveVariant, getFulfillmentReadiness } from './shop-catalog.js';

export const CART_SCHEMA = 'cart-v1';
export const MAX_DISTINCT_ITEMS = 10;
export const MAX_ITEM_QUANTITY = 5;
export const MAX_TOTAL_QUANTITY = 20;

const cleanString = (value) => String(value || '').trim();

const resolveOne = (productSlug, sku, quantity) => {
  const product = SHOP_CATALOG[productSlug] || null;
  if (!product) return { error: 'unknown_product', productSlug };

  if (!Number.isInteger(quantity) || quantity < 1 || quantity > MAX_ITEM_QUANTITY) {
    return { error: 'invalid_quantity', productSlug };
  }

  const variant = resolveVariant(product, sku);
  if (!variant) return { error: 'sku_mismatch', productSlug };

  return {
    item: {
      productSlug,
      sku: variant.sku,
      quantity,
      product,
      variant,
      unitAmount: product.unitAmount,
      currency: product.currency,
      lineAmount: product.unitAmount * quantity,
    },
  };
};

export const resolveCartInput = (input) => {
  const rawItems = Array.isArray(input?.items)
    ? input.items
    : input?.productSlug
      ? [{ productSlug: input.productSlug, sku: input.sku, quantity: input.quantity || 1 }]
      : [];

  if (rawItems.length < 1) {
    return { ok: false, status: 400, error: 'Cart is empty', code: 'empty_cart' };
  }

  if (rawItems.length > MAX_DISTINCT_ITEMS) {
    return { ok: false, status: 400, error: 'Too many distinct cart items', code: 'too_many_items' };
  }

  const merged = new Map();
  for (const raw of rawItems) {
    const productSlug = cleanString(raw?.productSlug);
    const sku = cleanString(raw?.sku);
    const quantity = Number(raw?.quantity || 1);
    const key = `${productSlug}::${sku}`;
    const previous = merged.get(key) || { productSlug, sku, quantity: 0 };
    previous.quantity += quantity;
    merged.set(key, previous);
  }

  const items = [];
  let totalQuantity = 0;
  let amountTotal = 0;
  let currency = null;

  for (const raw of merged.values()) {
    const resolved = resolveOne(raw.productSlug, raw.sku, raw.quantity);
    if (resolved.error) {
      return {
        ok: false,
        status: 400,
        error: 'Invalid cart item',
        code: resolved.error,
        productSlug: resolved.productSlug || raw.productSlug,
      };
    }

    const item = resolved.item;
    if (currency && currency !== item.currency) {
      return { ok: false, status: 400, error: 'Mixed currencies are not supported', code: 'currency_mismatch' };
    }
    currency = item.currency;
    totalQuantity += item.quantity;
    amountTotal += item.lineAmount;
    items.push(item);
  }

  if (totalQuantity > MAX_TOTAL_QUANTITY) {
    return { ok: false, status: 400, error: 'Cart quantity limit exceeded', code: 'cart_quantity_limit' };
  }

  return { ok: true, items, totalQuantity, amountTotal, currency: currency || 'eur' };
};

export const writeCartMetadata = (params, cart, orderReference) => {
  params.set('metadata[aupositeur_mode]', 'test');
  params.set('metadata[order_reference]', orderReference);
  params.set('metadata[order_schema]', CART_SCHEMA);
  params.set('metadata[cart_count]', String(cart.items.length));
  params.set('metadata[cart_total_quantity]', String(cart.totalQuantity));

  cart.items.forEach((item, index) => {
    params.set(`metadata[cart_item_${index}_slug]`, item.productSlug);
    params.set(`metadata[cart_item_${index}_sku]`, item.sku);
    params.set(`metadata[cart_item_${index}_quantity]`, String(item.quantity));
  });
};

export const readCartFromSession = (session) => {
  const metadata = session?.metadata || {};

  if (metadata.order_schema === CART_SCHEMA) {
    const count = Number(metadata.cart_count);
    if (!Number.isInteger(count) || count < 1 || count > MAX_DISTINCT_ITEMS) {
      return { ok: false, code: 'invalid_cart_metadata', items: [] };
    }

    const rawItems = [];
    for (let index = 0; index < count; index += 1) {
      rawItems.push({
        productSlug: metadata[`cart_item_${index}_slug`],
        sku: metadata[`cart_item_${index}_sku`],
        quantity: Number(metadata[`cart_item_${index}_quantity`]),
      });
    }

    const resolved = resolveCartInput({ items: rawItems });
    if (!resolved.ok) return { ok: false, code: resolved.code || 'invalid_cart_metadata', items: [] };
    return resolved;
  }

  // Backward compatibility for the single-product test sessions already created.
  if (metadata.product_slug && metadata.sku) {
    return resolveCartInput({
      productSlug: metadata.product_slug,
      sku: metadata.sku,
      quantity: Number(metadata.quantity || 1),
    });
  }

  return { ok: false, code: 'missing_cart_metadata', items: [] };
};

export const getCartReadiness = async (env, cart) => {
  const items = [];
  let allReady = true;

  for (const item of cart.items || []) {
    const readiness = await getFulfillmentReadiness(env, item.product);
    if (!readiness.ready) allReady = false;
    items.push({ ...item, readiness });
  }

  return { allReady, items };
};

export const publicCartSummary = (cart) => ({
  items: (cart.items || []).map((item) => ({
    productSlug: item.productSlug,
    productTitle: item.product?.title || null,
    sku: item.sku,
    variant: item.variant?.label || null,
    quantity: item.quantity,
    unitAmount: item.unitAmount,
    lineAmount: item.lineAmount,
    currency: item.currency,
  })),
  totalQuantity: cart.totalQuantity || 0,
  amountTotal: cart.amountTotal || 0,
  currency: cart.currency || 'eur',
});
