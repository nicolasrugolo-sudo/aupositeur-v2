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

const sanitizeQuantity = (value: number): number =>
  Math.max(1, Math.min(99, Math.trunc(Number.isFinite(value) ? value : 1)));

export const readCart = (): BoutiqueCartItem[] => {
  if (typeof window === 'undefined') return [];

  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];

    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];

    return parsed.filter((item): item is BoutiqueCartItem =>
      Boolean(
        item &&
        typeof item.key === 'string' &&
        typeof item.productSlug === 'string' &&
        typeof item.productTitle === 'string' &&
        typeof item.quantity === 'number' &&
        typeof item.unitPrice === 'number'
      )
    );
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
  const cart = readCart();
  const existing = cart.find((entry) => entry.key === item.key);

  if (existing) {
    existing.quantity = sanitizeQuantity(existing.quantity + sanitizeQuantity(item.quantity));
  } else {
    cart.push({ ...item, quantity: sanitizeQuantity(item.quantity) });
  }

  writeCart(cart);
  return cart;
};

export const setCartItemQuantity = (key: string, quantity: number): BoutiqueCartItem[] => {
  const cart = readCart();
  const item = cart.find((entry) => entry.key === key);
  if (!item) return cart;

  item.quantity = sanitizeQuantity(quantity);
  writeCart(cart);
  return cart;
};

export const removeCartItem = (key: string): BoutiqueCartItem[] => {
  const cart = readCart().filter((entry) => entry.key !== key);
  writeCart(cart);
  return cart;
};

export const cartQuantity = (items = readCart()): number =>
  items.reduce((total, item) => total + sanitizeQuantity(item.quantity), 0);

export const cartTotal = (items = readCart()): number =>
  items.reduce((total, item) => total + item.unitPrice * sanitizeQuantity(item.quantity), 0);
