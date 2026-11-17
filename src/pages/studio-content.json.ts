import type { APIRoute } from 'astro';
import { getCollection } from 'astro:content';

export const GET: APIRoute = async () => {
  const [citations, ecrits, musiques, livres, reflexions, categories] = await Promise.all([
    getCollection('citations'),
    getCollection('poemes'),
    getCollection('musiques'),
    getCollection('livres'),
    getCollection('reflexions'),
    getCollection('categories'),
  ]);

  const iso = (value?: Date) => value instanceof Date ? value.toISOString() : '';

  const payload = {
    generatedAt: new Date().toISOString(),
    categories: categories.map(({ id, data }) => ({ id, ...data })),
    collections: {
      reflexions: reflexions.map(({ id, data }) => ({slug:id,title:data.title,description:data.description||'',categories:data.categories,draft:data.draft,featured:data.featured,date:iso(data.createdAt)})),
      citations: citations.map(({ id, data }) => ({
        slug: id.replace(/\.(md|mdx)$/i, ''),
        title: data.text,
        description: '',
        categories: data.categories,
        draft: data.draft,
        featured: data.featured,
        date: iso(data.createdAt),
        author: data.author,
      })),
      ecrits: ecrits.map(({ id, data }) => ({
        slug: id.replace(/\.(md|mdx)$/i, ''),
        title: data.title,
        description: data.description || '',
        categories: data.categories,
        draft: data.draft,
        featured: data.featured,
        date: iso(data.createdAt),
      })),
      musiques: musiques.map(({ id, data }) => ({
        slug: id.replace(/\.md$/i, ''),
        title: data.title,
        description: data.descriptionCourte || '',
        categories: data.categories,
        draft: data.draft,
        featured: data.featured,
        date: iso(data.releaseDate),
        kind: data.kind,
        order: data.order,
        cover: data.cover || '',
        youtubeId: data.youtubeId || '',
      })),
      livres: livres.map(({ id, data }) => ({
        slug: id.replace(/\.md$/i, ''),
        title: data.title,
        description: data.description,
        publicSlug: data.slug,
        subtitle: data.subtitle || '',
        author: data.author,
        publisher: data.publisher || '',
        price: data.price,
        currency: data.currency,
        cover: data.cover,
        lead: data.lead,
        categories: data.categories,
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
