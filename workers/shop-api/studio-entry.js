import shop, { FulfillmentLock } from './market-entry.js';
import { verifyGitHubAdmin } from '../shared/studio-identity.js';

export { FulfillmentLock };

const origin = 'https://www.aupositeur.be';
const cors = {
  'access-control-allow-origin': origin,
  'access-control-allow-methods': 'GET, POST, DELETE, OPTIONS',
  'access-control-allow-headers': 'Authorization, Content-Type, X-Aupositeur-Admin',
  'cache-control': 'no-store',
  vary: 'Origin',
};
const reply = (body, status = 200) => Response.json(body, { status, headers: cors });

export default {
  async fetch(request, env, context) {
    const url = new URL(request.url);
    if (url.pathname === '/print-file' && request.headers.get('Origin') === origin &&
        /-studio-recette-[a-f0-9-]{36}\.pdf$/.test(url.searchParams.get('key') || '')) {
      const response = await shop.fetch(request, env, context);
      const headers = new Headers(response.headers);
      headers.set('Access-Control-Allow-Origin', origin);
      headers.set('Vary', 'Origin');
      return new Response(response.body, { status: response.status, headers });
    }
    if (!url.pathname.startsWith('/admin/') || request.headers.get('Origin') !== origin) {
      return shop.fetch(request, env, context);
    }
    if (request.method === 'OPTIONS') return new Response(null, { status: 204, headers: cors });
    if (!request.headers.has('Authorization') || !url.pathname.startsWith('/admin/print-files/')) return shop.fetch(request, env, context);
    if (!await verifyGitHubAdmin(request)) return reply({ error: 'Accès administrateur refusé' }, 403);

    if (request.method === 'DELETE' && url.pathname === '/admin/print-files/recette') {
      const { key, id } = await request.json().catch(() => ({}));
      if (typeof key !== 'string' || typeof id !== 'string' || !/^[a-f0-9-]{36}$/.test(id) ||
          !/^print-masters\/\d{4}\/\d{2}\/[a-f0-9-]{36}-studio-recette-[a-f0-9-]{36}\.pdf$/.test(key) ||
          !key.endsWith('-studio-recette-' + id + '.pdf')) {
        return reply({ error: 'Référence de recette non valide' }, 400);
      }
      const object = await env.SHOP_ASSETS.head(key);
      if (!object) return reply({ ok: true });
      if (object.customMetadata?.originalName !== 'studio-recette-' + id + '.pdf') {
        return reply({ error: 'Cet objet ne correspond pas à la recette' }, 403);
      }
      await env.SHOP_ASSETS.delete(key);
      return reply({ ok: !(await env.SHOP_ASSETS.head(key)) });
    }

    if (!env.SHOP_ADMIN_TOKEN) return reply({ error: 'Autorisation Boutique indisponible' }, 503);
    const headers = new Headers(request.headers);
    headers.delete('Authorization');
    headers.set('X-Aupositeur-Admin', env.SHOP_ADMIN_TOKEN);
    return shop.fetch(new Request(request, { headers }), env, context);
  },
};
