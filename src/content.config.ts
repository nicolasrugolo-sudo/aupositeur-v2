import { defineCollection, z } from 'astro:content';
import { glob } from 'astro/loaders';

const poemes = defineCollection({
  loader: glob({ pattern: '**/*.{md,mdx}', base: './src/content/poemes' }),
  schema: z.object({
    title: z.string(),
    year: z.number().optional(),
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

export const collections = {
  musiques, poemes, citations };

