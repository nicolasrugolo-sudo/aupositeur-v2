import { defineConfig } from 'astro/config';

const adminDirectoryIndex = {
  name: 'admin-directory-index',
  hooks: {
    'astro:server:setup': ({ server }) => {
      server.middlewares.use((request, _response, next) => {
        if (request.url === '/admin' || request.url === '/admin/') {
          request.url = '/admin/index.html';
        }
        next();
      });
    },
  },
};

export default defineConfig({
  // Adresse de prévisualisation. Elle sera remplacée par le domaine final
  // uniquement après validation et basculement explicite.
  site: 'https://aupositeur-v2.nicolas-rugolo.workers.dev',
  output: 'static',
  build: { format: 'directory' },
  integrations: [adminDirectoryIndex],
});
