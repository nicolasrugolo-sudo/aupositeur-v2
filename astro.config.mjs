import { defineConfig } from 'astro/config';

export default defineConfig({
  // Adresse de prévisualisation. Elle sera remplacée par le domaine final
  // uniquement après validation et basculement explicite.
  site: 'https://aupositeur-v2.nicolas-rugolo.workers.dev',
  output: 'static',
  build: { format: 'directory' },
});
