interface Env {
  GITHUB_OAUTH_ID: string;
  GITHUB_OAUTH_SECRET: string;
  GITHUB_REPO_PRIVATE?: string;
  DECAP_SITE_ORIGIN: string;
}

const githubAuthorizeUrl = 'https://github.com/login/oauth/authorize';
const githubTokenUrl = 'https://github.com/login/oauth/access_token';
const stateCookie = 'aupositeur_oauth_state';

const randomHex = (bytes: number): string => {
  const buffer = new Uint8Array(bytes);
  crypto.getRandomValues(buffer);
  return Array.from(buffer, (byte) => byte.toString(16).padStart(2, '0')).join('');
};

const readCookie = (request: Request, name: string): string | undefined => {
  const cookies = request.headers.get('Cookie')?.split(';') ?? [];
  for (const cookie of cookies) {
    const [key, ...value] = cookie.trim().split('=');
    if (key === name) return decodeURIComponent(value.join('='));
  }
};

const callbackResponse = (token: string, targetOrigin: string): Response => {
  const payload = JSON.stringify({ token }).replaceAll('<', '\u003c');
  const origin = JSON.stringify(targetOrigin);
  const html = `<!doctype html>
<html lang="fr"><head><meta charset="utf-8"><title>Connexion Decap</title></head>
<body><p>Connexion à Decap CMS…</p><script>
const receiveMessage = () => {
  window.opener.postMessage('authorization:github:success:${payload}', ${origin});
  window.removeEventListener('message', receiveMessage, false);
};
window.addEventListener('message', receiveMessage, false);
window.opener.postMessage('authorizing:github', ${origin});
</script></body></html>`;
  return new Response(html, {
    headers: {
      'Content-Type': 'text/html; charset=utf-8',
      'Content-Security-Policy': "default-src 'none'; script-src 'unsafe-inline'; style-src 'none'; img-src 'none'",
      'Referrer-Policy': 'no-referrer',
      'Set-Cookie': `${stateCookie}=; HttpOnly; Secure; SameSite=Lax; Path=/; Max-Age=0`,
    },
  });
};

const handleAuth = (url: URL, env: Env): Response => {
  if (url.searchParams.get('provider') !== 'github') return new Response('Invalid provider', { status: 400 });
  if (!env.GITHUB_OAUTH_ID || !env.GITHUB_OAUTH_SECRET) return new Response('OAuth secrets are not configured', { status: 503 });
  const state = randomHex(16);
  const authorize = new URL(githubAuthorizeUrl);
  authorize.searchParams.set('client_id', env.GITHUB_OAUTH_ID);
  authorize.searchParams.set('redirect_uri', `${url.origin}/callback`);
  authorize.searchParams.set('scope', env.GITHUB_REPO_PRIVATE === '1' ? 'repo,user' : 'public_repo,user');
  authorize.searchParams.set('state', state);
  return new Response(null, {
    status: 302,
    headers: {
      Location: authorize.toString(),
      'Set-Cookie': `${stateCookie}=${state}; HttpOnly; Secure; SameSite=Lax; Path=/; Max-Age=600`,
      'Cache-Control': 'no-store',
    },
  });
};

const handleCallback = async (request: Request, url: URL, env: Env): Promise<Response> => {
  const code = url.searchParams.get('code');
  const state = url.searchParams.get('state');
  if (!code || !state || state !== readCookie(request, stateCookie)) return new Response('Invalid OAuth callback', { status: 400 });
  const response = await fetch(githubTokenUrl, {
    method: 'POST',
    headers: { Accept: 'application/json', 'Content-Type': 'application/json' },
    body: JSON.stringify({
      client_id: env.GITHUB_OAUTH_ID,
      client_secret: env.GITHUB_OAUTH_SECRET,
      code,
      redirect_uri: `${url.origin}/callback`,
    }),
  });
  const result = await response.json() as { access_token?: string };
  if (!response.ok || !result.access_token) return new Response('GitHub token exchange failed', { status: 502 });
  return callbackResponse(result.access_token, env.DECAP_SITE_ORIGIN);
};

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);
    if (url.pathname === '/auth') return handleAuth(url, env);
    if (url.pathname === '/callback') return handleCallback(request, url, env);
    return new Response('Aupositeur Decap OAuth proxy', { headers: { 'Cache-Control': 'no-store' } });
  },
};
