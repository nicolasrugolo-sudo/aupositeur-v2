const policy = [
  "default-src 'self'",
  "script-src 'self' 'unsafe-inline'",
  "style-src 'self' 'unsafe-inline'",
  "img-src 'self' data: blob:",
  "media-src 'self' blob:",
  "font-src 'self' data:",
  "connect-src 'none'",
  "form-action 'none'",
  "frame-src 'none'",
  "frame-ancestors 'none'",
  "object-src 'none'",
  "base-uri 'none'"
].join("; ");

export default {
  async fetch(request, env) {
    const headers = new Headers({
      "X-Robots-Tag": "noindex, nofollow",
      "Content-Security-Policy": policy,
      "Referrer-Policy": "no-referrer",
      "X-Content-Type-Options": "nosniff",
    });
    const reject = status => new Response(null, { status, headers });
    if (!["GET", "HEAD"].includes(request.method)) return reject(405);

    let path;
    try {
      path = decodeURIComponent(new URL(request.url).pathname).replaceAll("\\", "/").replace(/\/+/g, "/").toLowerCase();
    } catch {
      return reject(400);
    }
    if (path.includes("%") || /(?:^|\/)\.\.?(?:\/|$)/.test(path)) return reject(404);
    if (/^\/(?:admin|api|communaute|studio-test|_worker\.js|_headers|_redirects)(?:\/|$)/.test(path) || path === "/studio-content.json") return reject(404);

    const asset = await env.ASSETS.fetch(request);
    const response = new Response(asset.body, asset);
    for (const [key, value] of headers) response.headers.set(key, value);
    return response;
  },
};
