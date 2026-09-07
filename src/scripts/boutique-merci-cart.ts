const API_BASE = 'https://aupositeur-shop-api.nicolas-rugolo.workers.dev';

const FRAME_TO_FOLDER: Record<string, string> = {
  'Cadre blanc': 'blanc',
  'Cadre noir': 'noir',
  'Cadre en bois': 'bois',
  'Cadre en bois foncé': 'bois-fonce',
};

const money = (amount: number, currency = 'EUR') =>
  new Intl.NumberFormat('fr-BE', { style: 'currency', currency: currency.toUpperCase() }).format(amount / 100);

const initMerciCart = async () => {
  const root = document.querySelector<HTMLElement>('[data-checkout-confirmation]');
  if (!root) return;

  const params = new URLSearchParams(window.location.search);
  const sessionId = params.get('session_id') || '';
  const paymentIntentId = params.get('payment_intent') || '';
  if (!sessionId.startsWith('cs_test_') && !paymentIntentId.startsWith('pi_')) return;

  const query = new URLSearchParams();
  if (sessionId.startsWith('cs_test_')) query.set('session_id', sessionId);
  else query.set('payment_intent', paymentIntentId);

  try {
    const response = await fetch(`${API_BASE}/checkout/status?${query.toString()}`, {
      headers: { accept: 'application/json' },
    });
    const data = await response.json();
    if (!response.ok || !data?.ok) return;

    const order = data.order || {};
    const items = Array.isArray(order.items) ? order.items : [];
    if (!items.length) return;

    const card = root.querySelector<HTMLElement>('[data-confirmation-details]');
    if (!card) return;

    card.classList.add('ap-checkout-return__card--cart');
    card.replaceChildren();

    const summary = document.createElement('div');
    summary.className = 'ap-confirm-cart';

    const heading = document.createElement('div');
    heading.className = 'ap-confirm-cart__heading';
    const title = document.createElement('h2');
    title.textContent = 'Détails de votre commande';
    const ref = document.createElement('p');
    ref.textContent = `Référence ${order.reference || '—'}`;
    heading.append(title, ref);
    summary.append(heading);

    const list = document.createElement('div');
    list.className = 'ap-confirm-cart__items';

    items.forEach((item: any) => {
      const line = document.createElement('article');
      line.className = 'ap-confirm-cart__item';

      const image = document.createElement('img');
      const folder = FRAME_TO_FOLDER[item.variant] || 'noir';
      image.src = `/boutique/affiches/${encodeURIComponent(item.productSlug)}/${folder}/Simple.webp`;
      image.alt = `${item.productTitle || 'Œuvre Aupositeur'} — ${item.variant || ''}`;

      const copy = document.createElement('div');
      const type = document.createElement('span');
      type.className = 'ap-confirm-cart__type';
      type.textContent = 'Affiche encadrée';
      const name = document.createElement('h3');
      name.textContent = item.productTitle || 'Œuvre Aupositeur';
      const variant = document.createElement('p');
      variant.textContent = item.variant || '—';
      const qty = document.createElement('p');
      qty.className = 'ap-confirm-cart__qty';
      qty.textContent = `Quantité ${item.quantity || 1}`;
      copy.append(type, name, variant, qty);

      const price = document.createElement('strong');
      price.className = 'ap-confirm-cart__price';
      const lineAmount = Number(item.unitAmount || 0) * Number(item.quantity || 1);
      price.textContent = lineAmount ? money(lineAmount, order.currency || 'EUR') : '';

      line.append(image, copy, price);
      list.append(line);
    });
    summary.append(list);

    const total = document.createElement('div');
    total.className = 'ap-confirm-cart__total';
    const totalLabel = document.createElement('span');
    totalLabel.textContent = `${order.totalQuantity || items.reduce((n: number, item: any) => n + Number(item.quantity || 0), 0)} article(s)`;
    const totalValue = document.createElement('strong');
    totalValue.textContent = money(Number(order.amountTotal || 0), order.currency || 'EUR');
    total.append(totalLabel, totalValue);
    summary.append(total);

    const state = document.createElement('div');
    state.className = 'ap-confirm-cart__state';
    const stateTitle = document.createElement('strong');
    stateTitle.textContent = data.paymentComplete ? 'Commande confirmée' : 'Paiement en cours de confirmation';
    const stateText = document.createElement('p');
    stateText.textContent = data.paymentComplete
      ? 'Votre commande est bien enregistrée et passe maintenant à l’étape de préparation.'
      : 'Nous attendons encore la confirmation du paiement.';
    state.append(stateTitle, stateText);
    summary.append(state);

    card.append(summary);
    card.hidden = false;

    const status = root.querySelector<HTMLElement>('[data-confirmation-status]');
    const notice = root.querySelector<HTMLElement>('[data-confirmation-notice]');
    if (data.paymentComplete && status) status.textContent = 'Votre paiement test a bien été reçu.';
    if (notice) notice.textContent = 'La commande complète est enregistrée. Cet environnement reste en mode test.';
  } catch (error) {
    console.error('Aupositeur confirmation cart:', error);
  }
};

void initMerciCart();
document.addEventListener('astro:page-load', () => { void initMerciCart(); });
