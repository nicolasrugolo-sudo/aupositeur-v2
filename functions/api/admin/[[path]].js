// Cloudflare Pages Function: same-origin Community Studio admin API gateway.
// Cloudflare Access protects /api/admin/* on www.aupositeur.be.
// The Community API independently validates the forwarded Access JWT.
export async function onRequest(context) {
  const request = context.request;
  const url = new URL(request.url);
  if (!url.pathname.startsWith("/api/admin/")) {
    return new Response(JSON.stringify({error:"Route inconnue"}),{status:404,headers:{"content-type":"application/json"}});
  }
  const jwt = request.headers.get("cf-access-jwt-assertion");
  if (!jwt) {
    return new Response(JSON.stringify({error:"Authentification Cloudflare Access requise"}), {
      status:403, headers:{"content-type":"application/json","cache-control":"no-store"}
    });
  }
  const target = new URL(request.url);
  target.hostname = "community-api.aupositeur.be";
  const upstream = await fetch(new Request(target.toString(), request));
  const headers = new Headers(upstream.headers);
  headers.set("cache-control","no-store");
  headers.delete("set-cookie");
  return new Response(upstream.body,{status:upstream.status,headers});
}
