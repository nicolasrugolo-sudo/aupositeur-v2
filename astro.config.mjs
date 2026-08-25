import { defineConfig } from 'astro/config';

export default defineConfig({
  site: 'https://www.aupositeur.be',
  output: 'static',
  build: { format: 'directory' },
});

