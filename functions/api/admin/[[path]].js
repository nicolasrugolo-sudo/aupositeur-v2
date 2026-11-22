// Cloudflare Pages Function: same-origin Community Studio admin API gateway.
// Cloudflare Access protects /api/admin/* on www.aupositeur.be.
// The Community API independently validates the forwarded Access JWT.
export async function onRequest(context) {
  const request = context.request;
  const url = new URL(request.url);
  if (!url.pathname.startsWith("/api/admin/")) {
    return new Response(JSON.stringify({error:"Route inconnue"}),{status:404,headers:{"content-type":"application/json"}});
  }
  // Access normally injects a signed assertion header. On some Pages
  // deployments the signed CF_Authorization browser cookie is available
  // instead. Forward it ONLY as a candidate token: the downstream Worker
  // must verify its RS256 signature, issuer, expiry and audience.
  const cookie = request.headers.get("cookie") || "";
  const accessCookie = cookie.split(";").map(part => part.trim()).find(part => part.startsWith("CF_Authorization="));
  const jwt = request.headers.get("cf-access-jwt-assertion") ||
    (accessCookie ? accessCookie.slice("CF_Authorization=".length) : "");
  const githubAuth = /^Bearer [A-Za-z0-9_]{20,255}$/i.test(request.headers.get("authorization") || "");
  if (!jwt && !githubAuth) {
    return new Response(JSON.stringify({error:"Authentification Cloudflare Access requise",hint:"Aucune session Access transmise à la passerelle. Ouvrir l'API protégée pour s'authentifier."}), {
      status:403, headers:{"content-type":"application/json","cache-control":"no-store"}
    });
  }
  const target = new URL(request.url);
  target.hostname = "community-api.aupositeur.be";
  const headers = new Headers(request.headers);
  if (jwt) headers.set("cf-access-jwt-assertion", jwt);
  else headers.delete("cf-access-jwt-assertion");
  headers.delete("cookie");
  const upstream = await fetch(new Request(target.toString(), {
    method:request.method, headers,
    body: request.method==="GET"||request.method==="HEAD" ? undefined : request.body,
    redirect:"manual"
  }));
  const responseHeaders = new Headers(upstream.headers);
  responseHeaders.set("cache-control","no-store");
  responseHeaders.delete("set-cookie");
  return new Response(upstream.body,{status:upstream.status,headers:responseHeaders});
}
