import entry from './entry.js';
import { handleAdminGelatoMarketAudit } from './gelato-market-audit.js';
import { SHOP_CATALOG, resolveVariant } from './shop-catalog.js';

const json = (data, status = 200) => new Response(JSON.stringify(data), {
  status,
  headers: {
    'content-type': 'application/json; charset=UTF-8',
    'cache-control': 'no-store',
  },
});

const isAdmin = (request, env) => {
  const provided = request.headers.get('X-Aupositeur-Admin') || '';
  return Boolean(env.SHOP_ADMIN_TOKEN) && provided === env.SHOP_ADMIN_TOKEN;
};

export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);

    if (url.pathname === '/admin/gelato/market-audit') {
      if (request.method !== 'POST') return json({ error: 'Method not allowed' }, 405);
      if (!isAdmin(request, env)) return json({ error: 'Unauthorized' }, 401);
      return handleAdminGelatoMarketAudit(request, env, SHOP_CATALOG, resolveVariant);
    }

    return entry.fetch(request, env, ctx);
  },
};
