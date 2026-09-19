import type { APIRoute } from 'astro';
import { getCollection } from 'astro:content';

const escapeXml = (value: string) => value
  .replace(/&/g, '&amp;')
  .replace(/</g, '&lt;')
  .replace(/>/g, '&gt;')
  .replace(/"/g, '&quot;')
  .replace(/'/g, '&apos;');

export const GET: APIRoute = async ({ site }) => {
  const base = site ?? new URL('https://www.aupositeur.be');
  const [poemes, citations, livres] = await Promise.all([
    getCollection('poemes'),
    getCollection('citations'),
    getCollection('livres'),
  ]);

  const paths = new Set<string>([
    '/',
    '/a-propos/',
    '/ecrits/',
    '/citations/',
    '/musique/',
    '/livres/',
    '/boutique/',
  ]);

  poemes.filter(({ data }) => !data.draft).forEach(({ id }) => paths.add(`/ecrits/${encodeURIComponent(id)}/`));
  citations.filter(({ data }) => !data.draft).forEach(({ id }) => paths.add(`/citations/${encodeURIComponent(id)}/`));
  livres.filter(({ data }) => !data.draft).forEach(({ data, id }) => paths.add(`/livres/${encodeURIComponent(data.slug || id)}/`));

  const urls = [...paths]
    .map((path) => `  <url><loc>${escapeXml(new URL(path, base).href)}</loc></url>`)
    .join('\n');

  const xml = `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${urls}\n</urlset>\n`;

  return new Response(xml, {
    headers: { 'Content-Type': 'application/xml; charset=utf-8' },
  });
};
