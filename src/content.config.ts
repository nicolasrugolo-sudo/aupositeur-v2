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

export const collections = { poemes };

