import { defineCollection, z } from 'astro:content';
import { glob } from 'astro/loaders';

const poemes = defineCollection({
  loader: glob({ pattern: '**/*.{md,mdx}', base: './src/content/poemes' }),
  schema: z.object({
    title: z.string(),
    year: z.number().optional(),
    createdAt: z.coerce.date().optional(),
    description: z.string(),
    themes: z.array(z.string()).default([]),
    featured: z.boolean().default(false),
    draft: z.boolean().default(false),
  }),
});

const citations = defineCollection({
  loader: glob({ pattern: '**/*.{md,mdx}', base: './src/content/citations' }),
  schema: z.object({
    text: z.string(),
    author: z.string().default('Aupositeur'),
    createdAt: z.coerce.date().optional(),
    source: z.string().optional(),
    video: z.string().optional(),
    context: z.string().optional(),
    featured: z.boolean().default(false),
    draft: z.boolean().default(false),
  }),
});

const musiques = defineCollection({
  loader: glob({ pattern: '**/*.md', base: './src/content/musiques' }),
  schema: z.object({
    title: z.string(),
    youtubeId: z.string(),
    kind: z.enum(['composition', 'reprise']),
    order: z.number().int(),
    featured: z.boolean().default(false),
    draft: z.boolean().default(false),
  }),
});


const livres = defineCollection({
  loader: glob({ pattern: '**/*.md', base: './src/content/livres' }),
  schema: z.object({
    title: z.string(),
    slug: z.string(),
    subtitle: z.string().optional(),
    cover: z.string(),
    author: z.string(),
    illustrator: z.string().optional(),
    publisher: z.string().optional(),
    price: z.number(),
    currency: z.string().default('EUR'),
    purchaseUrl: z.string().url(),
    lead: z.string(),
    description: z.string(),
    featured: z.boolean().default(false),
    draft: z.boolean().default(false),
  }),
});

const boutique = defineCollection({
  loader: glob({ pattern: '**/*.md', base: './src/content/boutique' }),
  schema: z.object({
    title: z.string(),
    slug: z.string(),
    number: z.string(),
    quote: z.string(),
    price: z.number(),
    currency: z.string().default('EUR'),
    productType: z.string(),
    size: z.string(),
    featured: z.boolean().default(false),
    draft: z.boolean().default(false),
  }),
});
export const collections = {
  musiques,
  livres,
  boutique,
  poemes,
  citations,
};
