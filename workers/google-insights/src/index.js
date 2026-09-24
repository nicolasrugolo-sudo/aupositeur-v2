const GOOGLE_TOKEN_URL = 'https://oauth2.googleapis.com/token';
const GA_SCOPE = 'https://www.googleapis.com/auth/analytics.readonly';
const GSC_SCOPE = 'https://www.googleapis.com/auth/webmasters.readonly';
const YOUTUBE_ANALYTICS_SCOPE = 'https://www.googleapis.com/auth/yt-analytics.readonly';
const YOUTUBE_READ_SCOPE = 'https://www.googleapis.com/auth/youtube.readonly';
const YOUTUBE_REDIRECT_PATH = '/oauth/youtube/callback';
const YOUTUBE_REDIRECT_URI = 'https://aupositeur-google-insights.nicolas-rugolo.workers.dev' + YOUTUBE_REDIRECT_PATH;

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
  const normalized = String(pem || '')
    .trim()
    .replace(/^["']|["']$/g, '')
    .replace(/\\n/g, '\n')
    .replace(/\\r/g, '');
  const body = normalized
    .replace(/-----BEGIN PRIVATE KEY-----|-----END PRIVATE KEY-----/g, '')
    .replace(/\s/g, '');
  if (!body) throw new Error('Google private key is empty or malformed');
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
  const endpoint =
    'https://www.googleapis.com/webmasters/v3/sites/' +
    encodeURIComponent(env.SEARCH_CONSOLE_SITE_URL) +
    '/searchAnalytics/query';

  const query = async (dimensions = [], rowLimit = 1) => {
    const body = { startDate: date(start), endDate: date(end), rowLimit };
    if (dimensions.length) body.dimensions = dimensions;
    return googleFetch(endpoint, token, { method: 'POST', body: JSON.stringify(body) });
  };

  const [summaryResult, queriesResult, pagesResult] = await Promise.allSettled([
    query([], 1),
    query(['query'], 5),
    query(['page'], 5),
  ]);

  if (summaryResult.status !== 'fulfilled') throw summaryResult.reason;
  const row = summaryResult.value.rows?.[0] || {};
  const queries = queriesResult.status === 'fulfilled'
    ? (queriesResult.value.rows || []).map((item) => ({
        query: String(item.keys?.[0] || ''),
        clicks: Number(item.clicks || 0),
        impressions: Number(item.impressions || 0),
        ctr: Number(item.ctr || 0),
        position: Number(item.position || 0),
      }))
    : [];
  const pages = pagesResult.status === 'fulfilled'
    ? (pagesResult.value.rows || []).map((item) => ({
        page: String(item.keys?.[0] || ''),
        clicks: Number(item.clicks || 0),
        impressions: Number(item.impressions || 0),
        ctr: Number(item.ctr || 0),
        position: Number(item.position || 0),
      }))
    : [];

  return {
    configured: true,
    period: '28d',
    clicks: Number(row.clicks || 0),
    impressions: Number(row.impressions || 0),
    ctr: Number(row.ctr || 0),
    position: Number(row.position || 0),
    queries,
    pages,
    details: {
      queriesAvailable: queriesResult.status === 'fulfilled',
      pagesAvailable: pagesResult.status === 'fulfilled',
    },
  };
};

const youtubeOAuthConfigured = (env) => Boolean(env.YOUTUBE_CLIENT_ID && env.YOUTUBE_CLIENT_SECRET);

const youtubeAccessToken = async (env) => {
  if (!youtubeOAuthConfigured(env) || !env.YOUTUBE_REFRESH_TOKEN) {
    throw new Error('YouTube OAuth is not fully configured');
  }
  const response = await fetch(GOOGLE_TOKEN_URL, {
    method: 'POST',
    headers: { 'content-type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      client_id: env.YOUTUBE_CLIENT_ID,
      client_secret: env.YOUTUBE_CLIENT_SECRET,
      refresh_token: env.YOUTUBE_REFRESH_TOKEN,
      grant_type: 'refresh_token',
    }),
  });
  const body = await response.json();
  if (!response.ok || !body.access_token) {
    throw new Error('YouTube token refresh failed: ' + (body.error || response.status));
  }
  return body.access_token;
};

const youtubeReport = async (token, params) => {
  const url = new URL('https://youtubeanalytics.googleapis.com/v2/reports');
  Object.entries(params).forEach(([key, value]) => url.searchParams.set(key, value));
  return googleFetch(url.toString(), token);
};

const youtubeReportingSetup = async (token) => {
  const endpoint = 'https://youtubereporting.googleapis.com/v1/jobs';
  const jobs = await googleFetch(endpoint, token);
  const existing = (jobs.jobs || []).find((job) => job.reportTypeId === 'channel_reach_basic_a1');
  if (existing) return { ready: true, created: false, jobId: existing.id };

  const created = await googleFetch(endpoint, token, {
    method: 'POST',
    body: JSON.stringify({
      reportTypeId: 'channel_reach_basic_a1',
      name: 'AUPOSITEUR Studio — YouTube Reach',
    }),
  });
  return { ready: true, created: true, jobId: created.id || '' };
};

const youtubeInsights = async (env) => {
  if (!env.YOUTUBE_REFRESH_TOKEN) return { configured: false };
  const token = await youtubeAccessToken(env);
  const end = new Date();
  end.setUTCDate(end.getUTCDate() - 1);
  const start = new Date(end);
  start.setUTCDate(start.getUTCDate() - 27);
  const date = (d) => d.toISOString().slice(0, 10);
  const base = {
    ids: 'channel==MINE',
    startDate: date(start),
    endDate: date(end),
  };

  const [summary, top, daily] = await Promise.all([
    youtubeReport(token, {
      ...base,
      metrics: 'views,estimatedMinutesWatched,averageViewDuration,subscribersGained,subscribersLost',
    }),
    youtubeReport(token, {
      ...base,
      dimensions: 'video',
      metrics: 'views,estimatedMinutesWatched',
      sort: '-views',
      maxResults: '5',
    }),
    youtubeReport(token, {
      ...base,
      dimensions: 'day',
      metrics: 'views,estimatedMinutesWatched,subscribersGained,subscribersLost',
      sort: 'day',
    }),
  ]);

  const summaryValues = summary.rows?.[0] || [];
  const topRows = top.rows || [];
  const videoIds = topRows.map((row) => String(row[0] || '')).filter(Boolean);
  let titles = new Map();
  let titlesAvailable = false;

  if (videoIds.length) {
    try {
      const videosUrl = new URL('https://www.googleapis.com/youtube/v3/videos');
      videosUrl.searchParams.set('part', 'snippet');
      videosUrl.searchParams.set('id', videoIds.join(','));
      const videos = await googleFetch(videosUrl.toString(), token);
      titles = new Map((videos.items || []).map((item) => [item.id, {
        title: item.snippet?.title || item.id,
        thumbnail: item.snippet?.thumbnails?.medium?.url || item.snippet?.thumbnails?.default?.url || '',
        publishedAt: item.snippet?.publishedAt || '',
      }]));
      titlesAvailable = true;
    } catch {
      // Analytics remain useful even if YouTube Data API v3 is not enabled yet.
    }
  }

  return {
    configured: true,
    period: '28d',
    views: Number(summaryValues[0] || 0),
    estimatedMinutesWatched: Number(summaryValues[1] || 0),
    averageViewDuration: Number(summaryValues[2] || 0),
    subscribersGained: Number(summaryValues[3] || 0),
    subscribersLost: Number(summaryValues[4] || 0),
    topVideos: topRows.map((row) => ({
      videoId: String(row[0] || ''),
      title: titles.get(String(row[0] || ''))?.title || String(row[0] || ''),
      thumbnail: titles.get(String(row[0] || ''))?.thumbnail || '',
      publishedAt: titles.get(String(row[0] || ''))?.publishedAt || '',
      views: Number(row[1] || 0),
      estimatedMinutesWatched: Number(row[2] || 0),
    })),
    daily: (daily.rows || []).map((row) => ({
      date: String(row[0] || ''),
      views: Number(row[1] || 0),
      estimatedMinutesWatched: Number(row[2] || 0),
      subscribersGained: Number(row[3] || 0),
      subscribersLost: Number(row[4] || 0),
    })),
    details: { titlesAvailable },
  };
};



const youtubeAuthUrl = (env) => {
  const params = new URLSearchParams({
    client_id: env.YOUTUBE_CLIENT_ID,
    redirect_uri: YOUTUBE_REDIRECT_URI,
    response_type: 'code',
    scope: [YOUTUBE_ANALYTICS_SCOPE, YOUTUBE_READ_SCOPE].join(' '),
    access_type: 'offline',
    include_granted_scopes: 'true',
    prompt: 'consent',
  });
  return 'https://accounts.google.com/o/oauth2/v2/auth?' + params.toString();
};

const youtubeCallback = async (url, env) => {
  const error = url.searchParams.get('error');
  if (error) return json({ error: 'YouTube authorization denied', detail: error }, 400);
  const code = url.searchParams.get('code');
  if (!code) return json({ error: 'Missing YouTube authorization code' }, 400);
  const response = await fetch(GOOGLE_TOKEN_URL, {
    method: 'POST',
    headers: { 'content-type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      code,
      client_id: env.YOUTUBE_CLIENT_ID,
      client_secret: env.YOUTUBE_CLIENT_SECRET,
      redirect_uri: YOUTUBE_REDIRECT_URI,
      grant_type: 'authorization_code',
    }),
  });
  const body = await response.json();
  if (!response.ok) {
    return json({ error: 'YouTube token exchange failed', detail: body.error || 'oauth_error' }, 502);
  }
  if (!body.refresh_token) {
    return json({
      error: 'No YouTube refresh token returned',
      detail: 'Revoke the app grant and authorize again with consent.',
    }, 502);
  }

  // The refresh token is shown once so the owner can store it directly as a
  // Cloudflare secret. It is never committed to GitHub or persisted by this Worker.
  return json({
    ok: true,
    message: 'YouTube authorization complete. Store refreshToken as YOUTUBE_REFRESH_TOKEN in Cloudflare, then close this page.',
    refreshToken: body.refresh_token,
  });
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
          'access-control-allow-methods': 'GET, POST, OPTIONS',
          'access-control-allow-headers': 'content-type',
          'access-control-max-age': '86400',
          vary: 'Origin',
        },
      });
    }

    if (request.method === 'GET' && url.pathname === '/oauth/youtube/start') {
      if (!youtubeOAuthConfigured(env)) return json({ error: 'YouTube OAuth client is not configured' }, 503);
      return Response.redirect(youtubeAuthUrl(env), 302);
    }

    if (request.method === 'GET' && url.pathname === YOUTUBE_REDIRECT_PATH) {
      if (!youtubeOAuthConfigured(env)) return json({ error: 'YouTube OAuth client is not configured' }, 503);
      return youtubeCallback(url, env);
    }

    if (request.method === 'POST' && url.pathname === '/admin/youtube-reporting/setup') {
      if (origin !== allowed) return json({ error: 'Forbidden origin' }, 403);
      try {
        const token = await youtubeAccessToken(env);
        const setup = await youtubeReportingSetup(token);
        return json({ ok: true, reporting: setup }, 200, allowed);
      } catch (error) {
        return json({ error: 'YouTube Reporting setup failed', detail: error.message }, 502, allowed);
      }
    }

    if (request.method === 'GET' && url.pathname === '/') {
      return json({
        service: 'aupositeur-google-insights',
        status: 'ok',
        configured: Boolean(env.GOOGLE_SERVICE_ACCOUNT_EMAIL && env.GOOGLE_PRIVATE_KEY),
        analytics: Boolean(env.GA4_PROPERTY_ID),
        searchConsole: Boolean(env.SEARCH_CONSOLE_SITE_URL),
        youtubeOAuth: youtubeOAuthConfigured(env),
        youtubeAuthorized: Boolean(env.YOUTUBE_REFRESH_TOKEN),
      }, 200, origin === allowed ? allowed : '');
    }

    if (request.method !== 'GET' || url.pathname !== '/admin/insights') {
      return json({ error: 'Not found' }, 404, origin === allowed ? allowed : '');
    }

    // Aggregate read-only metrics only. Google credentials remain server-side.
    // Browser access is limited by CORS to the production Studio origin.
    if (origin !== allowed) return json({ error: 'Forbidden origin' }, 403);

    if (!env.GOOGLE_SERVICE_ACCOUNT_EMAIL || !env.GOOGLE_PRIVATE_KEY) {
      return json({ error: 'Google service account is not configured' }, 503, allowed);
    }

    try {
      const token = await accessToken(env);
      const [ga, gsc, youtube] = await Promise.all([
        analytics(env, token).catch((error) => ({ configured: Boolean(env.GA4_PROPERTY_ID), error: error.message })),
        searchConsole(env, token).catch((error) => ({ configured: Boolean(env.SEARCH_CONSOLE_SITE_URL), error: error.message })),
        youtubeInsights(env).catch((error) => ({ configured: Boolean(env.YOUTUBE_REFRESH_TOKEN), error: error.message })),
      ]);
      return json({ ok: true, analytics: ga, searchConsole: gsc, youtube, generatedAt: new Date().toISOString() }, 200, allowed);
    } catch (error) {
      return json({ error: 'Google authentication failed', detail: error.message }, 502, allowed);
    }
  },
};
