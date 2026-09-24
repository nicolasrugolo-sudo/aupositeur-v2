import type { APIRoute } from 'astro';
import { getCollection } from 'astro:content';

export const GET: APIRoute = async () => {
  const [citations, ecrits, musiques, livres] = await Promise.all([
    getCollection('citations'),
    getCollection('poemes'),
    getCollection('musiques'),
    getCollection('livres'),
  ]);

  const iso = (value?: Date) => value instanceof Date ? value.toISOString() : '';

  const payload = {
    generatedAt: new Date().toISOString(),
    collections: {
      citations: citations.map(({ id, data }) => ({
        slug: id.replace(/\.(md|mdx)$/i, ''),
        title: data.text,
        description: '',
        draft: data.draft,
        featured: data.featured,
        date: iso(data.createdAt),
        author: data.author,
      })),
      ecrits: ecrits.map(({ id, data }) => ({
        slug: id.replace(/\.(md|mdx)$/i, ''),
        title: data.title,
        description: data.description || '',
        draft: data.draft,
        featured: data.featured,
        date: iso(data.createdAt),
      })),
      musiques: musiques.map(({ id, data }) => ({
        slug: id.replace(/\.md$/i, ''),
        title: data.title,
        description: data.descriptionCourte || '',
        draft: data.draft,
        featured: data.featured,
        date: iso(data.releaseDate),
        kind: data.kind,
        cover: data.cover || '',
      })),
      livres: livres.map(({ id, data }) => ({
        slug: id.replace(/\.md$/i, ''),
        title: data.title,
        description: data.description,
        subtitle: data.subtitle || '',
        author: data.author,
        publisher: data.publisher || '',
        price: data.price,
        currency: data.currency,
        cover: data.cover,
        lead: data.lead,
        draft: data.draft,
        featured: data.featured,
        date: '',
      })),
    },
  };

  return new Response(JSON.stringify(payload), {
    headers: {
      'Content-Type': 'application/json; charset=utf-8',
      'Cache-Control': 'no-cache',
    },
  });
};
