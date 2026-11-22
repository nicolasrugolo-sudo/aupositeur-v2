export async function routeStudioService(request, env, url) {
  const serviceMatch = /^\/api\/admin\/(studio-audio|studio-insights)(\/.*)$/.exec(url.pathname);
  if (serviceMatch) {
    const authorization = request.headers.get("authorization") || "";
    if (!/^Bearer [A-Za-z0-9_]{20,255}$/i.test(authorization)) {
      return Response.json({ error: "Accès administrateur refusé" }, {
        status: 403, headers: { "cache-control": "no-store" },
      });
    }
    const host = serviceMatch[1] === "studio-audio"
      ? "aupositeur-media-api.nicolas-rugolo.workers.dev"
      : "aupositeur-google-insights.nicolas-rugolo.workers.dev";
    const headers = new Headers({ authorization, origin: "https://www.aupositeur.be" });
    const contentType = request.headers.get("content-type");
    if (contentType) headers.set("content-type", contentType);
    const endpoint = new URL("https://" + host);
    endpoint.pathname = "/admin" + serviceMatch[2];
    endpoint.search = url.search;
    const forwarded = new Request(endpoint, {
      method: request.method,
      headers,
      body: request.method === "GET" || request.method === "HEAD" ? undefined : request.body,
      redirect: "manual",
    });
    const binding = serviceMatch[1] === "studio-audio"
      ? env.STUDIO_AUDIO
      : env.STUDIO_INSIGHTS;
    let upstream;
    try {
      if (!binding) throw new Error("Missing service binding");
      upstream = await binding.fetch(forwarded);
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
