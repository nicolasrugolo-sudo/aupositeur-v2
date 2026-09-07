const SELLER_NAME = 'Nicolas RUGOLO';
const SELLER_ADDRESS = 'Rue de Baudour 83, 7050 Jurbise, Belgique';
const CONTACT_EMAIL = 'aupositeur@gmail.com';

const escapeHtml = (value) => String(value ?? '')
  .replaceAll('&', '&amp;')
  .replaceAll('<', '&lt;')
  .replaceAll('>', '&gt;')
  .replaceAll('"', '&quot;')
  .replaceAll("'", '&#039;');

const money = (amount, currency = 'eur') =>
  new Intl.NumberFormat('fr-BE', {
    style: 'currency',
    currency: String(currency || 'eur').toUpperCase(),
  }).format(Number(amount || 0) / 100);

const shippingFromSession = (session) => {
  const shipping = session?.shipping_details || session?.collected_information?.shipping_details || null;
  const customer = session?.customer_details || {};
  const address = shipping?.address || null;
  if (!shipping || !address) return null;

  return {
    name: String(shipping.name || customer.name || '').trim(),
    email: String(customer.email || '').trim(),
    line1: String(address.line1 || '').trim(),
    line2: String(address.line2 || '').trim(),
    postalCode: String(address.postal_code || '').trim(),
    city: String(address.city || '').trim(),
    country: String(address.country || '').trim().toUpperCase(),
  };
};

export const buildConfirmationEmail = ({ session, cart, termsVersion }) => {
  const metadata = session?.metadata || {};
  const reference = String(metadata.order_reference || session?.client_reference_id || '').trim();
  const shipping = shippingFromSession(session);

  if (!reference || !shipping?.email || !shipping?.name || !cart?.ok || !Array.isArray(cart.items) || cart.items.length === 0) {
    return { ok: false, code: 'incomplete_confirmation_email_data' };
  }

  const itemLines = cart.items.map((item) => ({
    title: String(item.product?.title || item.productSlug || 'Œuvre Aupositeur'),
    variant: String(item.variant?.label || item.sku || ''),
    quantity: Number(item.quantity || 0),
    lineAmount: Number(item.lineAmount || 0),
  }));

  const textItems = itemLines
    .map((item) => `- ${item.title} — ${item.variant} — quantité ${item.quantity} — ${money(item.lineAmount, cart.currency)}`)
    .join('\n');

  const htmlItems = itemLines
    .map((item) => `<tr><td style="padding:8px 0">${escapeHtml(item.title)}<br><span style="color:#666">${escapeHtml(item.variant)} · quantité ${item.quantity}</span></td><td style="padding:8px 0;text-align:right;white-space:nowrap">${escapeHtml(money(item.lineAmount, cart.currency))}</td></tr>`)
    .join('');

  const addressText = [shipping.line1, shipping.line2, `${shipping.postalCode} ${shipping.city}`.trim(), shipping.country]
    .filter(Boolean)
    .join('\n');

  const subject = `AUPOSITEUR — confirmation ${reference}`;
  const legalText = `Vendeur : ${SELLER_NAME}\n${SELLER_ADDRESS}\nContact : ${CONTACT_EMAIL}\n\nDroit de rétractation : pour les produits standard du catalogue, vous disposez en principe de 14 jours calendrier à compter de la prise de possession du bien pour notifier votre décision. Les modalités et le formulaire type sont disponibles sur https://www.aupositeur.be/retractation/`;
  const text = `AUPOSITEUR\n\nMerci pour votre commande.\n\nRéférence : ${reference}\nÉtat : Commande confirmée\n\n${textItems}\n\nTotal : ${money(cart.amountTotal, cart.currency)}\n\nLivraison :\n${shipping.name}\n${addressText}\n\n${legalText}\n\nLes mots trouvent toujours leur chemin.\n\nConditions de vente : https://www.aupositeur.be/conditions-generales-de-vente/\nRétractation : https://www.aupositeur.be/retractation/\nConfidentialité : https://www.aupositeur.be/politique-de-confidentialite/\n${termsVersion ? `\nVersion des conditions acceptée : ${termsVersion}\n` : ''}`;

  const html = `<!doctype html><html lang="fr"><body style="margin:0;background:#171714;color:#171714;font-family:Georgia,serif"><div style="max-width:640px;margin:0 auto;background:#f4f1ea;padding:40px 32px"><p style="font-family:monospace;letter-spacing:.12em;font-size:12px">AUPOSITEUR</p><h1 style="font-weight:400;font-size:38px;margin:24px 0 12px">Merci.</h1><p>Votre commande est confirmée.</p><p><strong>Référence :</strong> ${escapeHtml(reference)}</p><table style="width:100%;border-collapse:collapse;margin:28px 0;border-top:1px solid #c9c5bb;border-bottom:1px solid #c9c5bb">${htmlItems}</table><p style="text-align:right;font-size:20px"><strong>Total : ${escapeHtml(money(cart.amountTotal, cart.currency))}</strong></p><h2 style="font-size:18px;font-weight:400;margin-top:32px">Livraison</h2><p>${escapeHtml(shipping.name)}<br>${escapeHtml(shipping.line1)}${shipping.line2 ? `<br>${escapeHtml(shipping.line2)}` : ''}<br>${escapeHtml(`${shipping.postalCode} ${shipping.city}`.trim())}<br>${escapeHtml(shipping.country)}</p><h2 style="font-size:18px;font-weight:400;margin-top:32px">Votre vendeur</h2><p>${escapeHtml(SELLER_NAME)}<br>${escapeHtml(SELLER_ADDRESS)}<br><a href="mailto:${escapeHtml(CONTACT_EMAIL)}">${escapeHtml(CONTACT_EMAIL)}</a></p><h2 style="font-size:18px;font-weight:400;margin-top:32px">Rétractation</h2><p>Pour les produits standard du catalogue, vous disposez en principe de 14 jours calendrier à compter de la prise de possession du bien pour notifier votre décision. <a href="https://www.aupositeur.be/retractation/">Consulter les modalités et le formulaire type</a>.</p><blockquote style="margin:36px 0;border-left:1px solid #d4683b;padding-left:20px;font-style:italic">Les mots trouvent toujours leur chemin.</blockquote><p style="font-family:monospace;font-size:12px;line-height:1.7"><a href="https://www.aupositeur.be/conditions-generales-de-vente/">Conditions de vente</a> · <a href="https://www.aupositeur.be/retractation/">Rétractation</a> · <a href="https://www.aupositeur.be/politique-de-confidentialite/">Confidentialité</a>${termsVersion ? `<br>Version des conditions acceptée : ${escapeHtml(termsVersion)}` : ''}</p></div></body></html>`;

  return {
    ok: true,
    to: shipping.email,
    subject,
    text,
    html,
    reference,
  };
};
