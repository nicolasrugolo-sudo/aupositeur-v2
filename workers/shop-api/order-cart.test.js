import test from 'node:test';
import assert from 'node:assert/strict';
import {
  CART_SCHEMA,
  MAX_DISTINCT_ITEMS,
  MAX_ITEM_QUANTITY,
  MAX_TOTAL_QUANTITY,
  resolveCartInput,
  readCartFromSession,
  writeCartMetadata,
} from './order-cart.js';

const sku = (slug, frame = 'BLACK') =>
  `AUP-AFF-${slug.replace(/[^a-z0-9]+/gi, '-').toUpperCase()}-${frame}`;

test('resolves a valid multi-product cart from the server catalog', () => {
  const result = resolveCartInput({
    items: [
      { productSlug: 'ames', sku: sku('ames'), quantity: 2 },
      { productSlug: 'le-pire', sku: sku('le-pire'), quantity: 1 },
    ],
  });

  assert.equal(result.ok, true);
  assert.equal(result.items.length, 2);
  assert.equal(result.totalQuantity, 3);
  assert.equal(result.amountTotal, 20700);
  assert.equal(result.currency, 'eur');
});

test('merges duplicate product/SKU lines before enforcing limits', () => {
  const result = resolveCartInput({
    items: [
      { productSlug: 'ames', sku: sku('ames'), quantity: 2 },
      { productSlug: 'ames', sku: sku('ames'), quantity: 3 },
    ],
  });

  assert.equal(result.ok, true);
  assert.equal(result.items.length, 1);
  assert.equal(result.items[0].quantity, MAX_ITEM_QUANTITY);
  assert.equal(result.amountTotal, 34500);
});

test('rejects an unknown product and a mismatched SKU', () => {
  const unknown = resolveCartInput({
    items: [{ productSlug: 'inconnu', sku: 'AUP-AFF-INCONNU-BLACK', quantity: 1 }],
  });
  assert.equal(unknown.ok, false);
  assert.equal(unknown.code, 'unknown_product');

  const mismatch = resolveCartInput({
    items: [{ productSlug: 'ames', sku: sku('le-pire'), quantity: 1 }],
  });
  assert.equal(mismatch.ok, false);
  assert.equal(mismatch.code, 'sku_mismatch');
});

test('rejects invalid per-line quantities', () => {
  for (const quantity of [0, -1, MAX_ITEM_QUANTITY + 1, 1.5]) {
    const result = resolveCartInput({
      items: [{ productSlug: 'ames', sku: sku('ames'), quantity }],
    });
    assert.equal(result.ok, false);
    assert.equal(result.code, 'invalid_quantity');
  }
});

test('rejects too many distinct lines and excessive total quantity', () => {
  const tooMany = Array.from({ length: MAX_DISTINCT_ITEMS + 1 }, (_, index) => ({
    productSlug: 'ames',
    sku: sku('ames', index % 2 ? 'BLACK' : 'WHITE') + `-${index}`,
    quantity: 1,
  }));
  const distinctResult = resolveCartInput({ items: tooMany });
  assert.equal(distinctResult.ok, false);
  assert.equal(distinctResult.code, 'too_many_items');

  const excessiveTotal = resolveCartInput({
    items: [
      { productSlug: 'ames', sku: sku('ames', 'BLACK'), quantity: 5 },
      { productSlug: 'ames', sku: sku('ames', 'WHITE'), quantity: 5 },
      { productSlug: 'ames', sku: sku('ames', 'DARK-WOOD'), quantity: 5 },
      { productSlug: 'ames', sku: sku('ames', 'NATURAL-WOOD'), quantity: 5 },
      { productSlug: 'le-pire', sku: sku('le-pire', 'BLACK'), quantity: 1 },
    ],
  });
  assert.equal(excessiveTotal.ok, false);
  assert.equal(excessiveTotal.code, 'cart_quantity_limit');
  assert.equal(MAX_TOTAL_QUANTITY, 20);
});

test('serializes cart metadata and reconstructs it without trusting prices', () => {
  const cart = resolveCartInput({
    items: [
      { productSlug: 'ames', sku: sku('ames'), quantity: 2 },
      { productSlug: 'le-pire', sku: sku('le-pire'), quantity: 1 },
    ],
  });
  assert.equal(cart.ok, true);

  const params = new URLSearchParams();
  writeCartMetadata(params, cart, 'AUP-TEST-unit');

  const metadata = Object.fromEntries(
    Array.from(params.entries())
      .filter(([key]) => key.startsWith('metadata['))
      .map(([key, value]) => [key.slice(9, -1), value]),
  );

  assert.equal(metadata.order_schema, CART_SCHEMA);
  assert.equal(metadata.cart_count, '2');
  assert.equal(metadata.cart_total_quantity, '3');
  assert.equal('unit_amount' in metadata, false);
  assert.equal('price' in metadata, false);

  const rebuilt = readCartFromSession({ metadata });
  assert.equal(rebuilt.ok, true);
  assert.equal(rebuilt.amountTotal, 20700);
  assert.equal(rebuilt.totalQuantity, 3);
});

test('rejects malformed cart metadata', () => {
  const result = readCartFromSession({
    metadata: {
      order_schema: CART_SCHEMA,
      cart_count: '999',
    },
  });
  assert.equal(result.ok, false);
  assert.equal(result.code, 'invalid_cart_metadata');
});
