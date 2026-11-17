import { readFile, writeFile } from 'node:fs/promises';
import { defineConfig } from 'astro/config';

const adminDirectoryIndex = {
  name: 'admin-directory-index',
  hooks: {
    'astro:build:done': async ({ dir }) => {
      const branch = process.env.CF_PAGES_BRANCH;
      if (!branch || branch === 'main') return;

      const path = new URL('admin/config.yml', dir);
      const config = await readFile(path, 'utf8');
      if (!/^  branch: main$/m.test(config)) {
        throw new Error('Expected the production branch in the Decap configuration');
      }
      await writeFile(path, config.replace(/^  branch: main$/m, () => '  branch: ' + JSON.stringify(branch)));
    },
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
  site: 'https://www.aupositeur.be',
  output: 'static',
  build: { format: 'directory' },
  integrations: [adminDirectoryIndex],
});
