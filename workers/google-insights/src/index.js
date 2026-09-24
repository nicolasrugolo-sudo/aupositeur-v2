const GOOGLE_TOKEN_URL = 'https://oauth2.googleapis.com/token';
const GA_SCOPE = 'https://www.googleapis.com/auth/analytics.readonly';
const GSC_SCOPE = 'https://www.googleapis.com/auth/webmasters.readonly';

const json = (data, status = 200, origin = '') => {
  const headers = {
    'content-type': 'application/json; charset=UTF-8',
    'cache-control': 'private, no-store',
    'x-content-type-options': 'nosniff',
  };
  if (origin) {
    headers['access-control-allow-origin'] = origin;
    headers.vary = 'Origin';
  }
  return new Response(JSON.stringify(data), { status, headers });
};

const b64url = (value) => {
  const bytes = typeof value === 'string' ? new TextEncoder().encode(value) : value;
  let binary = '';
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/g, '');
};

const pemToArrayBuffer = (pem) => {
  const body = pem.replace(/-----BEGIN PRIVATE KEY-----|-----END PRIVATE KEY-----|\s/g, '');
  const binary = atob(body);
  return Uint8Array.from(binary, (c) => c.charCodeAt(0)).buffer;
};

const accessToken = async (env) => {
  const now = Math.floor(Date.now() / 1000);
  const header = b64url(JSON.stringify({ alg: 'RS256', typ: 'JWT' }));
  const claims = b64url(JSON.stringify({
    iss: env.GOOGLE_SERVICE_ACCOUNT_EMAIL,
    scope: [GA_SCOPE, GSC_SCOPE].join(' '),
    aud: GOOGLE_TOKEN_URL,
    iat: now,
    exp: now + 3600,
  }));
  const key = await crypto.subtle.importKey(
    'pkcs8',
    pemToArrayBuffer(env.GOOGLE_PRIVATE_KEY),
    { name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-256' },
    false,
    ['sign'],
  );
  const signature = await crypto.subtle.sign(
    'RSASSA-PKCS1-v1_5',
    key,
    new TextEncoder().encode(header + '.' + claims),
  );
  const assertion = header + '.' + claims + '.' + b64url(new Uint8Array(signature));
  const response = await fetch(GOOGLE_TOKEN_URL, {
    method: 'POST',
    headers: { 'content-type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer',
      assertion,
    }),
  });
  if (!response.ok) throw new Error('Google OAuth token request failed');
  const body = await response.json();
  if (!body.access_token) throw new Error('Google OAuth token missing');
  return body.access_token;
};

const googleFetch = async (url, token, options = {}) => {
  const response = await fetch(url, {
    ...options,
    headers: {
      authorization: 'Bearer ' + token,
      'content-type': 'application/json',
      ...(options.headers || {}),
    },
  });
  if (!response.ok) {
    const detail = await response.text();
    throw new Error('Google API ' + response.status + ': ' + detail.slice(0, 240));
  }
  return response.json();
};

const analytics = async (env, token) => {
  if (!env.GA4_PROPERTY_ID) return { configured: false };
  const body = {
    dateRanges: [{ startDate: '29daysAgo', endDate: 'today' }],
    metrics: [
      { name: 'activeUsers' },
      { name: 'screenPageViews' },
      { name: 'sessions' },
    ],
  };
  const data = await googleFetch(
    'https://analyticsdata.googleapis.com/v1beta/properties/' + encodeURIComponent(env.GA4_PROPERTY_ID) + ':runReport',
    token,
    { method: 'POST', body: JSON.stringify(body) },
  );
  const values = data.rows?.[0]?.metricValues || [];
  return {
    configured: true,
    period: '30d',
    activeUsers: Number(values[0]?.value || 0),
    pageViews: Number(values[1]?.value || 0),
    sessions: Number(values[2]?.value || 0),
  };
};

const searchConsole = async (env, token) => {
  if (!env.SEARCH_CONSOLE_SITE_URL) return { configured: false };
  const end = new Date();
  end.setUTCDate(end.getUTCDate() - 2);
  const start = new Date(end);
  start.setUTCDate(start.getUTCDate() - 27);
  const date = (d) => d.toISOString().slice(0, 10);
  const body = { startDate: date(start), endDate: date(end), rowLimit: 1 };
  const data = await googleFetch(
    'https://www.googleapis.com/webmasters/v3/sites/' + encodeURIComponent(env.SEARCH_CONSOLE_SITE_URL) + '/searchAnalytics/query',
    token,
    { method: 'POST', body: JSON.stringify(body) },
  );
  const row = data.rows?.[0] || {};
  return {
    configured: true,
    period: '28d',
    clicks: Number(row.clicks || 0),
    impressions: Number(row.impressions || 0),
    ctr: Number(row.ctr || 0),
    position: Number(row.position || 0),
  };
};

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    const origin = request.headers.get('Origin') || '';
    const allowed = env.ALLOWED_ORIGIN || 'https://www.aupositeur.be';

    if (request.method === 'OPTIONS') {
      if (origin !== allowed) return new Response(null, { status: 403 });
      return new Response(null, {
        status: 204,
        headers: {
          'access-control-allow-origin': allowed,
          'access-control-allow-methods': 'GET, OPTIONS',
          'access-control-allow-headers': 'X-Aupositeur-Insights',
          'access-control-max-age': '86400',
          vary: 'Origin',
        },
      });
    }

    if (request.method === 'GET' && url.pathname === '/') {
      return json({
        service: 'aupositeur-google-insights',
        status: 'ok',
        configured: Boolean(env.GOOGLE_SERVICE_ACCOUNT_EMAIL && env.GOOGLE_PRIVATE_KEY),
        analytics: Boolean(env.GA4_PROPERTY_ID),
        searchConsole: Boolean(env.SEARCH_CONSOLE_SITE_URL),
      }, 200, origin === allowed ? allowed : '');
    }

    if (request.method === 'GET' && url.pathname === '/test-ga4') {
      if (!env.GOOGLE_SERVICE_ACCOUNT_EMAIL || !env.GOOGLE_PRIVATE_KEY || !env.GA4_PROPERTY_ID) {
        return json({ ok: false, error: 'GA4 test is not configured' }, 503);
      }
      try {
        const token = await accessToken(env);
        const ga = await analytics(env, token);
        return json({
          ok: true,
          property: env.GA4_PROPERTY_ID,
          analytics: ga,
          generatedAt: new Date().toISOString(),
        });
      } catch (error) {
        return json({ ok: false, error: 'GA4 test failed', detail: error.message }, 502);
      }
    }

    if (request.method !== 'GET' || url.pathname !== '/admin/insights') {
      return json({ error: 'Not found' }, 404, origin === allowed ? allowed : '');
    }

    if (origin !== allowed) return json({ error: 'Forbidden origin' }, 403);
    if (!env.INSIGHTS_ADMIN_TOKEN || request.headers.get('X-Aupositeur-Insights') !== env.INSIGHTS_ADMIN_TOKEN) {
      return json({ error: 'Unauthorized' }, 401, allowed);
    }

    if (!env.GOOGLE_SERVICE_ACCOUNT_EMAIL || !env.GOOGLE_PRIVATE_KEY) {
      return json({ error: 'Google service account is not configured' }, 503, allowed);
    }

    try {
      const token = await accessToken(env);
      const [ga, gsc] = await Promise.all([
        analytics(env, token).catch((error) => ({ configured: Boolean(env.GA4_PROPERTY_ID), error: error.message })),
        searchConsole(env, token).catch((error) => ({ configured: Boolean(env.SEARCH_CONSOLE_SITE_URL), error: error.message })),
      ]);
      return json({ ok: true, analytics: ga, searchConsole: gsc, generatedAt: new Date().toISOString() }, 200, allowed);
    } catch (error) {
      return json({ error: 'Google authentication failed', detail: error.message }, 502, allowed);
    }
  },
};
