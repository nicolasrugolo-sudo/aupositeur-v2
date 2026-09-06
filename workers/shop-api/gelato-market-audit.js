const GELATO_PRODUCT_API = 'https://product.gelatoapis.com/v3';
const GELATO_SHIPMENT_API = 'https://shipment.gelatoapis.com/v1';

const MARKETS = [
  { country: 'BE', label: 'Belgique' },
  { country: 'FR', label: 'France' },
  { country: 'LU', label: 'Luxembourg' },
  { country: 'MC', label: 'Monaco' },
  { country: 'CH', label: 'Suisse' },
  { country: 'CA', label: 'Canada' },
];

const readJson = async (response) => {
  const text = await response.text();
  if (!text) return null;
  try {
    return JSON.parse(text);
  } catch {
    return { raw: text };
  }
};

const gelatoFetch = async (url, env, init = {}) => {
  const response = await fetch(url, {
    ...init,
    headers: {
      'X-API-KEY': env.GELATO_API_KEY,
      ...(init.body ? { 'Content-Type': 'application/json' } : {}),
      ...(init.headers || {}),
    },
  });
  const data = await readJson(response);
  return { ok: response.ok, status: response.status, data };
};

const pickQuantityOnePrice = (data, country) => {
  if (!Array.isArray(data)) return null;
  const row = data.find((entry) =>
    String(entry?.country || '').toUpperCase() === country && Number(entry?.quantity) === 1,
  );
  if (!row) return null;
  return {
    price: Number(row.price),
    currency: row.currency || 'EUR',
  };
};

const pickShipping = (data) => {
  const prices = Array.isArray(data?.prices) ? data.prices : [];
  const quantity = prices[0]?.quantities?.find((entry) => Number(entry?.quantity) === 1);
  const methods = Array.isArray(quantity?.methods) ? quantity.methods : [];
  const normal = methods.filter((method) => method?.type === 'normal');
  const pool = normal.length ? normal : methods;
  if (!pool.length) return { methods: [], cheapest: null };

  const normalized = pool
    .map((method) => ({
      shipmentMethodUid: method.shipmentMethodUid || null,
      type: method.type || null,
      minPrice: Number(method.minPrice),
      avgPrice: Number(method.avgPrice),
      minDays: Number(method.minDays),
      maxDays: Number(method.maxDays),
      hasFlatRate: Boolean(method.hasFlatRate),
    }))
    .filter((method) => Number.isFinite(method.minPrice))
    .sort((a, b) => a.minPrice - b.minPrice);

  return { methods: normalized, cheapest: normalized[0] || null };
};

export const handleAdminGelatoMarketAudit = async (request, env, catalog, resolveVariant) => {
  if (!env.GELATO_API_KEY) {
    return new Response(JSON.stringify({ error: 'GELATO_API_KEY is not configured' }), {
      status: 503,
      headers: { 'content-type': 'application/json; charset=UTF-8', 'cache-control': 'no-store' },
    });
  }

  let input = {};
  try {
    input = await request.json();
  } catch {
    // Empty body is allowed: default to the first catalog product and its BLACK variant.
  }

  const productSlug = String(input?.productSlug || 'ames');
  const product = catalog[productSlug];
  if (!product) {
    return new Response(JSON.stringify({ error: 'Unknown product' }), {
      status: 400,
      headers: { 'content-type': 'application/json; charset=UTF-8', 'cache-control': 'no-store' },
    });
  }

  const requestedSku = String(input?.sku || '');
  const variant = requestedSku
    ? resolveVariant(product, requestedSku)
    : product.variants.find((entry) => /BLACK$/i.test(entry.sku)) || product.variants[0];

  if (!variant?.productUid) {
    return new Response(JSON.stringify({ error: 'No Gelato product UID for selected variant' }), {
      status: 400,
      headers: { 'content-type': 'application/json; charset=UTF-8', 'cache-control': 'no-store' },
    });
  }

  const markets = [];
  for (const market of MARKETS) {
    const country = market.country;
    const priceUrl = new URL(`${GELATO_PRODUCT_API}/products/${encodeURIComponent(variant.productUid)}/prices`);
    priceUrl.searchParams.set('country', country);
    priceUrl.searchParams.set('currency', 'EUR');

    const [productPriceResult, shippingResult] = await Promise.all([
      gelatoFetch(priceUrl.toString(), env),
      gelatoFetch(`${GELATO_SHIPMENT_API}/prices:search`, env, {
        method: 'POST',
        body: JSON.stringify({
          currency: 'EUR',
          country,
          isBusiness: false,
          isPrivate: true,
          hasTracking: true,
          products: [{ productUid: variant.productUid, quantities: [1] }],
        }),
      }),
    ]);

    const productPrice = productPriceResult.ok
      ? pickQuantityOnePrice(productPriceResult.data, country)
      : null;
    const shipping = shippingResult.ok
      ? pickShipping(shippingResult.data)
      : { methods: [], cheapest: null };
    const productCost = Number(productPrice?.price);
    const shippingCost = Number(shipping.cheapest?.minPrice);
    const baseCost = Number.isFinite(productCost) && Number.isFinite(shippingCost)
      ? productCost + shippingCost
      : null;
    const grossSpreadBeforeTaxAndFees = baseCost === null
      ? null
      : Number(((product.unitAmount / 100) - baseCost).toFixed(2));

    markets.push({
      country,
      label: market.label,
      currency: 'EUR',
      productAvailable: Boolean(productPrice),
      productPrice: productPrice?.price ?? null,
      shippingAvailable: Boolean(shipping.cheapest),
      cheapestShipping: shipping.cheapest,
      shippingMethods: shipping.methods,
      baseCostBeforeTax: baseCost === null ? null : Number(baseCost.toFixed(2)),
      sitePriceShippingIncluded: product.unitAmount / 100,
      grossSpreadBeforeTaxAndFees,
      diagnostics: {
        productPriceHttpStatus: productPriceResult.status,
        shippingHttpStatus: shippingResult.status,
      },
    });
  }

  return new Response(JSON.stringify({
    ok: true,
    readOnly: true,
    createsGelatoOrder: false,
    note: 'Indicative Gelato product/shipment API audit. No order or draft is created.',
    productSlug,
    sku: variant.sku,
    productUid: variant.productUid,
    sitePriceShippingIncluded: product.unitAmount / 100,
    currency: 'EUR',
    markets,
  }), {
    status: 200,
    headers: { 'content-type': 'application/json; charset=UTF-8', 'cache-control': 'no-store' },
  });
};
