export async function routeStudioService(request, env, url) {
  const serviceMatch = /^\/(?:api\/admin|admin\/api)\/(studio-audio|studio-insights|studio-shop|studio-social)(\/.*)$/.exec(url.pathname);
  if (serviceMatch) {
    const authorization = request.headers.get("authorization") || "";
    if (!/^Bearer [A-Za-z0-9_]{20,255}$/i.test(authorization)) {
      return Response.json({ error: "Accès administrateur refusé" }, {
        status: 403, headers: { "cache-control": "no-store" },
      });
    }
    const [host, binding] = {
      "studio-audio": ["aupositeur-media-api.nicolas-rugolo.workers.dev", env.STUDIO_AUDIO],
      "studio-insights": ["aupositeur-google-insights.nicolas-rugolo.workers.dev", env.STUDIO_INSIGHTS],
      "studio-shop": ["aupositeur-shop-api.nicolas-rugolo.workers.dev", env.STUDIO_SHOP],
      "studio-social": ["aupositeur-social-api.nicolas-rugolo.workers.dev", env.STUDIO_SOCIAL],
    }[serviceMatch[1]];
    const headers = new Headers({ authorization, origin: "https://www.aupositeur.be" });
    const contentType = request.headers.get("content-type");
    if (contentType) headers.set("content-type", contentType);
    const endpoint = new URL("https://" + host);
    endpoint.pathname = (serviceMatch[1] === "studio-social" ? "/api/admin/social" : "/admin") + serviceMatch[2];
    endpoint.search = url.search;
    const forwarded = new Request(endpoint, {
      method: request.method,
      headers,
      body: request.method === "GET" || request.method === "HEAD" ? undefined : request.body,
      redirect: "manual",
    });
    let upstream;
    try {
      if (serviceMatch[1] === "studio-social" && !binding) throw Error("Missing Social binding");
      upstream = await (binding ? binding.fetch(forwarded) : fetch(forwarded));
    } catch {
      return Response.json({ error: "Le service Studio est indisponible" }, {
        status: 502, headers: { "cache-control": "no-store" },
      });
    }
    if (upstream.status >= 300 && upstream.status < 400) {
      return Response.json({ error: "Réponse inattendue du service Studio" }, {
        status: 502, headers: { "cache-control": "no-store" },
      });
    }
    const responseHeaders = new Headers(upstream.headers);
    responseHeaders.set("cache-control", "no-store");
    responseHeaders.delete("set-cookie");
    return new Response(upstream.body, { status: upstream.status, headers: responseHeaders });
  }
  return null;
}
