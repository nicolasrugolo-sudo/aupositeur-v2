export type BoutiqueCartItem = {
  key: string;
  sku: string;
  gelatoProductUid: string;
  gelatoTemplateId: string;
  productSlug: string;
  productTitle: string;
  variantLabel: string;
  frameId?: string;
  quantity: number;
  currency: string;
  unitPrice: number;
  image: string;
};

const STORAGE_KEY = 'aupositeur:cart:v1';
const MAX_DISTINCT_ITEMS = 10;
const MAX_ITEM_QUANTITY = 5;
const MAX_TOTAL_QUANTITY = 20;

const sanitizeQuantity = (value: number): number =>
  Math.max(1, Math.min(MAX_ITEM_QUANTITY, Math.trunc(Number.isFinite(value) ? value : 1)));

const isSafeCartItem = (item: unknown): item is BoutiqueCartItem => {
  if (!item || typeof item !== 'object') return false;
  const candidate = item as Partial<BoutiqueCartItem>;

  return Boolean(
    typeof candidate.key === 'string' && candidate.key.length > 0 && candidate.key.length <= 240 &&
    typeof candidate.productSlug === 'string' && /^[a-z0-9-]{1,120}$/.test(candidate.productSlug) &&
    typeof candidate.productTitle === 'string' && candidate.productTitle.length > 0 && candidate.productTitle.length <= 240 &&
    typeof candidate.variantLabel === 'string' && candidate.variantLabel.length > 0 && candidate.variantLabel.length <= 240 &&
    typeof candidate.sku === 'string' && candidate.sku.length > 0 && candidate.sku.length <= 240 &&
    typeof candidate.gelatoProductUid === 'string' && candidate.gelatoProductUid.length <= 240 &&
    typeof candidate.gelatoTemplateId === 'string' && candidate.gelatoTemplateId.length <= 240 &&
    typeof candidate.quantity === 'number' && Number.isInteger(candidate.quantity) &&
    candidate.quantity >= 1 && candidate.quantity <= MAX_ITEM_QUANTITY &&
    typeof candidate.unitPrice === 'number' && Number.isFinite(candidate.unitPrice) && candidate.unitPrice >= 0 &&
    candidate.currency === 'EUR' &&
    typeof candidate.image === 'string' && candidate.image.startsWith('/boutique/') && candidate.image.length <= 500 &&
    (candidate.frameId === undefined || (typeof candidate.frameId === 'string' && candidate.frameId.length <= 80))
  );
};

export const readCart = (): BoutiqueCartItem[] => {
  if (typeof window === 'undefined') return [];

  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];

    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];

    const safeItems: BoutiqueCartItem[] = [];
    let totalQuantity = 0;

    for (const item of parsed) {
      if (!isSafeCartItem(item)) continue;
      if (safeItems.length >= MAX_DISTINCT_ITEMS) break;
      if (totalQuantity + item.quantity > MAX_TOTAL_QUANTITY) break;
      safeItems.push(item);
      totalQuantity += item.quantity;
    }

    return safeItems;
  } catch {
    return [];
  }
};

export const writeCart = (items: BoutiqueCartItem[]): void => {
  if (typeof window === 'undefined') return;
  window.localStorage.setItem(STORAGE_KEY, JSON.stringify(items));
  window.dispatchEvent(new CustomEvent('aupositeur:cart-change', { detail: items }));
};

export const addCartItem = (item: BoutiqueCartItem): BoutiqueCartItem[] => {
  if (!isSafeCartItem(item)) return readCart();

  const cart = readCart();
  const existing = cart.find((entry) => entry.key === item.key);

  if (existing) {
    const otherQuantity = cart.reduce((total, entry) => total + (entry.key === item.key ? 0 : entry.quantity), 0);
    const remaining = Math.max(0, MAX_TOTAL_QUANTITY - otherQuantity);
    existing.quantity = Math.min(
      sanitizeQuantity(existing.quantity + sanitizeQuantity(item.quantity)),
      remaining,
    );
  } else if (cart.length < MAX_DISTINCT_ITEMS) {
    const remaining = Math.max(0, MAX_TOTAL_QUANTITY - cartQuantity(cart));
    if (remaining > 0) cart.push({ ...item, quantity: Math.min(sanitizeQuantity(item.quantity), remaining) });
  }

  writeCart(cart);
  return cart;
};

export const setCartItemQuantity = (key: string, quantity: number): BoutiqueCartItem[] => {
  const cart = readCart();
  const item = cart.find((entry) => entry.key === key);
  if (!item) return cart;

  const otherQuantity = cart.reduce((total, entry) => total + (entry.key === key ? 0 : entry.quantity), 0);
  item.quantity = Math.min(sanitizeQuantity(quantity), Math.max(1, MAX_TOTAL_QUANTITY - otherQuantity));
  writeCart(cart);
  return cart;
};

export const removeCartItem = (key: string): BoutiqueCartItem[] => {
  const cart = readCart().filter((entry) => entry.key !== key);
  writeCart(cart);
  return cart;
};

export const clearCart = (): void => writeCart([]);

export const cartQuantity = (items = readCart()): number =>
  items.reduce((total, item) => total + sanitizeQuantity(item.quantity), 0);

export const cartTotal = (items = readCart()): number =>
  items.reduce((total, item) => total + item.unitPrice * sanitizeQuantity(item.quantity), 0);
