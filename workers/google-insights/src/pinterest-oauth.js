const TOKEN_URL = 'https://api.pinterest.com/v5/oauth/token';
export const PINTEREST_CALLBACK = '/oauth/pinterest/callback';
export const PINTEREST_REDIRECT_URI = 'https://aupositeur-google-insights.nicolas-rugolo.workers.dev' + PINTEREST_CALLBACK;
const WEEK = 7 * 86400 * 1000;
const COOKIE = 'aup_pinterest_state';
const SCOPES = ['user_accounts:read', 'pins:read'];
const headers = { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store', 'referrer-policy': 'no-referrer', 'x-content-type-options': 'nosniff' };
const json = (value, status = 200) => new Response(JSON.stringify(value), { status, headers });
const safeError = (message, status = 502) => Object.assign(new Error(message), { status });
export const pinterestOAuthConfigured = env => Boolean(env.PINTEREST_CLIENT_ID && env.PINTEREST_CLIENT_SECRET && env.PINTEREST_OAUTH);
const object = env => env.PINTEREST_OAUTH.get(env.PINTEREST_OAUTH.idFromName('aupositeur-pinterest-v1'));

async function tokenRequest(env, params) {
  const response = await fetch(TOKEN_URL, {
    method: 'POST', headers: { authorization: 'Basic ' + btoa(env.PINTEREST_CLIENT_ID + ':' + env.PINTEREST_CLIENT_SECRET), 'content-type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams(params), signal: AbortSignal.timeout(15000),
  });
  const body = await response.json().catch(() => ({}));
  if (!response.ok || !body.access_token) {
    if (body.error === 'invalid_grant') throw safeError('L’autorisation Pinterest a expiré ou a été révoquée. Reconnecter Pinterest.', 401);
    if (body.error === 'invalid_client' || response.status === 401) throw safeError('Identifiants de l’application Pinterest refusés. Vérifier PINTEREST_CLIENT_SECRET dans Cloudflare.', 503);
    throw safeError('Pinterest ne permet pas le renouvellement pour le moment. Réessayer plus tard.');
  }
  if (typeof body.access_token !== 'string' || !Number.isFinite(Number(body.expires_in)) || Number(body.expires_in) <= 0) throw safeError('Réponse OAuth Pinterest incomplète.');
  return body;
}

// This class is only addressable through the private Durable Object binding.
// Credentials never leave Cloudflare or appear in dashboard/API responses.
export class PinterestOAuthStore {
  constructor(state, env) { this.state = state; this.env = env; }

  async save(body, previous = {}) {
    const refreshToken = body.refresh_token || previous.refreshToken;
    if (!refreshToken) throw safeError('Pinterest n’a pas fourni de jeton de renouvellement. Reconnecter Pinterest.', 401);
    const record = {
      accessToken: body.access_token, refreshToken,
      expiresAt: Date.now() + Number(body.expires_in) * 1000,
      refreshExpiresAt: body.refresh_token_expires_at ? Number(body.refresh_token_expires_at) * 1000 : (body.refresh_token_expires_in ? Date.now() + Number(body.refresh_token_expires_in) * 1000 : previous.refreshExpiresAt),
      accountId: previous.accountId, username: previous.username,
      updatedAt: Date.now(), needsReauthorization: false,
    };
    // Persist the new refresh token before returning the access token.
    await this.state.storage.put('tokens', record);
    await this.state.storage.setAlarm(Date.now() + Math.max(60000, Math.min(WEEK, Number(body.expires_in) * 1000 / 2)));
    return record;
  }

  async fresh(force = false) {
    const record = await this.state.storage.get('tokens');
    if (!record || record.needsReauthorization) throw safeError('Autorisation Pinterest requise. Cliquer sur Connecter Pinterest.', 401);
    if (!force && record.expiresAt > Date.now() + 300000) return record;
    try {
      const body = await tokenRequest(this.env, { grant_type: 'refresh_token', refresh_token: record.refreshToken });
      return await this.save(body, record);
    } catch (error) {
      if (error.status === 401) await this.state.storage.put('tokens', { ...record, needsReauthorization: true });
      throw error;
    }
  }

  async fetch(request) {
    // Serialize refresh/authorization operations so concurrent dashboard requests
    // cannot overwrite a rotated refresh token with an older one.
    return this.state.blockConcurrencyWhile(async () => {
      try {
        const path = new URL(request.url).pathname;
        if (path === '/authorize' && request.method === 'POST') {
          const { code } = await request.json();
          if (typeof code !== 'string' || !code) return json({ error: 'Code Pinterest absent.' }, 400);
          const body = await tokenRequest(this.env, { grant_type: 'authorization_code', code, redirect_uri: PINTEREST_REDIRECT_URI });
          const scopes = String(body.scope || '').split(/[ ,]+/);
          if (!SCOPES.every(scope => scopes.includes(scope))) throw safeError('Les permissions de lecture Pinterest requises n’ont pas été accordées.', 403);
          const profileResponse = await fetch('https://api.pinterest.com/v5/user_account', { headers: { authorization: 'Bearer ' + body.access_token }, signal: AbortSignal.timeout(15000) });
          if (!profileResponse.ok) throw safeError('Impossible de vérifier le compte Pinterest.');
          const profile = await profileResponse.json();
          if (String(profile.username || '').toLowerCase() !== String(this.env.PINTEREST_USERNAME || '').toLowerCase() || !this.env.PINTEREST_USERNAME) throw safeError('Ce compte Pinterest ne correspond pas au compte Aupositeur attendu.', 403);
          if (!/^\d+$/.test(String(profile.id || ''))) throw safeError('L’identifiant du compte Pinterest est absent.');
          const previous = await this.state.storage.get('tokens');
          if (previous?.accountId && previous.accountId !== String(profile.id)) throw safeError('Le compte Pinterest autorisé est différent du compte déjà connecté.', 403);
          await this.save(body, { accountId: String(profile.id), username: profile.username });
          return json({ ok: true });
        }
        if (path === '/token' && request.method === 'GET') {
          const record = await this.fresh();
          return json({ accessToken: record.accessToken });
        }
        return json({ error: 'Not found' }, 404);
      } catch (error) { return json({ error: error.status ? error.message : 'Connexion Pinterest temporairement indisponible.' }, error.status || 502); }
    });
  }

  async alarm() {
    await this.state.blockConcurrencyWhile(async () => {
      try { await this.fresh(true); }
      catch (error) {
        // Transient failures are retried; revoked grants need the owner's consent.
        if (error.status !== 401) await this.state.storage.setAlarm(Date.now() + 3600000);
      }
    });
  }
}

export async function pinterestAccessToken(env) {
  if (pinterestOAuthConfigured(env)) {
    const response = await object(env).fetch('https://pinterest.internal/token');
    const body = await response.json();
    if (!response.ok) throw safeError(body.error || 'Reconnexion Pinterest requise.', response.status);
    return body.accessToken;
  }
  // Keep the previously configured test integration usable during setup only.
  return String(env.PINTEREST_ACCESS_TOKEN || '').trim();
}

const page = (message, status = 200) => new Response('<!doctype html><html lang="fr"><meta charset="utf-8"><meta name="viewport" content="width=device-width"><title>Connexion Pinterest — AUPOSITEUR</title><style>body{max-width:640px;margin:12vh auto;padding:24px;background:#f7f3eb;color:#222;font:18px/1.6 system-ui}h1{font-family:Georgia,serif}a{color:#a94e2f}</style><h1>Connexion Pinterest</h1><p>' + message + '</p><a href="https://www.aupositeur.be/admin/">Retour au tableau de bord</a></html>', { status, headers: { ...headers, 'content-type': 'text/html; charset=utf-8', 'content-security-policy': "default-src 'none'; style-src 'unsafe-inline'; base-uri 'none'; frame-ancestors 'none'" } });

export async function pinterestOAuthRoute(request, env) {
  const url = new URL(request.url);
  if (!pinterestOAuthConfigured(env)) return page('Configuration à terminer : ajouter le secret PINTEREST_CLIENT_SECRET dans le Worker Cloudflare. L’adresse de retour Pinterest doit être enregistrée dans ton application.', 503);
  if (url.pathname === '/oauth/pinterest/start') {
    const state = crypto.randomUUID();
    const target = new URL('https://www.pinterest.com/oauth/');
    Object.entries({ client_id: env.PINTEREST_CLIENT_ID, redirect_uri: PINTEREST_REDIRECT_URI, response_type: 'code', scope: SCOPES.join(','), state }).forEach(([key, value]) => target.searchParams.set(key, value));
    return new Response(null, { status: 302, headers: { location: target.toString(), 'cache-control': 'no-store', 'set-cookie': COOKIE + '=' + state + '; Path=/oauth/pinterest; HttpOnly; Secure; SameSite=Lax; Max-Age=600' } });
  }
  const state = url.searchParams.get('state');
  const cookie = (request.headers.get('Cookie') || '').split(';').map(value => value.trim()).find(value => value.startsWith(COOKIE + '='));
  if (!state || !cookie || cookie.slice(COOKIE.length + 1) !== state) return page('Session invalide ou expirée. Relance la connexion depuis le tableau de bord.', 400);
  let response;
  if (url.searchParams.has('error')) response = page('L’autorisation Pinterest a été refusée. Tu peux relancer la connexion.', 400);
  else {
    const code = url.searchParams.get('code');
    if (!code) response = page('Le code d’autorisation Pinterest est absent.', 400);
    else {
      const result = await object(env).fetch('https://pinterest.internal/authorize', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ code }) });
      const data = await result.json();
      // Do not insert upstream response text into HTML or expose tokens.
      response = result.ok && data.ok ? page('Pinterest est connecté. Les jetons sont enregistrés côté serveur et seront renouvelés automatiquement. Tu peux fermer cette page et actualiser le tableau de bord.') : page('Connexion non enregistrée. Vérifie le compte Aupositeur, la clé secrète et les permissions de lecture Pinterest, puis recommence.', result.status);
    }
  }
  response.headers.set('set-cookie', COOKIE + '=; Path=/oauth/pinterest; HttpOnly; Secure; SameSite=Lax; Max-Age=0');
  return response;
}
