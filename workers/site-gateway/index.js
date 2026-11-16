// Same-origin Studio gateway. Never expose an unauthenticated admin route.
// The downstream Community Worker independently verifies Cloudflare Access JWT.
export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    if (!url.pathname.startsWith("/api/admin/")) {
      return env.ASSETS.fetch(request);
    }
    if (!env.COMMUNITY_API) {
      return new Response(JSON.stringify({error:"Service Communauté indisponible"}), {
        status:503, headers:{"content-type":"application/json","cache-control":"no-store"}
      });
    }
    // A Cloudflare Access application must protect /api/admin/* on this
    // hostname. Never manufacture an Access JWT or trust browser-supplied roles.
    const target = new URL(request.url);
    target.hostname = "community-api.aupositeur.be";
    const forwarded = new Request(target.toString(), request);
    const response = await env.COMMUNITY_API.fetch(forwarded);
    const headers = new Headers(response.headers);
    headers.set("cache-control","no-store");
    return new Response(response.body,{status:response.status,headers});
  }
};
