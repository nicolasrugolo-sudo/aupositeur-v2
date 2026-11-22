import { routeStudioService } from '../../../workers/shared/studio-gateway.js';

export async function onRequest({ request, env }) {
  const url = new URL(request.url);
  if (url.hostname !== 'www.aupositeur.be') return new Response(null, { status: 404 });
  return await routeStudioService(request, env, url) ?? new Response(null, { status: 404 });
}
