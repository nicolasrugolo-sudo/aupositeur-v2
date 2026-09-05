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
  site: 'https://aupositeur.be',
  output: 'static',
  build: { format: 'directory' },
  integrations: [adminDirectoryIndex],
});
