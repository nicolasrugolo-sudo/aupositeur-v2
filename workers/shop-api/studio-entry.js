import shop, { FulfillmentLock } from './market-entry.js';
import { verifyGitHubAdmin } from '../shared/studio-identity.js';

export { FulfillmentLock };

const origin = 'https://www.aupositeur.be';
const cors = {
  'access-control-allow-origin': origin,
  'access-control-allow-methods': 'GET, POST, OPTIONS',
  'access-control-allow-headers': 'Authorization, Content-Type, X-Aupositeur-Admin',
  'cache-control': 'no-store',
  vary: 'Origin',
};
const reply = (body, status = 200) => Response.json(body, { status, headers: cors });

export default {
  async fetch(request, env, context) {
    const url = new URL(request.url);
    if (!url.pathname.startsWith('/admin/') || request.headers.get('Origin') !== origin) {
      return shop.fetch(request, env, context);
    }
    if (request.method === 'OPTIONS') return new Response(null, { status: 204, headers: cors });
    if (!request.headers.has('Authorization') || !url.pathname.startsWith('/admin/print-files/')) return shop.fetch(request, env, context);
    if (!await verifyGitHubAdmin(request)) return reply({ error: 'Accès administrateur refusé' }, 403);

    if (!env.SHOP_ADMIN_TOKEN) return reply({ error: 'Autorisation Boutique indisponible' }, 503);
    const headers = new Headers(request.headers);
    headers.delete('Authorization');
    headers.set('X-Aupositeur-Admin', env.SHOP_ADMIN_TOKEN);
    return shop.fetch(new Request(request, { headers }), env, context);
  },
};
