import type { APIRoute } from 'astro';
import { getCollection } from 'astro:content';

export const prerender = true;

const SITE = 'https://www.aupositeur.be';

const staticPaths = [
  '/',
  '/a-propos/',
  '/ecrits/',
  '/citations/',
  '/musiques/',
  '/livres/',
  '/mentions-legales/',
  '/politique-de-confidentialite/',
];

export const GET: APIRoute = async () => {
  const [poemes, citations] = await Promise.all([
    getCollection('poemes'),
    getCollection('citations'),
  ]);

  const dynamicPaths = [
    ...poemes.filter(({ data }) => !data.draft).map(({ id }) => `/ecrits/${id}/`),
    ...citations.filter(({ data }) => !data.draft).map(({ id }) => `/citations/${id}/`),
  ];

  const urls = [...staticPaths, ...dynamicPaths]
    .map((path) => `  <url><loc>${SITE}${path}</loc></url>`)
    .join('\n');

  return new Response(
    `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${urls}\n</urlset>\n`,
    { headers: { 'Content-Type': 'application/xml; charset=utf-8' } },
  );
};
